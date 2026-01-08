<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { writable, get } from 'svelte/store'
  import type { Resource } from '@deta/services/resources'
  import { useResourceManager } from '@deta/services/resources'
  import { markdownToHtml, useLogScope, wait, htmlToMarkdown } from '@deta/utils'
  import {
    ProgressiveReader,
    FocusToolbar,
    ReadingPreferences,
    readingPreferences,
    readingPreferencesOpen,
    type QuestionType
  } from '@deta/ui'
  import type { MessagePortClient } from '@deta/services/messagePort'
  import type { LibraryDocumentMetadata, AITool } from '@deta/types'
  import { Provider } from '@deta/types'
  import { MentionItemType, type MentionItem } from '@deta/editor'
  import DocumentDetailPage from './DocumentDetailPage.svelte'
  import NotebookLMPanel from './NotebookLMPanel.svelte'
  import ChatInput from '../ChatInput.svelte'
  import {
    useAI,
    parseChatOutputToHtml,
    type AIChat,
    startAIGeneration,
    endAIGeneration,
    updateAIGenerationProgress
  } from '@deta/services/ai'
  import { AI_TOOLS, MODEL_CLAUDE_MENTION, MODEL_GPT_MENTION } from '@deta/services/constants'

  // Props
  let {
    resource,
    messagePort
  }: {
    resource: Resource
    messagePort: MessagePortClient
  } = $props()

  const log = useLogScope('LibraryDocumentReader')

  // Question type to prompt mapping
  const questionPrompts: Record<QuestionType, string> = {
    tldr: "Give me a TL;DR (too long; didn't read) summary of this in 1-2 sentences.",
    visual:
      'Describe this concept using a visual representation, diagram, or mental image that would help someone understand it better.',
    explain: 'Explain this in more detail.',
    realworld:
      'Give a real-world example or application of this concept that I might encounter in everyday life.',
    bigpicture: 'Show how this fits into the big picture.'
  }

  /**
   * Handle contextual AI questions from the ProgressiveReader
   * Uses Claude Agent SDK via window.api.claudeAgent
   * For images, uses the vision-enabled askAboutImage API
   */
  async function handleAskQuestion(context: {
    selectedText: string
    questionType: QuestionType
    chunkContent: string
    imageUrl?: string
  }): Promise<string> {
    const { selectedText, questionType, chunkContent, imageUrl } = context
    const documentTitle = libraryMetadata?.title || resource.metadata?.name || 'document'

    // Check if Claude Agent SDK is available
    if (!window.api?.claudeAgent?.sendPrompt) {
      log.error('Claude Agent SDK not available')
      return 'Claude Agent is not available. Please make sure you are logged in with "claude login".'
    }

    try {
      // If we have an image URL, use the vision-enabled API
      if (imageUrl) {
        log.debug('Asking Claude Agent about image:', { questionType, imageUrl })

        // Check if the vision API is available
        if (!window.api.claudeAgent.askAboutImage) {
          log.error('Claude Agent askAboutImage not available')
          return 'Image analysis is not available. Please update your app.'
        }

        // Build the question based on question type
        const questionText = `Looking at this figure/diagram from the document "${documentTitle}":\n\n${questionPrompts[questionType]}`

        const response = await window.api.claudeAgent.askAboutImage(
          imageUrl,
          questionText,
          chunkContent
        )

        if (response.error) {
          log.error('Claude Agent image error:', response.error)
          return `Error: ${response.error}`
        }

        return response.content || 'No response received.'
      }

      // For text selections, use the regular sendPrompt API
      log.debug('Asking Claude Agent:', { questionType, selectedText: selectedText.slice(0, 50) })

      let prompt: string

      // Special handling for Big Picture - use full document context
      if (questionType === 'bigpicture') {
        // Get the full document content for context
        const fullDocContent = get(fullContent) || get(chapterContent) || chunkContent

        // Calculate approximate reading position
        const fullText = fullDocContent.replace(/<[^>]*>/g, '') // Strip HTML
        const chunkText = chunkContent.replace(/<[^>]*>/g, '')
        const selectionPosition = fullText.indexOf(chunkText.substring(0, 100))
        const percentRead = Math.round((selectionPosition / Math.max(fullText.length, 1)) * 100)

        // Get revealed content for "so far" context
        const readSoFar = get(revealedContent) || ''

        prompt = `You are a reading companion helping understand "${documentTitle}".

📚 FULL DOCUMENT:
${fullDocContent.replace(/<[^>]*>/g, '').substring(0, 15000)}

📍 CURRENT SELECTION (approximately ${percentRead}% through the document):
"${selectedText}"

Provide a Big Picture analysis with this EXACT format:

**📚 Document Overview**
[1-2 sentence summary of what this entire document is about]

**📍 You Are Here** (${percentRead}% through)
[What section/topic the reader is currently in]

**⬆️ Story So Far**
[2-3 key points from content BEFORE this selection]

**⬇️ Coming Up**
[2-3 topics/sections that remain AFTER this selection]

**🔗 How This Fits**
[Why this specific paragraph matters to the overall narrative]

Be concise but insightful. Use bullet points where helpful.`
      } else {
        // Standard prompts for other question types
        prompt = `You are helping a reader understand a document titled "${documentTitle}".\n\n`
        prompt += `The reader has selected the following text:\n"${selectedText}"\n\n`
        prompt += `Context from the document:\n${chunkContent}\n\n`
        prompt += `${questionPrompts[questionType]}\n\n`
        prompt += `Keep your response concise (2-4 sentences) and educational. Be direct - no preamble.`
      }

      const response = await window.api.claudeAgent.sendPrompt(prompt, {
        maxTurns: 1,
        maxBudgetUsd: questionType === 'bigpicture' ? 0.1 : 0.05 // Allow more tokens for Big Picture
      })

      if (response.error) {
        log.error('Claude Agent error:', response.error)
        return `Error: ${response.error}`
      }

      return response.content || 'No response received.'
    } catch (error) {
      log.error('Failed to get Claude Agent response:', error)
      return 'Sorry, there was an error. Please check that Claude is installed and run "claude login".'
    }
  }

  // State
  const fullContent = writable<string>('') // All HTML content
  const chapterContent = writable<string>('') // Current chapter's HTML only
  const isLoading = writable(true)
  const loadError = writable<string | null>(null)
  const progressiveReadingEnabled = writable(true) // Default to Focus Mode for library documents

  // AI Chat state
  const ai = useAI()
  const tools = writable<AITool[]>(AI_TOOLS)
  const revealedContent = writable<string>('') // Track what user has read for context
  const isGeneratingAI = writable(false)
  let chat: AIChat | null = null
  let chatInputComp: ChatInput

  // New state for detail page flow
  let showDetailPage = $state(true)
  let libraryMetadata = $state<LibraryDocumentMetadata | null>(null)
  let currentChapterIndex = $state(0)
  let restoreSessionFlag = $state(false)
  let notebookLMOpen = $state(false)
  let sessionRestored = $state(false) // Track if session was restored

  // Resource manager for session persistence
  const resourceManager = useResourceManager()

  let progressiveReaderRef: ProgressiveReader

  // Load document content
  async function loadContent() {
    isLoading.set(true)
    loadError.set(null)

    try {
      log.debug('Loading library document:', resource.id)
      log.debug('Resource type:', resource.type)
      log.debug('Resource path:', resource.path)

      // Get raw blob data
      const blob = await resource.getData()

      log.debug('Got blob:', blob ? `size=${blob.size}, type=${blob.type}` : 'null')

      if (!blob) {
        throw new Error('No content found in document')
      }

      if (blob.size === 0) {
        throw new Error('Document content is empty (0 bytes)')
      }

      // Convert blob to text (markdown)
      const markdown = await blob.text()
      log.debug('Loaded markdown length:', markdown.length)
      log.debug('Loaded markdown preview:', markdown.substring(0, 300))

      if (!markdown || markdown.trim() === '') {
        throw new Error('Markdown content is empty')
      }

      // Convert markdown to HTML
      const html = await markdownToHtml(markdown)
      log.debug('Converted HTML length:', html.length)

      fullContent.set(html)

      // Initially show all content (will be filtered when chapter is selected)
      chapterContent.set(html)

      log.debug('Document loaded successfully')
    } catch (err) {
      log.error('Failed to load document:', err)
      loadError.set(err instanceof Error ? err.message : 'Failed to load document')
      chapterContent.set('<p>Failed to load document content.</p>')
    } finally {
      isLoading.set(false)
    }
  }

  // Handle Focus Mode exit
  function handleProgressiveExit() {
    progressiveReadingEnabled.set(false)
    log.debug('Exiting Focus Mode')
  }

  // Handle reveal changes - track revealed content for AI context
  function handleRevealChange(
    event: CustomEvent<{
      revealedContent: string
      revealedIndex: number
      totalChunks: number
    }>
  ) {
    // Track revealed content for AI context injection
    revealedContent.set(event.detail.revealedContent)
    log.debug('Reveal change:', event.detail.revealedIndex, '/', event.detail.totalChunks)
  }

  /**
   * Create a new chat session for AI queries
   * Respects the user's model selection via ModelPicker
   */
  async function createNewNoteChat(mentions?: MentionItem[]) {
    const chatContextManager = ai.contextManager

    // Add document context
    const docTitle = libraryMetadata?.title || resource.metadata?.name || 'document'
    log.debug('Creating new chat for document:', docTitle)

    const newChat = await ai.createChat({ contextManager: chatContextManager })
    if (!newChat) {
      log.error('Failed to create chat')
      return null
    }

    // Handle model selection from mentions (if user @mentioned a specific model)
    const modelMention = (mentions ?? [])
      .reverse()
      .find((mention) => mention.type === MentionItemType.MODEL)

    if (modelMention) {
      if (modelMention.id === MODEL_CLAUDE_MENTION.id) {
        newChat.selectProviderModel(Provider.Anthropic)
      } else if (modelMention.id === MODEL_GPT_MENTION.id) {
        newChat.selectProviderModel(Provider.OpenAI)
      } else {
        const modelId = modelMention.id.replace('model-', '')
        newChat.selectModel(modelId)
      }
    }

    return newChat
  }

  /**
   * Handle chat submit from ChatInput
   * Injects revealed content as context for AI queries
   */
  async function handleChatSubmit(e: CustomEvent<{ query: string; mentions: MentionItem[] }>) {
    if (!e.detail) return

    const { query, mentions } = e.detail
    const docTitle = libraryMetadata?.title || resource.metadata?.name || 'document'

    log.debug('Chat submit:', {
      query: query.substring(0, 50),
      mentionsCount: mentions?.length || 0
    })

    // Build enhanced query with revealed content context
    let enhancedQuery = query
    const context = get(revealedContent)
    if (context) {
      const plainText = context
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      enhancedQuery = `Here is the content I've read so far from "${docTitle}":\n\n---\n${plainText}\n---\n\nBased ONLY on the above content, please answer: ${query}`
      log.debug('Enhanced query with context, total length:', enhancedQuery.length)
    }

    isGeneratingAI.set(true)
    startAIGeneration('library-document', `Generating response to: ${query.substring(0, 30)}...`)
    chatInputComp?.showStatus({ type: 'status', value: 'Thinking...' })

    try {
      chat = await createNewNoteChat(mentions)
      if (!chat) {
        log.error('Failed to create chat')
        chatInputComp?.showStatus({ type: 'error', value: 'Failed to create chat session' })
        return
      }

      // Inject user question into the reader stream (ChapterPal style)
      if (progressiveReaderRef) {
        const questionBubbleHtml = `<div class="focus-chat-question">${query}</div>`
        progressiveReaderRef.insertChunkNext(questionBubbleHtml)
      }

      chatInputComp?.showStatus({ type: 'status', value: 'Answering...' })
      updateAIGenerationProgress(50, 'Generating response...')

      // Convert to markdown for the AI
      let markdownQuery = await htmlToMarkdown(enhancedQuery)
      if (!markdownQuery) markdownQuery = enhancedQuery

      // Create response with streaming
      const response = await chat.createChatCompletion(markdownQuery, {
        trigger: 'LibraryDocumentChat',
        noteResourceId: resource.id
      })

      if (response.error) {
        log.error('AI error:', response.error)
        chatInputComp?.showStatus({
          type: 'error',
          value: response.error.message || 'An error occurred'
        })
      } else if (!response.output) {
        chatInputComp?.showStatus({ type: 'error', value: 'No response generated' })
      } else {
        // Parse and inject response into reader stream
        const content = await parseChatOutputToHtml(response.output)

        if (progressiveReaderRef) {
          // ChapterPal style: Surf logo + response text with word-by-word streaming
          const chatBubbleHtml = `
            <div class="focus-chat-response">
              <img src="/assets/icon_512.png" alt="Surf" class="focus-chat-icon-img" />
              <div class="bubble-content"></div>
            </div>
          `
          const updateContent = progressiveReaderRef.insertChunkWithStreaming(chatBubbleHtml)

          // Stream words
          const tempDiv = document.createElement('div')
          tempDiv.innerHTML = content
          const textContent = tempDiv.textContent || ''
          const words = textContent.split(/\s+/).filter(Boolean)

          const WORD_DELAY = 25
          let currentContent = ''
          for (let i = 0; i < words.length; i++) {
            currentContent += (i > 0 ? ' ' : '') + words[i]
            updateContent(currentContent)
            await wait(WORD_DELAY)
          }

          // Final update with full HTML for proper formatting
          updateContent(content)
        }

        chatInputComp?.dismissStatus()
      }
    } catch (err) {
      log.error('Error in chat submit:', err)
      chatInputComp?.showStatus({ type: 'error', value: String(err) })
    } finally {
      isGeneratingAI.set(false)
      endAIGeneration()
    }
  }

  /**
   * Handle stop generation request
   */
  function handleStopGeneration() {
    log.debug('Stopping generation')
    if (chat) {
      chat.stopGeneration()
    }
    chatInputComp?.dismissStatus()
    isGeneratingAI.set(false)
    endAIGeneration()
  }

  /**
   * Handle running a suggested prompt
   */
  function handleRunPrompt(e: CustomEvent<{ prompt: { prompt: string; label: string } }>) {
    const { prompt } = e.detail
    handleChatSubmit(
      new CustomEvent('submit', {
        detail: { query: prompt.prompt || prompt.label, mentions: [] }
      })
    )
  }

  // Stub handlers for ChatInput (not needed for library documents but required by component)
  const onFileSelect = () => {
    log.debug('File select triggered (not implemented for library documents)')
  }

  const onMentionSelect = () => {
    log.debug('Mention select triggered (not implemented for library documents)')
  }

  // Handle continue reading from detail page
  async function handleContinueReading(opts: { restoreSession?: boolean; chapterIndex?: number }) {
    currentChapterIndex = opts.chapterIndex ?? 0
    restoreSessionFlag = opts.restoreSession ?? false
    showDetailPage = false
    progressiveReadingEnabled.set(true)
    log.debug('Continue reading:', {
      chapterIndex: currentChapterIndex,
      restoreSession: restoreSessionFlag
    })

    // Get the selected chapter
    const chapter = libraryMetadata?.tableOfContents?.[currentChapterIndex]

    // NEW: Use pre-split chapter markdown if available (ChapterPal-style)
    if (chapter?.markdown) {
      log.debug(
        'Using pre-split chapter markdown:',
        chapter.title,
        `(${chapter.markdown.length} chars)`
      )
      // Debug: Check if markdown contains image URLs
      const imageMatches = chapter.markdown.match(/!\[.*?\]\(surf:\/\/[^)]+\)/g)
      if (imageMatches) {
        log.debug('Found image URLs in markdown:', imageMatches)
      }
      const html = await markdownToHtml(chapter.markdown)
      chapterContent.set(html)
      log.debug('Converted chapter HTML length:', html.length)
      // Debug: Check if HTML contains img tags
      const imgTags = html.match(/<img[^>]+>/g)
      log.debug('Image tags in HTML:', imgTags || 'none')

      // Restore session position after content is loaded
      if (restoreSessionFlag) {
        await restoreReadingSession()
      }
      return
    }

    // FALLBACK: Extract from full HTML (for older documents without per-chapter markdown)
    const html = get(fullContent)
    if (html && libraryMetadata?.tableOfContents) {
      log.debug('Using fallback chapter extraction from full HTML')
      const extractedContent = extractChapterContent(
        html,
        currentChapterIndex,
        libraryMetadata.tableOfContents
      )
      chapterContent.set(extractedContent)
      log.debug('Extracted chapter content length:', extractedContent.length)

      // Restore session position after content is loaded
      if (restoreSessionFlag) {
        await restoreReadingSession()
      }
    }
  }

  /**
   * Get initial chunk index for session restoration
   * Used to tell ProgressiveReader where to start from
   * Always restores if the user is returning to the same chapter they were reading
   */
  function getInitialChunkIndex(): number {
    const session = libraryMetadata?.readingSession
    if (!session) {
      log.debug('getInitialChunkIndex: no session exists')
      return 0
    }

    // If returning to the same chapter that was being read, restore position
    if (session.currentChapterIndex === currentChapterIndex) {
      const savedIndex = session.currentChunkIndex || 0
      log.debug(
        'getInitialChunkIndex: restoring to chunk',
        savedIndex,
        'for chapter',
        currentChapterIndex
      )
      return savedIndex
    }

    // Different chapter - start from beginning
    log.debug('getInitialChunkIndex: different chapter, starting from 0', {
      savedChapter: session.currentChapterIndex,
      currentChapter: currentChapterIndex
    })
    return 0
  }

  /**
   * Restore reading session position from saved state
   */
  async function restoreReadingSession() {
    const session = libraryMetadata?.readingSession
    if (!session || !progressiveReaderRef) {
      log.debug('No session to restore or reader not ready')
      return
    }

    // Wait for reader to initialize
    await wait(100)

    // Only restore if on the same chapter
    if (session.currentChapterIndex === currentChapterIndex) {
      const savedIndex = session.currentChunkIndex || 0
      log.debug('Restoring session:', { chapterIndex: currentChapterIndex, chunkIndex: savedIndex })
      progressiveReaderRef.setRevealedIndex(savedIndex)
      sessionRestored = true
    } else {
      log.debug('Chapter mismatch, not restoring session', {
        savedChapter: session.currentChapterIndex,
        currentChapter: currentChapterIndex
      })
    }
  }

  // Debounce session saves to avoid excessive updates
  let saveSessionTimeout: ReturnType<typeof setTimeout> | null = null

  /**
   * Handle session changes - save reading progress (debounced)
   */
  async function handleSessionChange(
    event: CustomEvent<{
      currentChunkIndex: number
      totalChunks: number
      progressPercent: number
    }>
  ) {
    const { currentChunkIndex, totalChunks, progressPercent: chapterProgressPercent } = event.detail

    // Calculate OVERALL document progress (not just chapter progress)
    const totalChapters = libraryMetadata?.tableOfContents?.length || 1
    const completedChapters = currentChapterIndex
    const chapterProgress = chapterProgressPercent / 100 // 0-1 range

    // Overall progress = (completed chapters + current chapter progress) / total chapters
    const overallProgress = Math.round(
      ((completedChapters + chapterProgress) / totalChapters) * 100
    )

    log.debug('[SessionChange] Received event:', {
      currentChunkIndex,
      totalChunks,
      chapterProgressPercent,
      currentChapterIndex,
      totalChapters,
      overallProgress
    })

    // Debounce: wait 500ms before saving to avoid excessive updates
    if (saveSessionTimeout) {
      clearTimeout(saveSessionTimeout)
    }

    saveSessionTimeout = setTimeout(async () => {
      try {
        // Update the libraryMetadata with session info
        const sessionData = {
          documentId: resource.id,
          lastReadAt: new Date().toISOString(),
          currentChapterIndex,
          currentChunkIndex,
          totalChunks,
          progressPercent: overallProgress // Use overall progress, not per-chapter
        }

        // Update the metadata with the session
        const updatedMetadata = {
          ...libraryMetadata,
          readingSession: sessionData
        }

        log.debug('[SessionChange] Saving to resourceManager...', {
          resourceId: resource.id,
          session: sessionData
        })

        await resourceManager.updateResourceTag(
          resource.id,
          'libraryMetadata',
          JSON.stringify(updatedMetadata)
        )

        // Update local state
        libraryMetadata = updatedMetadata as LibraryDocumentMetadata

        log.debug('[SessionChange] Saved successfully:', sessionData)
      } catch (err) {
        log.error('[SessionChange] Failed to save:', err)
      }
    }, 500)
  }

  // Extract ONLY the current chapter's HTML content
  // This creates chapter isolation - each chapter is a self-contained unit
  function extractChapterContent(
    html: string,
    chapterIndex: number,
    toc: Array<{ title: string; level?: number }>
  ): string {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const blocks = Array.from(doc.body.children)

    const currentChapter = toc[chapterIndex]
    const nextChapter = toc[chapterIndex + 1]

    if (!currentChapter) {
      return html // Return all content if no chapter selected
    }

    // Find the start index for current chapter
    const startIdx = findChapterStartIndex(blocks, currentChapter.title)

    // Find the end index (start of next chapter, or end of document)
    let endIdx = blocks.length
    if (nextChapter) {
      const nextStartIdx = findChapterStartIndex(blocks, nextChapter.title)
      if (nextStartIdx > startIdx) {
        endIdx = nextStartIdx
      }
    }

    log.debug(
      `Chapter ${chapterIndex} bounds: ${startIdx} to ${endIdx} (of ${blocks.length} blocks)`
    )

    // Extract only the blocks for this chapter
    const chapterBlocks = blocks.slice(startIdx, endIdx)

    // Reconstruct HTML from the extracted blocks
    return chapterBlocks.map((el) => el.outerHTML).join('\n')
  }

  // Find the block index where a chapter starts
  function findChapterStartIndex(blocks: Element[], chapterTitle: string): number {
    const cleanTitle = stripPageNumber(chapterTitle)
    const normalizedTitle = normalizeText(cleanTitle)

    for (let i = 0; i < blocks.length; i++) {
      const el = blocks[i]
      const tagName = el.tagName.toLowerCase()

      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
        const text = el.textContent?.trim() || ''
        const cleanText = stripPageNumber(text)
        const normalizedText = normalizeText(cleanText)

        // Check if this heading matches our chapter
        if (
          normalizedText === normalizedTitle ||
          normalizedText.includes(normalizedTitle) ||
          normalizedTitle.includes(normalizedText) ||
          (normalizedTitle.length >= 20 &&
            normalizedText.substring(0, 20) === normalizedTitle.substring(0, 20))
        ) {
          return i
        }
      }
    }

    return 0 // Default to start if not found
  }

  // Find the chunk that contains the chapter heading and jump to it
  function jumpToChapter(chapter: {
    title: string
    level?: number
    startPosition?: number
    chunkStartIndex?: number
  }) {
    if (!progressiveReaderRef) return

    // If we have a cached chunk index, use it
    if (chapter.chunkStartIndex && chapter.chunkStartIndex > 0) {
      log.debug(
        'Using cached chunkStartIndex:',
        chapter.chunkStartIndex,
        'for chapter:',
        chapter.title
      )
      progressiveReaderRef.setRevealedIndex(chapter.chunkStartIndex)
      return
    }

    // Otherwise, search for the heading in the content
    const html = get(content)
    if (!html) return

    // Find the chunk index by searching for the chapter title in the HTML
    const chunkIndex = findChunkForHeading(html, chapter.title, chapter.level)
    if (chunkIndex >= 0) {
      log.debug('Jumping to chunk:', chunkIndex, 'for chapter:', chapter.title)
      progressiveReaderRef.setRevealedIndex(chunkIndex)
    } else {
      log.warn('Could not find chunk for chapter:', chapter.title)
    }
  }

  // Strip trailing page numbers from heading text
  function stripPageNumber(text: string): string {
    return text.replace(/\s+\d+\s*$/, '').trim()
  }

  // Check if a chunk looks like substantive content (not ToC filler)
  // ToC entries are typically: short lines, just numbers, or other headings
  // Actual chapter content has: paragraphs, multiple sentences, substantial text
  function isSubstantiveContent(el: Element): boolean {
    const tagName = el.tagName.toLowerCase()

    // Another heading = ToC pattern
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      return false
    }

    const text = el.textContent?.trim() || ''

    // Very short text = likely ToC filler or page number
    if (text.length < 100) {
      return false
    }

    // Text that's mostly numbers = ToC filler
    const nonDigitChars = text.replace(/[\d\s]/g, '')
    if (nonDigitChars.length < 50) {
      return false
    }

    // Has multiple sentences or is a substantial paragraph
    return true
  }

  // Search HTML to find the REAL chapter heading (one followed by actual content)
  // This is the key insight: ToC entries are followed by more headings or short text
  // Real chapters are followed by substantive paragraphs
  function findChunkForHeading(html: string, headingTitle: string, headingLevel?: number): number {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const body = doc.body

    // Clean the search title (strip page numbers)
    const cleanTitle = stripPageNumber(headingTitle)
    const normalizedTitle = normalizeText(cleanTitle)

    log.debug('Searching for chapter:', {
      original: headingTitle,
      clean: cleanTitle,
      level: headingLevel
    })

    const blockElements = body.children

    // Helper function to check if heading text matches
    const isMatch = (text: string): boolean => {
      const cleanText = stripPageNumber(text)
      const normalizedText = normalizeText(cleanText)
      return (
        normalizedText === normalizedTitle ||
        normalizedText.includes(normalizedTitle) ||
        normalizedTitle.includes(normalizedText) ||
        // Match on first 25 characters (handles truncation)
        (normalizedTitle.length >= 25 &&
          normalizedText.substring(0, 25) === normalizedTitle.substring(0, 25))
      )
    }

    // STRATEGY: Find headings that are followed by SUBSTANTIVE CONTENT
    // This distinguishes real chapters from ToC entries

    const candidates: { index: number; text: string; hasSubstantiveContent: boolean }[] = []

    for (let i = 0; i < blockElements.length; i++) {
      const el = blockElements[i]
      const tagName = el.tagName.toLowerCase()

      // Only consider heading elements
      if (!['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) continue

      const text = el.textContent?.trim() || ''
      if (!isMatch(text)) continue

      // Found a matching heading! Check what comes after it
      let hasSubstantiveContent = false

      // Look at the next few blocks (up to 5) for substantive content
      for (let j = i + 1; j < Math.min(i + 6, blockElements.length); j++) {
        const nextEl = blockElements[j]
        const nextTag = nextEl.tagName.toLowerCase()

        // If we hit another heading before finding content, this is likely a ToC entry
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(nextTag)) {
          break
        }

        // Check if this is substantive content
        if (isSubstantiveContent(nextEl)) {
          hasSubstantiveContent = true
          break
        }
      }

      candidates.push({ index: i, text, hasSubstantiveContent })
      log.debug(
        `Candidate chunk ${i}: "${text.substring(0, 50)}..." hasContent=${hasSubstantiveContent}`
      )
    }

    // Prefer headings with substantive content (these are real chapters)
    const contentMatch = candidates.find((c) => c.hasSubstantiveContent)
    if (contentMatch) {
      log.debug(
        'Found REAL chapter at chunk',
        contentMatch.index,
        ':',
        contentMatch.text.substring(0, 50)
      )
      return contentMatch.index
    }

    // Fallback: return the LAST match (more likely to be the real chapter, not ToC)
    if (candidates.length > 0) {
      const lastMatch = candidates[candidates.length - 1]
      log.debug('Using last candidate at chunk', lastMatch.index, '(no substantive content found)')
      return lastMatch.index
    }

    log.warn('No matching chapter found for:', normalizedTitle)
    return -1
  }

  // Normalize text for comparison (remove extra spaces, lowercase)
  function normalizeText(text: string): string {
    return text.toLowerCase().replace(/\s+/g, ' ').trim()
  }

  // Handle back to overview
  function handleBackToOverview() {
    showDetailPage = true
    log.debug('Back to overview')
  }

  // Extract library metadata from resource tags
  function extractLibraryMetadata(): LibraryDocumentMetadata | null {
    const tag = resource.tags?.find((t: any) => t.name === 'libraryMetadata')
    if (!tag) return null
    try {
      return JSON.parse(tag.value) as LibraryDocumentMetadata
    } catch {
      return null
    }
  }

  // Extract library metadata from resource - fetch fresh data from resourceManager
  async function fetchLibraryMetadata(): Promise<LibraryDocumentMetadata | null> {
    try {
      // Fetch fresh resource data from resourceManager to get latest session state
      const freshResource = await resourceManager.getResource(resource.id)
      const tag = freshResource?.tags?.find((t: any) => t.name === 'libraryMetadata')
      if (!tag) {
        log.debug('No libraryMetadata tag found, falling back to resource prop')
        return extractLibraryMetadata() // Fallback to prop
      }
      const metadata = JSON.parse(tag.value) as LibraryDocumentMetadata
      log.debug('Fetched fresh metadata with session:', metadata.readingSession)
      return metadata
    } catch (err) {
      log.error('Failed to fetch library metadata:', err)
      return extractLibraryMetadata() // Fallback to prop
    }
  }

  onMount(async () => {
    // Fetch fresh library metadata (with latest session data)
    libraryMetadata = await fetchLibraryMetadata()
    log.debug('Library metadata loaded:', {
      title: libraryMetadata?.title,
      hasSession: !!libraryMetadata?.readingSession,
      progress: libraryMetadata?.readingSession?.progressPercent
    })

    // If we have metadata, show detail page; otherwise go straight to reader
    if (libraryMetadata) {
      showDetailPage = true
    } else {
      // No metadata - likely old document, show reader directly
      showDetailPage = false
    }

    // Load content in parallel
    loadContent()
    messagePort.noteReady.send()
  })

  // Derived state
  const title = $derived(resource.metadata?.name || 'Untitled Document')
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<div class="library-document-reader" class:loading={$isLoading}>
  {#if $isLoading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading document...</p>
    </div>
  {:else if $loadError}
    <div class="error-state">
      <h2>Failed to Load Document</h2>
      <p>{$loadError}</p>
      <button onclick={() => loadContent()}>Retry</button>
    </div>
  {:else if showDetailPage && libraryMetadata}
    <!-- Document Detail Page (ChapterPal-style overview) -->
    <DocumentDetailPage
      resourceId={resource.id}
      metadata={libraryMetadata}
      onback={handleBackToOverview}
      oncontinue={handleContinueReading}
    />
  {:else}
    <!-- Focus Mode Reader with Split View -->
    <div class="split-view-container">
      <div
        class="reader-container"
        class:focus-mode={$progressiveReadingEnabled}
        class:with-panel={notebookLMOpen}
        data-reading-mode={$readingPreferences.readingMode}
      >
        <!-- Focus Mode Toolbar -->
        {#if $progressiveReadingEnabled}
          <FocusToolbar
            readingMode={$readingPreferences.readingMode}
            {notebookLMOpen}
            on:togglePreferences={() => readingPreferencesOpen.update((v) => !v)}
            on:toggleToc={() => {}}
            on:toggleNotebookLM={() => (notebookLMOpen = !notebookLMOpen)}
            on:exit={handleProgressiveExit}
            on:backToOverview={handleBackToOverview}
            on:quiz={() => {}}
            on:help={() => {}}
          />
        {/if}

        <!-- Progressive Reader -->
        <ProgressiveReader
          bind:this={progressiveReaderRef}
          content={$chapterContent}
          enabled={$progressiveReadingEnabled}
          initialChunkIndex={getInitialChunkIndex()}
          onAskQuestion={handleAskQuestion}
          on:revealChange={handleRevealChange}
          on:sessionChange={handleSessionChange}
          on:exit={handleProgressiveExit}
        />

        <!-- Reading Preferences -->
        <ReadingPreferences
          open={$readingPreferencesOpen}
          on:close={() => readingPreferencesOpen.set(false)}
        />

        <!-- AI Chat Toolbar (pervasive feature) -->
        {#if $progressiveReadingEnabled}
          <div
            class="library-chat-input-wrapper"
            data-reading-mode={$readingPreferences.readingMode}
          >
            <ChatInput
              bind:this={chatInputComp}
              contextManager={ai.contextManager}
              {tools}
              {onFileSelect}
              {onMentionSelect}
              showFocusToggle={false}
              on:submit={handleChatSubmit}
              on:cancel-completion={handleStopGeneration}
              on:run-prompt={handleRunPrompt}
            />
          </div>
        {/if}
      </div>

      <!-- NotebookLM Panel (Split View) -->
      {#if notebookLMOpen}
        <NotebookLMPanel
          documentTitle={libraryMetadata?.title || title}
          onClose={() => (notebookLMOpen = false)}
        />
      {/if}
    </div>

    <!-- Normal view toggle -->
    {#if !$progressiveReadingEnabled}
      <div class="normal-view">
        <div class="document-header">
          <h1>{title}</h1>
          <div class="header-actions">
            {#if libraryMetadata}
              <button class="back-to-overview-btn" onclick={handleBackToOverview}>
                Back to Overview
              </button>
            {/if}
            <button class="focus-mode-btn" onclick={() => progressiveReadingEnabled.set(true)}>
              Enter Focus Mode
            </button>
          </div>
        </div>
        <div class="document-content">
          {@html $chapterContent}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style lang="scss">
  .library-document-reader {
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: light-dark(#fff, #1b2435);
  }

  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
    color: light-dark(#666, #aaa);
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid light-dark(#eee, #333);
    border-top-color: var(--accent-color, #6366f1);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-state {
    h2 {
      color: #ef4444;
      margin: 0;
    }

    button {
      padding: 0.5rem 1rem;
      background: var(--accent-color, #6366f1);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;

      &:hover {
        opacity: 0.9;
      }
    }
  }

  /* Split View Container for NotebookLM panel */
  .split-view-container {
    display: flex;
    height: 100%;
    width: 100%;
  }

  .reader-container {
    height: 100%;
    flex: 1;
    min-width: 0;
    position: relative;
    transition: width 0.2s ease;

    &.focus-mode {
      &[data-reading-mode='sepia'] {
        background: #f4ecd8;
      }
      &[data-reading-mode='night'] {
        background: #1a1a2e;
      }
    }

    &.with-panel {
      /* Adjust chat input wrapper when panel is open */
      :global(.library-chat-input-wrapper) {
        right: 400px; /* Match panel width */
      }
    }
  }

  .normal-view {
    height: 100%;
    overflow-y: auto;
    padding: 2rem;

    .document-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid light-dark(#eee, #333);

      h1 {
        margin: 0;
        font-size: 1.5rem;
      }

      .header-actions {
        display: flex;
        gap: 0.75rem;
      }
    }

    .back-to-overview-btn {
      padding: 0.5rem 1rem;
      background: transparent;
      color: var(--text-secondary, #666);
      border: 1px solid light-dark(#ddd, #444);
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.875rem;
      transition: all 0.15s ease;

      &:hover {
        background: light-dark(#f5f5f5, #333);
        color: var(--text-primary, #333);
      }
    }

    .focus-mode-btn {
      padding: 0.5rem 1rem;
      background: var(--accent-color, #6366f1);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.875rem;

      &:hover {
        opacity: 0.9;
      }
    }

    .document-content {
      max-width: 65ch;
      margin: 0 auto;
      line-height: 1.7;

      :global(h1),
      :global(h2),
      :global(h3),
      :global(h4),
      :global(h5),
      :global(h6) {
        margin-top: 1.5em;
        margin-bottom: 0.5em;
      }

      :global(p) {
        margin: 1em 0;
      }

      :global(blockquote) {
        border-left: 4px solid var(--accent-color, #6366f1);
        margin: 1em 0;
        padding-left: 1em;
        color: light-dark(#666, #aaa);
      }

      :global(code) {
        background: light-dark(#f4f4f4, #2a2a3a);
        padding: 0.2em 0.4em;
        border-radius: 3px;
        font-size: 0.9em;
      }

      :global(pre) {
        background: light-dark(#f4f4f4, #2a2a3a);
        padding: 1em;
        border-radius: 6px;
        overflow-x: auto;
      }
    }
  }

  /* AI Chat Input Wrapper - positioned at bottom */
  .library-chat-input-wrapper {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 100;
    padding: 0 1rem 1rem;
    background: linear-gradient(
      to top,
      light-dark(#fff, rgb(24, 24, 24)) 80%,
      light-dark(rgba(255, 255, 255, 0), rgba(24, 24, 24, 0)) 100%
    );

    /* Sepia mode */
    &[data-reading-mode='sepia'] {
      background: linear-gradient(to top, #f4ecd8 80%, rgba(244, 236, 216, 0) 100%);
    }

    /* Night mode */
    &[data-reading-mode='night'] {
      background: linear-gradient(to top, #1a1a2e 80%, rgba(26, 26, 46, 0) 100%);
    }
  }

  /* Focus Mode Chat Bubbles - matching TextResource styles */
  :global(.focus-chat-question) {
    display: inline-block;
    float: right;
    clear: both;
    padding: 0.5rem 1rem;
    background: light-dark(#f5f3ea, #2a2620);
    border: 1px solid light-dark(#e8e5d8, #3e3832);
    border-radius: 16px;
    font-family: var(--reading-font-family, Georgia, serif);
    font-size: 0.95em;
    color: light-dark(#5c4b3b, #e8e6e3);
    margin: 0.75rem 0;
  }

  :global(.focus-chat-response) {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    margin: 0.75rem 0;
    padding: 0.75rem 1rem;
    background: light-dark(#fdfcf5, #252117);
    border: 1px solid light-dark(#e8e5d8, #3a3228);
    border-radius: 12px;
    clear: both;
  }

  :global(.focus-chat-icon-img) {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    margin-top: 0.15rem;
    object-fit: contain;
  }

  :global(.focus-chat-response .bubble-content) {
    flex: 1;
    font-family: var(--reading-font-family, Georgia, serif);
    font-size: 1em;
    line-height: 1.6;
    color: light-dark(#2c241b, #e8e6e3);
  }
</style>
