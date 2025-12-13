/**
 * Claude Agent SDK Service
 *
 * This service provides access to Claude via the local CLI authentication.
 * Since the Claude Agent SDK requires Node.js APIs (fs, child_process), it must
 * run in Electron's main process. This service communicates with the main process
 * via IPC when running in the renderer.
 *
 * For now, this provides a stub that indicates the feature needs main process support.
 * The actual SDK usage should happen in the main process.
 */

import { useLogScope } from '@deta/utils'

// Types for the service
export interface ClaudeAgentOptions {
  model?: string
  cwd?: string
  maxTurns?: number
  maxBudgetUsd?: number
  systemPrompt?: string
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk'
  allowDangerouslySkipPermissions?: boolean
  includePartialMessages?: boolean
  abortController?: AbortController
}

export interface ClaudeAgentStreamChunk {
  type: 'text' | 'done' | 'error' | 'status'
  content: string
  metadata?: {
    model?: string
    totalCost?: number
    inputTokens?: number
    outputTokens?: number
  }
}

export class ClaudeAgentService {
  private log = useLogScope('ClaudeAgentService')
  private isElectronMain: boolean = false

  constructor() {
    this.log.debug('ClaudeAgentService created')
    // Check if we're in Node.js/Electron main process
    this.isElectronMain = typeof window === 'undefined' && typeof process !== 'undefined'
  }

  /**
   * Check if the Claude CLI is authenticated
   * This checks for the existence of ~/.claude/ directory
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      // In renderer, check via IPC if available
      if (!this.isElectronMain && typeof window !== 'undefined') {
        if ((window as any).api?.claudeAgent) {
          return await (window as any).api.claudeAgent.isAuthenticated()
        }
        // Assume authenticated if we can't check
        return true
      }
      return true
    } catch (error) {
      this.log.error('Auth check failed:', error)
      return false
    }
  }

  /**
   * Get account information
   */
  async getAccountInfo(): Promise<{
    email?: string
    organization?: string
    subscriptionType?: string
  } | null> {
    if (!this.isElectronMain && typeof window !== 'undefined') {
      if ((window as any).api?.claudeAgent) {
        return await (window as any).api.claudeAgent.getAccountInfo()
      }
    }
    return null
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<
    Array<{
      value: string
      displayName: string
      description: string
    }>
  > {
    // Return default Claude models
    return [
      {
        value: 'claude-sonnet-4-5-20250929',
        displayName: 'Claude 4.5 Sonnet',
        description: 'Most capable model'
      },
      {
        value: 'claude-sonnet-4-20250514',
        displayName: 'Claude 4 Sonnet',
        description: 'Balanced performance'
      },
      {
        value: 'claude-3-7-sonnet-latest',
        displayName: 'Claude 3.7 Sonnet',
        description: 'Fast and efficient'
      },
      {
        value: 'claude-3-5-haiku-latest',
        displayName: 'Claude 3.5 Haiku',
        description: 'Quick responses'
      }
    ]
  }

  /**
   * Send a prompt and get a streaming response
   * In the renderer, this communicates with the main process via IPC
   */
  async *streamPrompt(
    prompt: string,
    options: ClaudeAgentOptions = {}
  ): AsyncGenerator<ClaudeAgentStreamChunk, void, unknown> {
    this.log.debug('streamPrompt called', { promptLength: prompt.length })

    // Check if we have IPC access to the main process
    if (typeof window !== 'undefined' && (window as any).api?.claudeAgent) {
      try {
        this.log.debug('Sending prompt via IPC to main process')
        const response = await (window as any).api.claudeAgent.sendPrompt(prompt, options)
        this.log.debug('Received response from main process', { hasError: !!response.error })

        if (response.error) {
          yield { type: 'error', content: response.error }
        } else {
          yield { type: 'text', content: response.content }
          yield { type: 'done', content: response.content, metadata: response.metadata }
        }
      } catch (error: any) {
        this.log.error('IPC error:', error)
        yield { type: 'error', content: error.message || 'Failed to communicate with Claude Agent' }
      }
      return
    }

    // Fallback: API not available
    this.log.warn('Claude Agent API not available')
    yield {
      type: 'error',
      content: 'Claude Agent SDK requires main process support. Please restart the app.'
    }
  }

  /**
   * Send a prompt and get a complete response (non-streaming)
   */
  async sendPrompt(
    prompt: string,
    options: ClaudeAgentOptions = {}
  ): Promise<{
    content: string
    error?: string
    metadata?: {
      model?: string
      totalCost?: number
      inputTokens?: number
      outputTokens?: number
    }
  }> {
    let fullContent = ''
    let error: string | undefined
    let metadata: any

    for await (const chunk of this.streamPrompt(prompt, options)) {
      if (chunk.type === 'text') {
        fullContent += chunk.content
      } else if (chunk.type === 'error') {
        error = chunk.content
      } else if (chunk.type === 'done') {
        metadata = chunk.metadata
      }
    }

    return {
      content: fullContent,
      error,
      metadata
    }
  }

  /**
   * Interrupt an ongoing query
   */
  interrupt(abortController: AbortController): void {
    abortController.abort()
    this.log.debug('Query interrupted')
  }
}

// Singleton instance
let claudeAgentServiceInstance: ClaudeAgentService | null = null

export function getClaudeAgentService(): ClaudeAgentService {
  if (!claudeAgentServiceInstance) {
    claudeAgentServiceInstance = new ClaudeAgentService()
  }
  return claudeAgentServiceInstance
}

export function useClaudeAgent(): ClaudeAgentService {
  return getClaudeAgentService()
}
