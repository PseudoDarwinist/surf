import { useLogScope } from '@deta/utils'
import type { AIService } from './ai'

export interface SelectionContext {
  selectedText: string
  pageContext: string
  pageTitle: string
  pageUrl: string
  surroundingText?: string
}

export class SelectionAIService {
  private ai: AIService
  private log: ReturnType<typeof useLogScope>

  constructor(ai: AIService) {
    this.ai = ai
    this.log = useLogScope('SelectionAI')
  }

  /**
   * Capture selection context from the current page
   */
  async captureSelectionContext(
    selectedText: string,
    pageTitle: string = '',
    pageUrl: string = ''
  ): Promise<SelectionContext> {
    this.log.debug('Capturing selection context', { selectedText, pageTitle, pageUrl })

    // Get surrounding text from the page
    const surroundingText = this.getSurroundingText(selectedText)

    // Get full page context if available
    let pageContext = ''
    try {
      // Try to get page content from active tab
      // This will be enhanced when we integrate with webcontents
      pageContext = surroundingText || ''
    } catch (error) {
      this.log.error('Error capturing page context', error)
    }

    return {
      selectedText: selectedText.trim(),
      pageContext,
      pageTitle: pageTitle || 'Untitled',
      pageUrl: pageUrl || '',
      surroundingText
    }
  }

  /**
   * Get surrounding text around the selection
   * This is a placeholder - will be enhanced with actual DOM selection
   */
  private getSurroundingText(selectedText: string): string {
    // This will be implemented to get text before/after selection
    // For now, return empty string
    return ''
  }

  /**
   * Query AI about the selected text
   */
  async querySelection(
    context: SelectionContext,
    userQuestion: string
  ): Promise<{ response: string; error: string | null }> {
    this.log.debug('Querying selection', { context, userQuestion })

    try {
      // Build the prompt with context
      const prompt = this.buildPrompt(context, userQuestion)

      // Use the AI service to get response
      const completion = await this.ai.createChatCompletion(prompt, undefined, {
        tier: 'premium' as any
      })

      if (completion.error) {
        return {
          response: '',
          error: completion.error.message
        }
      }

      return {
        response: completion.output || '',
        error: null
      }
    } catch (error) {
      this.log.error('Error querying selection', error)
      return {
        response: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Build the prompt for the AI query
   */
  private buildPrompt(context: SelectionContext, userQuestion: string): string {
    let prompt = `The user has selected the following text: "${context.selectedText}"\n\n`

    if (context.pageContext) {
      prompt += `Context from the page:\n`
      prompt += `Title: ${context.pageTitle}\n`
      if (context.pageUrl) {
        prompt += `URL: ${context.pageUrl}\n`
      }
      prompt += `\nPage content:\n${context.pageContext}\n\n`
    }

    if (context.surroundingText) {
      prompt += `Surrounding text:\n${context.surroundingText}\n\n`
    }

    prompt += `User question: ${userQuestion}\n\n`
    prompt += `Please answer the user's question about the selected text, using the provided context to give a comprehensive and accurate answer.`

    return prompt
  }
}
