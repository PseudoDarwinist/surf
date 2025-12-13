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

      const systemPrompt = `You are a knowledgeable assistant providing detailed explanations.
      When given a term or concept, provide a comprehensive but accessible explanation.
      Include relevant context, examples, and related concepts.
      Keep the response under 200 words but be thorough.`

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
}
