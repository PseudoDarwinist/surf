/**
 * Claude Agent SDK Handler for Electron Main Process
 *
 * This module handles Claude Agent SDK operations from the main process,
 * which has access to Node.js APIs required by the SDK.
 */

import { ipcMain } from 'electron'
import { homedir } from 'os'
import { existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

// Store for active abort controllers
const activeAbortControllers = new Map<string, AbortController>()

// Check if SDK is available (lazy load to avoid issues)
let sdkModule: any = null
let sdkLoadAttempted = false
let sdkLoadError: string | null = null
let claudeExecutablePath: string | null = null

/**
 * Find the Claude CLI executable path
 */
function findClaudeExecutable(): string | null {
  // Try common paths in order of preference
  const possiblePaths = [
    join(homedir(), '.claude', 'local', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude'
  ]

  // First try 'which claude' to find it in PATH
  try {
    const whichResult = execSync('which claude', { encoding: 'utf-8' }).trim()
    if (whichResult && existsSync(whichResult)) {
      console.log('[ClaudeAgent] Found claude via which:', whichResult)
      return whichResult
    }
  } catch {
    // which failed, try known paths
  }

  // Try known paths
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      console.log('[ClaudeAgent] Found claude at:', p)
      return p
    }
  }

  console.error('[ClaudeAgent] Could not find claude executable')
  return null
}

async function loadSDK() {
  if (sdkLoadAttempted) {
    return sdkModule
  }

  sdkLoadAttempted = true

  // Find Claude executable first
  claudeExecutablePath = findClaudeExecutable()
  if (!claudeExecutablePath) {
    sdkLoadError = 'Claude CLI not found. Please install Claude Code and run "claude login".'
    return null
  }

  try {
    console.log('[ClaudeAgent] Attempting to load SDK...')
    sdkModule = await import('@anthropic-ai/claude-agent-sdk')
    console.log('[ClaudeAgent] SDK loaded successfully, exports:', Object.keys(sdkModule))
    return sdkModule
  } catch (error: any) {
    sdkLoadError = error.message || 'Failed to load Claude Agent SDK'
    console.error('[ClaudeAgent] Failed to load SDK:', error)
    console.error('[ClaudeAgent] Stack:', error.stack)
    return null
  }
}

/**
 * Check if Claude CLI is authenticated by checking for ~/.claude directory
 */
function checkClaudeAuth(): boolean {
  const claudeDir = join(homedir(), '.claude')
  const exists = existsSync(claudeDir)
  console.log('[ClaudeAgent] Auth check - ~/.claude exists:', exists)
  return exists
}

/**
 * Initialize IPC handlers for Claude Agent
 */
export function initClaudeAgentIPC() {
  console.log('[ClaudeAgent] Initializing IPC handlers')

  // Check authentication status
  ipcMain.handle('claude-agent:is-authenticated', async () => {
    return checkClaudeAuth()
  })

  // Get account info
  ipcMain.handle('claude-agent:get-account-info', async () => {
    const sdk = await loadSDK()
    if (!sdk) {
      return { error: sdkLoadError || 'SDK not available' }
    }

    try {
      const { query } = sdk
      const generator = query({
        prompt: 'Return "ok"',
        options: {
          maxTurns: 1,
          maxBudgetUsd: 0.001,
          permissionMode: 'dontAsk',
          pathToClaudeCodeExecutable: claudeExecutablePath,
          allowedTools: [] // No tools for simple check
        }
      })

      const info = await generator.accountInfo?.()
      await generator.return(undefined)

      return info || {}
    } catch (error: any) {
      console.error('[ClaudeAgent] getAccountInfo error:', error)
      return { error: error.message }
    }
  })

  // Send prompt and get response
  ipcMain.handle('claude-agent:send-prompt', async (_event, prompt: string, options: any = {}) => {
    console.log('[ClaudeAgent] Received prompt request, prompt length:', prompt.length)
    console.log('[ClaudeAgent] Prompt preview (first 300 chars):', prompt.substring(0, 300))
    console.log(
      '[ClaudeAgent] Has context?:',
      prompt.includes('Context:') || prompt.includes('context about')
    )

    const sdk = await loadSDK()
    if (!sdk) {
      console.error('[ClaudeAgent] SDK not available:', sdkLoadError)
      return {
        content: '',
        error:
          sdkLoadError || 'Claude Agent SDK is not available. Make sure the CLI is authenticated.'
      }
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const abortController = new AbortController()
    activeAbortControllers.set(requestId, abortController)

    try {
      const { query } = sdk

      // Build options matching the SDK API exactly
      const queryOptions: any = {
        cwd: options.cwd || process.cwd(),
        maxTurns: options.maxTurns || 3, // Reduced for chat responses
        maxBudgetUsd: options.maxBudgetUsd || 0.1, // Lower budget for simple chat
        permissionMode: options.permissionMode || 'dontAsk',
        abortController,
        // Path to Claude CLI executable
        pathToClaudeCodeExecutable: claudeExecutablePath,
        // For simple Q&A chat, we don't need file editing tools
        // Empty array means Claude can still reason but won't invoke file tools
        allowedTools: options.allowedTools || []
      }

      // Only set model if explicitly provided (let SDK use default otherwise)
      if (options.model) {
        queryOptions.model = options.model
      }

      if (options.systemPrompt) {
        queryOptions.systemPrompt = options.systemPrompt
      }

      console.log('[ClaudeAgent] Starting query with options:', {
        model: queryOptions.model || '(default)',
        maxTurns: queryOptions.maxTurns,
        maxBudgetUsd: queryOptions.maxBudgetUsd,
        permissionMode: queryOptions.permissionMode,
        allowedTools: queryOptions.allowedTools
      })

      const generator = query({
        prompt,
        options: queryOptions
      })

      let fullContent = ''
      let metadata: any = {}
      let messageCount = 0

      for await (const message of generator) {
        messageCount++
        console.log(`[ClaudeAgent] Message ${messageCount}: type=${message.type}`)

        // Log system init for debugging
        if (message.type === 'system' && message.subtype === 'init') {
          console.log('[ClaudeAgent] System init:', {
            apiKeySource: message.apiKeySource,
            model: message.model,
            tools: message.tools?.length || 0
          })
        }

        // Handle assistant messages
        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'text' && block.text) {
              console.log('[ClaudeAgent] Got text block, length:', block.text.length)
              fullContent += block.text
            }
          }
        }

        // Handle result message
        if (message.type === 'result') {
          console.log('[ClaudeAgent] Result message:', {
            subtype: message.subtype,
            is_error: message.is_error,
            resultLength: message.result?.length || 0,
            errors: message.errors
          })

          if (message.is_error) {
            const errorMsg = message.errors?.join('\n') || 'Unknown error occurred'
            console.error('[ClaudeAgent] Query returned error:', errorMsg)
            return {
              content: fullContent,
              error: errorMsg,
              metadata
            }
          } else {
            metadata = {
              totalCost: message.total_cost_usd,
              inputTokens: message.usage?.input_tokens,
              outputTokens: message.usage?.output_tokens
            }
            // Use result from final message if available
            if (message.result && message.result.length > 0) {
              fullContent = message.result
            }
          }
        }

        // Handle auth status (if it exists in message stream)
        if ((message as any).type === 'auth_status' && (message as any).error) {
          const authError = (message as any).error
          console.error('[ClaudeAgent] Auth error:', authError)
          return {
            content: '',
            error: `Authentication error: ${authError}. Please run 'claude login' in your terminal.`,
            metadata
          }
        }
      }

      console.log(
        '[ClaudeAgent] Query completed successfully, response length:',
        fullContent.length
      )
      return {
        content: fullContent,
        metadata
      }
    } catch (error: any) {
      console.error('[ClaudeAgent] Query error:', error.message)
      console.error('[ClaudeAgent] Error stack:', error.stack)

      // Provide helpful error messages
      let errorMessage = error.message || 'Unknown error occurred'
      if (errorMessage.includes('ENOENT') || errorMessage.includes('claude')) {
        errorMessage =
          'Claude CLI not found. Please install Claude Code and run "claude login" first.'
      } else if (errorMessage.includes('auth') || errorMessage.includes('API key')) {
        errorMessage = 'Authentication failed. Please run "claude login" in your terminal.'
      }

      return {
        content: '',
        error: errorMessage
      }
    } finally {
      activeAbortControllers.delete(requestId)
    }
  })

  // Interrupt a query
  ipcMain.handle('claude-agent:interrupt', async (_event, requestId: string) => {
    const controller = activeAbortControllers.get(requestId)
    if (controller) {
      controller.abort()
      activeAbortControllers.delete(requestId)
      return true
    }
    return false
  })

  // Quick summarize - optimized for short definitions
  ipcMain.handle('claude-agent:summarize', async (_event, text: string) => {
    console.log('[ClaudeAgent] Summarize request, text length:', text.length)

    const sdk = await loadSDK()
    if (!sdk) {
      return { content: '', error: sdkLoadError || 'SDK not available' }
    }

    try {
      const { query } = sdk

      const systemPrompt = `You are a helpful assistant that provides clear, concise definitions and summaries.
      When given text, provide a brief 1-2 sentence definition or summary.
      Be direct and informative. Do not include any preamble.`

      const generator = query({
        prompt: `Briefly define or summarize this: "${text}"`,
        options: {
          maxTurns: 1,
          maxBudgetUsd: 0.02,
          permissionMode: 'dontAsk',
          pathToClaudeCodeExecutable: claudeExecutablePath,
          allowedTools: [],
          systemPrompt
        }
      })

      let content = ''
      for await (const message of generator) {
        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'text' && block.text) {
              content += block.text
            }
          }
        }
        if (message.type === 'result' && message.result) {
          content = message.result
        }
      }

      return { content }
    } catch (error: any) {
      console.error('[ClaudeAgent] Summarize error:', error.message)
      return { content: '', error: error.message }
    }
  })

  // Deep explanation - for expanded popup
  ipcMain.handle('claude-agent:explain-deep', async (_event, text: string, context: string) => {
    console.log('[ClaudeAgent] Deep explain request, text:', text.substring(0, 50))

    const sdk = await loadSDK()
    if (!sdk) {
      return { content: '', error: sdkLoadError || 'SDK not available' }
    }

    try {
      const { query } = sdk

      const systemPrompt = `You are an expert educator providing in-depth explanations.

When explaining content, structure your response like this:
1. **What it is**: A clear, accessible definition
2. **How it works**: Break down the mechanics, logic, or structure
3. **Why it matters**: Practical significance or use cases
4. **Example**: One concrete, relatable example
5. **Related concepts**: 1-2 connected ideas for deeper learning

Be thorough but accessible. Use analogies when helpful. Keep under 300 words.`

      const prompt = context
        ? `Explain "${text}" in detail. Context: ${context}`
        : `Explain "${text}" in detail.`

      const generator = query({
        prompt,
        options: {
          maxTurns: 1,
          maxBudgetUsd: 0.05,
          permissionMode: 'dontAsk',
          pathToClaudeCodeExecutable: claudeExecutablePath,
          allowedTools: [],
          systemPrompt
        }
      })

      let content = ''
      for await (const message of generator) {
        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'text' && block.text) {
              content += block.text
            }
          }
        }
        if (message.type === 'result' && message.result) {
          content = message.result
        }
      }

      return { content }
    } catch (error: any) {
      console.error('[ClaudeAgent] Deep explain error:', error.message)
      return { content: '', error: error.message }
    }
  })

  // Screenshot-based summarization using Claude Agent SDK Vision
  ipcMain.handle(
    'claude-agent:summarize-with-screenshot',
    async (
      _event,
      bounds: { x: number; y: number; width: number; height: number },
      activeViewId: string
    ) => {
      console.log(
        '[ClaudeAgent] Screenshot summarize request, bounds:',
        bounds,
        'viewId:',
        activeViewId
      )

      const sdk = await loadSDK()
      if (!sdk) {
        return { content: '', error: sdkLoadError || 'SDK not available' }
      }

      try {
        // Import view manager dynamically to avoid circular deps
        const { getViewManager } = await import('./mainWindow')
        const viewManager = getViewManager()

        if (!viewManager) {
          console.error('[ClaudeAgent] View manager not available')
          return { content: '', error: 'View manager not available' }
        }

        // Try to get the view - first try the provided ID, then fall back to active view
        let view = viewManager.views.get(activeViewId)

        // If the provided viewId doesn't exist, try to get the activeViewId from viewManager
        if (!view) {
          console.log(
            '[ClaudeAgent] View not found with provided ID, trying activeViewId:',
            viewManager.activeViewId
          )
          if (viewManager.activeViewId) {
            view = viewManager.views.get(viewManager.activeViewId)
          }
        }

        if (!view) {
          console.error(
            '[ClaudeAgent] No active view found. Available views:',
            Array.from(viewManager.views.keys())
          )
          return { content: '', error: 'Active view not found' }
        }

        // Capture the full page screenshot (more reliable than region capture)
        // The bounds from the lasso are relative to the overlay window, not the webview
        console.log(
          '[ClaudeAgent] Capturing full page screenshot from view:',
          view.id,
          'bounds:',
          view.getBounds()
        )

        // Capture without region for reliability - Claude vision will analyze the whole page
        const screenshotDataUrl = await view.capturePage(undefined, 'high')

        if (!screenshotDataUrl) {
          console.error('[ClaudeAgent] capturePage returned null')
          return { content: '', error: 'Failed to capture screenshot - capturePage returned null' }
        }

        console.log('[ClaudeAgent] Screenshot captured, length:', screenshotDataUrl.length)

        // Extract base64 data and media type from data URL
        const matches = screenshotDataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
        if (!matches) {
          return { content: '', error: 'Invalid screenshot format' }
        }
        const mediaType = matches[1] as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
        const base64Data = matches[2]

        // Use Claude Agent SDK with Streaming Input Mode for vision
        const { query } = sdk

        // Create a generator for streaming input with image
        async function* generateMessages() {
          yield {
            type: 'user' as const,
            message: {
              role: 'user' as const,
              content: [
                {
                  type: 'text' as const,
                  text: `Analyze this screenshot and provide an EDUCATIONAL explanation of the content. Follow these rules:

**For DIAGRAMS/FLOWCHARTS**: Explain what the diagram represents, the flow of information, and key relationships between components. Don't just describe boxes and arrows.

**For TEXT/PARAGRAPHS**: Summarize the key points and explain any technical terms in simple language.

**For CODE**: Explain what the code does, the pattern/approach used, and any important concepts demonstrated.

**For TERMS/DEFINITIONS**: Provide a clear definition with practical examples.

**For UI/INTERFACES**: Explain the purpose and key functionality, not just what elements are visible.

IMPORTANT: Be educational and explanatory, NOT descriptive. DO NOT start with "This screenshot shows..." or "The image displays...". Instead, directly teach the user about what they're looking at. Focus on helping them UNDERSTAND the concept. Keep it concise (3-5 sentences). No preamble.`
                },
                {
                  type: 'image' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: mediaType,
                    data: base64Data
                  }
                }
              ]
            }
          }
        }

        console.log('[ClaudeAgent] Sending screenshot to Claude SDK for vision analysis...')

        // Process streaming responses
        let content = ''
        const generator = query({
          prompt: generateMessages(),
          options: {
            maxTurns: 1,
            maxBudgetUsd: 0.05,
            permissionMode: 'dontAsk',
            pathToClaudeCodeExecutable: claudeExecutablePath,
            allowedTools: []
          }
        })

        for await (const message of generator) {
          if (message.type === 'assistant' && message.message?.content) {
            for (const block of message.message.content) {
              if (block.type === 'text' && block.text) {
                content += block.text
              }
            }
          }
          if (message.type === 'result' && message.result) {
            content = message.result
          }
        }

        console.log('[ClaudeAgent] Claude vision response:', content.substring(0, 100))

        return { content, screenshotUrl: screenshotDataUrl }
      } catch (error: any) {
        console.error('[ClaudeAgent] Screenshot summarize error:', error.message)
        return { content: '', error: error.message }
      }
    }
  )

  // Streaming screenshot-based summarization - sends chunks as they arrive
  ipcMain.handle(
    'claude-agent:summarize-with-screenshot-stream',
    async (
      event,
      bounds: { x: number; y: number; width: number; height: number },
      activeViewId: string
    ) => {
      console.log('[ClaudeAgent] Streaming screenshot summarize request, bounds:', bounds)

      const sdk = await loadSDK()
      if (!sdk) {
        event.sender.send('claude-stream-error', sdkLoadError || 'SDK not available')
        return { content: '', error: sdkLoadError || 'SDK not available' }
      }

      try {
        // Import view manager dynamically to avoid circular deps
        const { getViewManager } = await import('./mainWindow')
        const viewManager = getViewManager()

        if (!viewManager) {
          event.sender.send('claude-stream-error', 'View manager not available')
          return { content: '', error: 'View manager not available' }
        }

        // Try to get the view
        let view = viewManager.views.get(activeViewId)
        if (!view && viewManager.activeViewId) {
          view = viewManager.views.get(viewManager.activeViewId)
        }

        if (!view) {
          event.sender.send('claude-stream-error', 'Active view not found')
          return { content: '', error: 'Active view not found' }
        }

        // Capture screenshot
        const screenshotDataUrl = await view.capturePage(undefined, 'high')
        if (!screenshotDataUrl) {
          event.sender.send('claude-stream-error', 'Failed to capture screenshot')
          return { content: '', error: 'Failed to capture screenshot' }
        }

        // Extract base64 data
        const matches = screenshotDataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
        if (!matches) {
          event.sender.send('claude-stream-error', 'Invalid screenshot format')
          return { content: '', error: 'Invalid screenshot format' }
        }
        const mediaType = matches[1] as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
        const base64Data = matches[2]

        // Send screenshot captured notification
        event.sender.send('claude-stream-start', { screenshotUrl: screenshotDataUrl })

        const { query } = sdk

        // Create streaming input with image
        async function* generateMessages() {
          yield {
            type: 'user' as const,
            message: {
              role: 'user' as const,
              content: [
                {
                  type: 'text' as const,
                  text: `Analyze this screenshot and provide an EDUCATIONAL explanation of the content. Follow these rules:

**For DIAGRAMS/FLOWCHARTS**: Explain what the diagram represents, the flow of information, and key relationships between components.

**For TEXT/PARAGRAPHS**: Summarize the key points and explain any technical terms in simple language.

**For CODE**: Explain what the code does, the pattern/approach used, and any important concepts demonstrated.

**For TERMS/DEFINITIONS**: Provide a clear definition with practical examples.

**For UI/INTERFACES**: Explain the purpose and key functionality.

IMPORTANT: Be educational and explanatory, NOT descriptive. DO NOT start with "This screenshot shows...". Directly teach the user. Keep it concise (3-5 sentences). No preamble.`
                },
                {
                  type: 'image' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: mediaType,
                    data: base64Data
                  }
                }
              ]
            }
          }
        }

        console.log('[ClaudeAgent] Starting streaming response...')

        let fullContent = ''
        const generator = query({
          prompt: generateMessages(),
          options: {
            maxTurns: 1,
            maxBudgetUsd: 0.05,
            permissionMode: 'dontAsk',
            pathToClaudeCodeExecutable: claudeExecutablePath,
            allowedTools: []
          }
        })

        for await (const message of generator) {
          if (message.type === 'assistant' && message.message?.content) {
            for (const block of message.message.content) {
              if (block.type === 'text' && block.text) {
                // Send each text chunk to the renderer immediately
                event.sender.send('claude-stream-chunk', block.text)
                fullContent += block.text
                console.log('[ClaudeAgent] Sent chunk, length:', block.text.length)
              }
            }
          }
          if (message.type === 'result' && message.result) {
            // Final result - may contain the complete text
            if (message.result !== fullContent) {
              fullContent = message.result
              event.sender.send('claude-stream-chunk', message.result)
            }
          }
        }

        // Signal completion
        event.sender.send('claude-stream-complete', { content: fullContent })
        console.log('[ClaudeAgent] Streaming complete, total length:', fullContent.length)

        return { content: fullContent, screenshotUrl: screenshotDataUrl }
      } catch (error: any) {
        console.error('[ClaudeAgent] Streaming summarize error:', error.message)
        event.sender.send('claude-stream-error', error.message)
        return { content: '', error: error.message }
      }
    }
  )

  // Ask a contextual question about an image (for ChapterPal-style Q&A)
  // Fetches the image from surf:// URL and sends to Claude with vision
  ipcMain.handle(
    'claude-agent:ask-about-image',
    async (_event, imageUrl: string, question: string, context?: string) => {
      console.log(
        '[ClaudeAgent] Ask about image request:',
        imageUrl,
        'question:',
        question.substring(0, 50)
      )

      const sdk = await loadSDK()
      if (!sdk) {
        return { content: '', error: sdkLoadError || 'SDK not available' }
      }

      try {
        const fs = await import('fs')
        const pathModule = await import('path')

        // Parse the surf:// URL to get the resource ID
        // Format: surf://surf/resource/{id}?raw=true
        const url = new URL(imageUrl)
        const pathParts = url.pathname.split('/')
        // pathname is like /resource/{id} or /surf/resource/{id}
        const resourceId = pathParts[pathParts.length - 1]

        if (!resourceId) {
          return { content: '', error: 'Invalid image URL: could not extract resource ID' }
        }

        console.log('[ClaudeAgent] Extracted resource ID:', resourceId)

        // Get the resource from SFFS to find its file path
        const { useSFFSMain } = await import('./sffs')
        const sffsMain = useSFFSMain()

        if (!sffsMain) {
          return { content: '', error: 'SFFS not initialized' }
        }

        const resource = await sffsMain.readResource(resourceId)

        if (!resource) {
          return { content: '', error: `Resource not found: ${resourceId}` }
        }

        if (!resource.path) {
          return { content: '', error: 'Resource has no file path' }
        }

        console.log('[ClaudeAgent] Resource path:', resource.path)

        // Read the image file
        if (!fs.existsSync(resource.path)) {
          return { content: '', error: `Image file not found: ${resource.path}` }
        }

        const imageBuffer = fs.readFileSync(resource.path)
        const base64Data = imageBuffer.toString('base64')

        // Determine media type from resource type or file extension
        let mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' = 'image/png'
        const ext = pathModule.extname(resource.path).toLowerCase()
        const resourceType = resource.type?.toLowerCase() || ''

        if (
          resourceType.includes('jpeg') ||
          resourceType.includes('jpg') ||
          ext === '.jpg' ||
          ext === '.jpeg'
        ) {
          mediaType = 'image/jpeg'
        } else if (resourceType.includes('gif') || ext === '.gif') {
          mediaType = 'image/gif'
        } else if (resourceType.includes('webp') || ext === '.webp') {
          mediaType = 'image/webp'
        } else if (resourceType.includes('png') || ext === '.png') {
          mediaType = 'image/png'
        }

        console.log('[ClaudeAgent] Image media type:', mediaType)

        const { query } = sdk

        // Create a generator for streaming input with image
        async function* generateMessages() {
          yield {
            type: 'user' as const,
            message: {
              role: 'user' as const,
              content: [
                {
                  type: 'text' as const,
                  text: `${context ? `Context from document: ${context}\n\n` : ''}${question}

IMPORTANT: Provide a clear, educational response. Be concise (2-4 sentences) and focus on helping the reader understand. No preamble.`
                },
                {
                  type: 'image' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: mediaType,
                    data: base64Data
                  }
                }
              ]
            }
          }
        }

        console.log('[ClaudeAgent] Sending image to Claude SDK for Q&A...')

        let content = ''
        const generator = query({
          prompt: generateMessages(),
          options: {
            maxTurns: 1,
            maxBudgetUsd: 0.05,
            permissionMode: 'dontAsk',
            pathToClaudeCodeExecutable: claudeExecutablePath,
            allowedTools: []
          }
        })

        for await (const message of generator) {
          if (message.type === 'assistant' && message.message?.content) {
            for (const block of message.message.content) {
              if (block.type === 'text' && block.text) {
                content += block.text
              }
            }
          }
          if (message.type === 'result' && message.result) {
            content = message.result
          }
        }

        console.log('[ClaudeAgent] Image Q&A response:', content.substring(0, 100))

        return { content }
      } catch (error: any) {
        console.error('[ClaudeAgent] Ask about image error:', error.message)
        return { content: '', error: error.message }
      }
    }
  )

  // Describe an image file using Claude Agent SDK Vision
  // Used for generating descriptions of extracted images from library documents
  ipcMain.handle(
    'claude-agent:describe-image',
    async (_event, imagePath: string, context?: string) => {
      console.log('[ClaudeAgent] Describe image request:', imagePath)

      const sdk = await loadSDK()
      if (!sdk) {
        return { content: '', error: sdkLoadError || 'SDK not available' }
      }

      try {
        // Read the image file
        const fs = await import('fs')
        const path = await import('path')

        if (!fs.existsSync(imagePath)) {
          return { content: '', error: `Image file not found: ${imagePath}` }
        }

        const imageBuffer = fs.readFileSync(imagePath)
        const base64Data = imageBuffer.toString('base64')

        // Determine media type from extension
        const ext = path.extname(imagePath).toLowerCase()
        let mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' = 'image/png'
        if (ext === '.jpg' || ext === '.jpeg') {
          mediaType = 'image/jpeg'
        } else if (ext === '.gif') {
          mediaType = 'image/gif'
        } else if (ext === '.webp') {
          mediaType = 'image/webp'
        }

        const { query } = sdk

        // Create a generator for streaming input with image
        async function* generateMessages() {
          yield {
            type: 'user' as const,
            message: {
              role: 'user' as const,
              content: [
                {
                  type: 'text' as const,
                  text: `Describe this image for use in a document. ${context ? `Context: ${context}` : ''}

Provide a concise but informative description that explains:
1. What the image shows (diagram, chart, photo, etc.)
2. Key elements or information visible
3. Any text or labels in the image
4. The purpose or meaning in context

Keep the description under 3 sentences. Be specific and educational.`
                },
                {
                  type: 'image' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: mediaType,
                    data: base64Data
                  }
                }
              ]
            }
          }
        }

        console.log('[ClaudeAgent] Sending image to Claude SDK for description...')

        let content = ''
        const generator = query({
          prompt: generateMessages(),
          options: {
            maxTurns: 1,
            maxBudgetUsd: 0.03,
            permissionMode: 'dontAsk',
            pathToClaudeCodeExecutable: claudeExecutablePath,
            allowedTools: []
          }
        })

        for await (const message of generator) {
          if (message.type === 'assistant' && message.message?.content) {
            for (const block of message.message.content) {
              if (block.type === 'text' && block.text) {
                content += block.text
              }
            }
          }
          if (message.type === 'result' && message.result) {
            content = message.result
          }
        }

        console.log('[ClaudeAgent] Image description:', content.substring(0, 100))

        return { content }
      } catch (error: any) {
        console.error('[ClaudeAgent] Describe image error:', error.message)
        return { content: '', error: error.message }
      }
    }
  )
}
