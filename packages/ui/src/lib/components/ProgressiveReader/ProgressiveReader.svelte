<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte'
  import { writable, derived, get } from 'svelte/store'
  import {
    readingPreferences,
    readingPreferencesOpen,
    readingCssVars,
    themeModeColors,
    fontFamilyMap,
    type ReadingPreferences
  } from './readingPreferences.store'
  import SelectionToolbar from './SelectionToolbar.svelte'
  import InlineQuestionCard from './InlineQuestionCard.svelte'
  import InlineAnswerCard from './InlineAnswerCard.svelte'

  // Types for inline Q&A cards
  export type QuestionType = 'tldr' | 'visual' | 'explain' | 'realworld' | 'bigpicture'
  export interface InlineCard {
    id: string
    chunkIndex: number
    type: 'question' | 'answer'
    selectedText: string
    questionType: QuestionType
    content: string
    isStreaming?: boolean
    imageUrl?: string  // For image questions
  }

  // Props
  export let content: string = ''
  export let enabled: boolean = false
  export let initialChunkIndex: number = 0 // For session restoration
  export let onAskQuestion: ((context: {
    selectedText: string
    questionType: QuestionType
    chunkContent: string
    imageUrl?: string
  }) => Promise<AsyncIterable<string> | string>) | undefined = undefined

  // Events
  const dispatch = createEventDispatcher<{
    revealChange: { revealedContent: string; revealedIndex: number; totalChunks: number }
    sessionChange: { currentChunkIndex: number; totalChunks: number; progressPercent: number }
    exit: void
    textSelected: { text: string; bounds: DOMRect; chunkIndex: number }
  }>()

  // State
  const chunks = writable<string[]>([])
  const revealedIndex = writable<number>(0)
  const isStreaming = writable<boolean>(false)
  const streamedText = writable<string>('')

  // Selection state
  let selectionToolbarVisible = false
  let selectionToolbarPosition = { x: 0, y: 0 }
  let selectedText = ''
  let selectedChunkIndex = -1

  // Image selection state (for "Click to ask about figure")
  let imageToolbarVisible = false
  let imageToolbarChunkIndex = -1
  let selectedImageUrl = ''
  let selectedImageCaption = ''

  // Inline Q&A cards state
  const inlineCards = writable<InlineCard[]>([])

  // Derived
  const totalChunks = derived(chunks, ($chunks) => $chunks.length)
  const revealedChunks = derived([chunks, revealedIndex], ([$chunks, $revealedIndex]) =>
    $chunks.slice(0, $revealedIndex + 1)
  )
  const hasMore = derived([revealedIndex, totalChunks], ([$revealedIndex, $totalChunks]) =>
    $revealedIndex < $totalChunks - 1
  )
  const canHide = derived(revealedIndex, ($revealedIndex) => $revealedIndex > 0)
  const progress = derived([revealedIndex, totalChunks], ([$revealedIndex, $totalChunks]) =>
    $totalChunks > 0 ? (($revealedIndex + 1) / $totalChunks) * 100 : 0
  )

  let containerElement: HTMLDivElement
  let streamInterval: ReturnType<typeof setInterval> | null = null

  // Streaming configuration
  const WORD_DELAY_MS = 25 // ms per word for word-by-word
  const INSTANT_REVEAL_DURATION = 300 // ms for instant reveal animation

  function splitContentIntoChunks(html: string): string[] {
    if (!html || html.trim() === '') return []

    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const body = doc.body
    const result: string[] = []

    const blockElements = body.children
    for (let i = 0; i < blockElements.length; i++) {
      const el = blockElements[i]
      if (!el.textContent?.trim() && !el.querySelector('img, video, iframe')) {
        continue
      }
      result.push(el.outerHTML)
    }

    if (result.length === 0 && html.trim()) {
      result.push(html)
    }

    return result
  }

  function getPlainText(html: string): string {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    return doc.body.textContent || ''
  }

  function getWords(html: string): string[] {
    return getPlainText(html).split(/\s+/).filter(Boolean)
  }

  /**
   * Stream text word-by-word
   */
  async function streamWordByWord(chunkHtml: string): Promise<void> {
    const words = getWords(chunkHtml)
    if (words.length === 0) return

    isStreaming.set(true)
    streamedText.set('')

    return new Promise((resolve) => {
      let currentWordIndex = 0

      streamInterval = setInterval(() => {
        if (currentWordIndex < words.length) {
          streamedText.update((current) => {
            return current + (current ? ' ' : '') + words[currentWordIndex]
          })
          currentWordIndex++
        } else {
          if (streamInterval) {
            clearInterval(streamInterval)
            streamInterval = null
          }
          isStreaming.set(false)
          resolve()
        }
      }, WORD_DELAY_MS)
    })
  }

  export function getRevealedContent(): string {
    return get(revealedChunks).join('\n')
  }

  export function getState() {
    return {
      enabled,
      revealedChunkCount: get(revealedIndex) + 1,
      totalChunks: get(totalChunks),
      revealedContent: getRevealedContent()
    }
  }

  /**
   * Get current reading session state for persistence
   */
  export function getCurrentSession() {
    return {
      currentChunkIndex: get(revealedIndex),
      totalChunks: get(totalChunks),
      progressPercent: Math.round(get(progress))
    }
  }

  /**
   * Restore reading position from a saved session
   */
  export function setRevealedIndex(index: number) {
    const maxIndex = get(totalChunks) - 1
    const safeIndex = Math.max(0, Math.min(index, maxIndex))
    revealedIndex.set(safeIndex)
    
    // Scroll to the restored position after DOM update
    tick().then(() => scrollToCurrentChunk())
    emitRevealChange()
  }

  /**
   * Restore reading session from saved state
   */
  export function restoreSession(session: { currentChunkIndex: number }) {
    if (session && typeof session.currentChunkIndex === 'number') {
      setRevealedIndex(session.currentChunkIndex)
    }
  }

  async function revealNextChunk() {
    if (!get(hasMore) || get(isStreaming)) return

    const newIndex = get(revealedIndex) + 1
    const currentChunks = get(chunks)

    if (newIndex < currentChunks.length) {
      revealedIndex.set(newIndex)

      // Word-by-word streaming if enabled
      if ($readingPreferences.wordByWordAnimation) {
        await streamWordByWord(currentChunks[newIndex])
      }

      // Scroll to the new chunk
      await tick()
      scrollToCurrentChunk()
    }

    emitRevealChange()
  }

  function hideLastChunk() {
    if (!get(canHide) || get(isStreaming)) return

    // Stop any ongoing streaming
    if (streamInterval) {
      clearInterval(streamInterval)
      streamInterval = null
    }
    isStreaming.set(false)

    revealedIndex.update((n) => Math.max(0, n - 1))
    emitRevealChange()
  }

  export function next() {
    if (get(hasMore)) {
      revealedIndex.update((i) => i + 1)
      scrollToBottom()
    } else {
      dispatch('exit')
    }
  }

  export function prev() {
    if (get(canHide)) {
      revealedIndex.update((i) => i - 1)
    }
  }

  export function insertChunkNext(htmlContent: string) {
    chunks.update(currentChunks => {
      const currentIndex = get(revealedIndex)
      const newChunks = [...currentChunks]
      // Insert after current index
      newChunks.splice(currentIndex + 1, 0, htmlContent)
      return newChunks
    })
    
    // Reveal the new chunk immediately
    revealedIndex.update((i) => i + 1)
    
    // Ensure we scroll to show it
    tick().then(() => scrollToBottom())
  }

  /**
   * Insert a chunk and stream its text content word-by-word
   * Returns a function to update the content as it streams
   */
  export function insertChunkWithStreaming(wrapperHtml: string): (newContent: string) => void {
    const chunkId = `streaming-chunk-${Date.now()}`
    
    // Create wrapper with unique ID for later updates
    const wrappedHtml = wrapperHtml.replace(
      '<div class="bubble-content">',
      `<div class="bubble-content" id="${chunkId}">`
    )
    
    chunks.update(currentChunks => {
      const currentIndex = get(revealedIndex)
      const newChunks = [...currentChunks]
      newChunks.splice(currentIndex + 1, 0, wrappedHtml)
      return newChunks
    })
    
    revealedIndex.update((i) => i + 1)
    tick().then(() => scrollToBottom())
    
    // Return a function to update the content
    return (newContent: string) => {
      tick().then(() => {
        const element = containerElement?.querySelector(`#${chunkId}`)
        if (element) {
          element.innerHTML = newContent
          scrollToBottom()
        }
      })
    }
  }

  function scrollToBottom() {
    if (containerElement) {
      // Small delay to allow DOM update
      setTimeout(() => {
        const lastChunk = containerElement.querySelector('.focus-chunk:last-child')
        if (lastChunk) {
          lastChunk.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 50)
    }
  }

  function scrollToCurrentChunk() {
    if (!containerElement) return
    const chunkElements = containerElement.querySelectorAll('.focus-chunk')
    const currentIndex = get(revealedIndex)
    const currentChunk = chunkElements[currentIndex] as HTMLElement

    if (currentChunk) {
      currentChunk.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  export function scrollToTop() {
    if (containerElement) {
      containerElement.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  function emitRevealChange() {
    dispatch('revealChange', {
      revealedContent: getRevealedContent(),
      revealedIndex: get(revealedIndex),
      totalChunks: get(totalChunks)
    })

    // Also dispatch session change for auto-saving
    dispatch('sessionChange', getCurrentSession())
  }

  // ============= Text Selection & Q&A Functions =============

  /**
   * Find the chunk index that contains a given DOM node
   */
  function findChunkIndexForNode(node: Node): number {
    if (!containerElement) return -1

    const chunkElements = containerElement.querySelectorAll('.focus-chunk')
    for (let i = 0; i < chunkElements.length; i++) {
      if (chunkElements[i].contains(node)) {
        return i
      }
    }
    return -1
  }

  /**
   * Handle mouse up for text selection
   */
  function handleContentMouseUp(e: MouseEvent) {
    console.log('[ProgressiveReader] handleContentMouseUp called')

    // Don't interfere if the click was on an image button (which shows its own toolbar)
    const target = e.target as HTMLElement
    if (target.closest('.ask-figure-btn') || target.closest('.image-ask-container')) {
      console.log('[ProgressiveReader] Clicked on image button, ignoring')
      return
    }

    // Don't interfere if the click was on the selection toolbar itself
    if (target.closest('.selection-toolbar')) {
      console.log('[ProgressiveReader] Clicked on selection toolbar, ignoring')
      return
    }

    // Small delay to let the selection complete
    setTimeout(() => {
      const selection = window.getSelection()
      console.log('[ProgressiveReader] Selection check:', {
        hasSelection: !!selection,
        text: selection?.toString().trim(),
        length: selection?.toString().trim().length
      })

      if (!selection || !selection.toString().trim()) {
        // No text selected - close any open toolbar (including image toolbar)
        hideSelectionToolbar()
        return
      }

      const text = selection.toString().trim()
      if (text.length < 3) {
        console.log('[ProgressiveReader] Text too short, hiding toolbar')
        hideSelectionToolbar()
        return
      }

      // Get selection bounds
      const range = selection.getRangeAt(0)
      const bounds = range.getBoundingClientRect()

      // Find which chunk contains the selection
      const chunkIndex = findChunkIndexForNode(range.startContainer)
      console.log('[ProgressiveReader] Found chunk index:', chunkIndex)

      if (chunkIndex === -1) {
        console.log('[ProgressiveReader] Chunk not found, hiding toolbar')
        hideSelectionToolbar()
        return
      }

      // Store selection info
      selectedText = text
      selectedChunkIndex = chunkIndex

      // Position toolbar above selection, centered
      // Ensure toolbar doesn't go off-screen (minimum 60px from top for toolbar height)
      const toolbarY = Math.max(60, bounds.top - 10)
      selectionToolbarPosition = {
        x: bounds.left + bounds.width / 2,
        y: toolbarY
      }
      selectionToolbarVisible = true

      console.log('[ProgressiveReader] Text selection toolbar should be visible:', {
        text: text.substring(0, 50),
        position: selectionToolbarPosition,
        bounds: { top: bounds.top, left: bounds.left, width: bounds.width },
        chunkIndex
      })

      // Dispatch event
      dispatch('textSelected', { text, bounds, chunkIndex })
    }, 10)
  }

  /**
   * Hide the selection toolbar
   */
  function hideSelectionToolbar() {
    selectionToolbarVisible = false
    selectedText = ''
    selectedChunkIndex = -1
    // Also reset image state
    imageToolbarVisible = false
    selectedImageUrl = ''
    selectedImageCaption = ''
    imageToolbarChunkIndex = -1
  }

  /**
   * Handle toolbar option selection
   */
  async function handleToolbarSelect(event: CustomEvent<{ option: QuestionType }>) {
    const { option } = event.detail
    if (!selectedText || selectedChunkIndex === -1) return

    // Hide toolbar
    selectionToolbarVisible = false

    // Clear browser selection
    window.getSelection()?.removeAllRanges()

    // Check if this is an image selection
    if (imageToolbarVisible && selectedImageUrl) {
      // Reset image state
      const imgUrl = selectedImageUrl
      const imgCaption = selectedImageCaption
      const imgChunkIndex = imageToolbarChunkIndex

      imageToolbarVisible = false
      selectedImageUrl = ''
      selectedImageCaption = ''
      imageToolbarChunkIndex = -1
      selectedText = ''
      selectedChunkIndex = -1

      // Execute image question
      await executeImageQuestion(imgChunkIndex, imgUrl, imgCaption, option)
      return
    }

    // Reset image state
    imageToolbarVisible = false

    // Create question card
    const questionId = `q-${Date.now()}`
    const answerId = `a-${Date.now()}`
    const currentChunks = get(chunks)
    const chunkContent = currentChunks[selectedChunkIndex] || ''

    // Add question card
    inlineCards.update(cards => [
      ...cards,
      {
        id: questionId,
        chunkIndex: selectedChunkIndex,
        type: 'question' as const,
        selectedText,
        questionType: option,
        content: ''
      }
    ])

    // Add answer card in streaming state
    inlineCards.update(cards => [
      ...cards,
      {
        id: answerId,
        chunkIndex: selectedChunkIndex,
        type: 'answer' as const,
        selectedText,
        questionType: option,
        content: '',
        isStreaming: true
      }
    ])

    // Scroll to show the new cards
    await tick()
    scrollToChunk(selectedChunkIndex)

    // If we have an AI callback, use it
    if (onAskQuestion) {
      try {
        const result = await onAskQuestion({
          selectedText,
          questionType: option,
          chunkContent
        })

        // Handle streaming or direct response
        if (typeof result === 'string') {
          // Direct response
          inlineCards.update(cards =>
            cards.map(card =>
              card.id === answerId
                ? { ...card, content: result, isStreaming: false }
                : card
            )
          )
        } else {
          // Streaming response
          let fullContent = ''
          for await (const chunk of result) {
            fullContent += chunk
            inlineCards.update(cards =>
              cards.map(card =>
                card.id === answerId
                  ? { ...card, content: fullContent }
                  : card
              )
            )
            // Scroll to keep up with streaming
            await tick()
            scrollToChunk(selectedChunkIndex)
          }
          // Mark as done streaming
          inlineCards.update(cards =>
            cards.map(card =>
              card.id === answerId
                ? { ...card, isStreaming: false }
                : card
            )
          )
        }
      } catch (error) {
        console.error('Error getting AI response:', error)
        inlineCards.update(cards =>
          cards.map(card =>
            card.id === answerId
              ? { ...card, content: 'Sorry, there was an error getting a response.', isStreaming: false }
              : card
          )
        )
      }
    } else {
      // No AI callback - show placeholder
      inlineCards.update(cards =>
        cards.map(card =>
          card.id === answerId
            ? { ...card, content: 'AI response will appear here...', isStreaming: false }
            : card
        )
      )
    }

    // Reset selection state
    selectedText = ''
    selectedChunkIndex = -1
  }

  /**
   * Handle click on "Ask about this figure" button - shows toolbar
   */
  function handleImageButtonClick(e: MouseEvent, chunkIndex: number, imageUrl: string, caption: string) {
    e.stopPropagation()
    console.log('[ProgressiveReader] handleImageButtonClick called', { chunkIndex, imageUrl, caption })

    // Store image info
    selectedImageUrl = imageUrl
    selectedImageCaption = caption
    imageToolbarChunkIndex = chunkIndex

    // Get button position for toolbar
    const button = e.currentTarget as HTMLElement
    const rect = button.getBoundingClientRect()

    // Position toolbar above the button
    // Ensure toolbar doesn't go off-screen (minimum 60px from top for toolbar height)
    const toolbarY = Math.max(60, rect.top - 10)
    selectionToolbarPosition = {
      x: rect.left + rect.width / 2,
      y: toolbarY
    }

    // Show toolbar (reusing the same toolbar for both text and images)
    imageToolbarVisible = true
    selectionToolbarVisible = true

    // Set selected text to the caption for display
    selectedText = caption || 'this figure'
    selectedChunkIndex = chunkIndex

    console.log('[ProgressiveReader] Toolbar should be visible now', {
      selectionToolbarVisible,
      position: selectionToolbarPosition,
      selectedText
    })
  }

  /**
   * Execute the actual AI question for image (called after toolbar selection)
   */
  async function executeImageQuestion(chunkIndex: number, imageUrl: string, caption: string, questionType: QuestionType) {
    const questionId = `q-${Date.now()}`
    const answerId = `a-${Date.now()}`
    const currentChunks = get(chunks)
    const chunkContent = currentChunks[chunkIndex] || ''

        // Create a description for the image question
    const imageDescription = caption || 'this figure'

    // Add question card
    inlineCards.update(cards => [
      ...cards,
      {
        id: questionId,
        chunkIndex,
        type: 'question' as const,
        selectedText: imageDescription,
        questionType,
        content: '',
        imageUrl
      }
    ])

    // Add answer card in streaming state
    inlineCards.update(cards => [
      ...cards,
      {
        id: answerId,
        chunkIndex,
        type: 'answer' as const,
        selectedText: imageDescription,
        questionType,
        content: '',
        isStreaming: true,
        imageUrl
      }
    ])

    await tick()
    scrollToChunk(chunkIndex)

    // If we have an AI callback, use it
    if (onAskQuestion) {
      try {
        const result = await onAskQuestion({
          selectedText: `[Image: ${imageDescription}]`,
          questionType,
          chunkContent,
          imageUrl
        })

        if (typeof result === 'string') {
          inlineCards.update(cards =>
            cards.map(card =>
              card.id === answerId
                ? { ...card, content: result, isStreaming: false }
                : card
            )
          )
        } else {
          let fullContent = ''
          for await (const chunk of result) {
            fullContent += chunk
            inlineCards.update(cards =>
              cards.map(card =>
                card.id === answerId
                  ? { ...card, content: fullContent }
                  : card
              )
            )
            await tick()
            scrollToChunk(chunkIndex)
          }
          inlineCards.update(cards =>
            cards.map(card =>
              card.id === answerId
                ? { ...card, isStreaming: false }
                : card
            )
          )
        }
      } catch (error) {
        console.error('Error getting AI response:', error)
        inlineCards.update(cards =>
          cards.map(card =>
            card.id === answerId
              ? { ...card, content: 'Sorry, there was an error getting a response.', isStreaming: false }
              : card
          )
        )
      }
    } else {
      inlineCards.update(cards =>
        cards.map(card =>
          card.id === answerId
            ? { ...card, content: 'AI response will appear here...', isStreaming: false }
            : card
        )
      )
    }
  }

  /**
   * Get all Q&A cards for a specific chunk
   */
  function getCardsForChunk(chunkIndex: number): InlineCard[] {
    return get(inlineCards).filter(card => card.chunkIndex === chunkIndex)
  }

  /**
   * Check if a chunk contains an image
   */
  function chunkHasImage(chunkHtml: string): boolean {
    return chunkHtml.includes('<img')
  }

  /**
   * Extract image info from a chunk
   */
  function extractImageInfo(chunkHtml: string): { url: string; caption: string } | null {
    const parser = new DOMParser()
    const doc = parser.parseFromString(chunkHtml, 'text/html')
    const img = doc.querySelector('img')
    if (!img) return null

    return {
      url: img.getAttribute('src') || '',
      caption: img.getAttribute('alt') || img.getAttribute('title') || ''
    }
  }

  /**
   * Scroll to a specific chunk
   */
  function scrollToChunk(index: number) {
    if (!containerElement) return
    const chunkElements = containerElement.querySelectorAll('.focus-chunk')
    const targetChunk = chunkElements[index] as HTMLElement
    if (targetChunk) {
      targetChunk.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  /**
   * Export cards for persistence
   */
  export function getInlineCards(): InlineCard[] {
    return get(inlineCards)
  }

  /**
   * Restore cards from saved state
   */
  export function setInlineCards(cards: InlineCard[]) {
    inlineCards.set(cards)
  }

  // ============= End Selection & Q&A Functions =============


  /**
   * Handle highlight event
   */
  function handleHighlight(event: CustomEvent<{ color: string }>) {
    const { color } = event.detail
    if (!selectedText || selectedChunkIndex === -1) return

    console.log('[ProgressiveReader] Highlighting text:', { text: selectedText, color })

    // Hide toolbar
    selectionToolbarVisible = false
    
    // Update the chunk content
    chunks.update(currentChunks => {
      const newChunks = [...currentChunks]
      const chunkHtml = newChunks[selectedChunkIndex]
      
      // Simple highlight replacement (caveat: this is a simple text match, could match wrong instance if multiple exist)
      // A more robust solution would use Ranges or precise offset tracking, but for now we try to be smart about context
      if (chunkHtml.includes(selectedText)) {
        // Create highlight span with style
        const highlightSpan = `<mark style="background-color: ${color}; color: inherit; border-radius: 4px; padding: 2px 0;">${selectedText}</mark>`
        
        // Replace only the first occurrence or try to be specific? 
        // For MVP, replacing the first occurrence that mimics the selection is a reasonable start
        newChunks[selectedChunkIndex] = chunkHtml.replace(selectedText, highlightSpan)
      }
      
      return newChunks
    })

    // Reset selection
    window.getSelection()?.removeAllRanges()
    selectedText = ''
    selectedChunkIndex = -1
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!enabled) return
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
      e.preventDefault()
      revealNextChunk()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      hideLastChunk()
    }
  }

  // Handle escape to close toolbars
  function handleKeyUp(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (selectionToolbarVisible) {
        hideSelectionToolbar()
      }
      if ($readingPreferencesOpen) {
        readingPreferencesOpen.set(false)
      }
    }
  }

  // Add keyboard listeners
  onMount(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    
    // Also listen for selection changes to possibly hide toolbar if selection clears
    document.addEventListener('selectionchange', () => {
      // Logic handled in mouseup mostly, but could be enhanced here
    })
  })

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
    if (streamInterval) clearInterval(streamInterval)
  })

  export function reset() {
    if (streamInterval) {
      clearInterval(streamInterval)
      streamInterval = null
    }
    isStreaming.set(false)
    revealedIndex.set(0)
    emitRevealChange()
  }

  export async function revealAll() {
    if (streamInterval) {
      clearInterval(streamInterval)
      streamInterval = null
    }
    isStreaming.set(false)
    revealedIndex.set(get(totalChunks) - 1)
    emitRevealChange()
  }

  $: if (content) {
    const newChunks = splitContentIntoChunks(content)
    chunks.set(newChunks)
    // Use initialChunkIndex for session restoration, otherwise start at 0
    const startIndex = Math.min(initialChunkIndex, newChunks.length - 1)
    revealedIndex.set(Math.max(0, startIndex))
    emitRevealChange()
  }

  // Apply CSS variables from preferences
  $: cssVars = $readingCssVars

  onMount(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyDown)
    }
  })

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown)
    if (streamInterval) {
      clearInterval(streamInterval)
    }
  })

  $: if (enabled) {
    window.addEventListener('keydown', handleKeyDown)
  } else {
    window.removeEventListener('keydown', handleKeyDown)
  }
</script>

{#if enabled}
  <div
    class="focus-reader"
    class:night={$readingPreferences.readingMode === 'night'}
    class:sepia={$readingPreferences.readingMode === 'sepia'}
    bind:this={containerElement}
    style="
      --reading-bg: {cssVars['--reading-bg']};
      --reading-text: {cssVars['--reading-text']};
      --reading-muted: {cssVars['--reading-muted']};
      --reading-font-family: {cssVars['--reading-font-family']};
      --reading-font-size: {cssVars['--reading-font-size']};
      --reading-line-height: {cssVars['--reading-line-height']};
      --reading-max-width: {cssVars['--reading-max-width']};
    "
  >
    <!-- Progress bar -->
    <div class="focus-progress">
      <div class="focus-progress-bar" style="width: {$progress}%"></div>
    </div>

    <!-- Content area -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="focus-content" on:mouseup={handleContentMouseUp}>
      {#each $chunks as chunk, index}
        {#if index <= $revealedIndex}
          <div
            class="focus-chunk"
            class:current={index === $revealedIndex}
            class:streaming={index === $revealedIndex && $isStreaming}
          >
            {#if index === $revealedIndex && $isStreaming && $readingPreferences.wordByWordAnimation}
              <!-- Word-by-word streaming content -->
              <div class="focus-chunk-content streaming-text">
                {$streamedText}<span class="cursor">|</span>
              </div>
            {:else if chunkHasImage(chunk)}
              <!-- Image chunk with ask overlay on hover -->
              {@const imageInfo = extractImageInfo(chunk)}
              <div class="focus-chunk-content image-chunk">
                {@html chunk}
                {#if imageInfo}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="image-ask-container" on:mouseup|stopPropagation>
                    <button
                      class="ask-figure-btn"
                      on:click|stopPropagation={(e) => imageInfo && handleImageButtonClick(e, index, imageInfo.url, imageInfo.caption)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                      </svg>
                      <span>Click to ask about this figure</span>
                    </button>
                  </div>
                {/if}
              </div>
            {:else}
              <!-- Full content -->
              <div class="focus-chunk-content">
                {@html chunk}
              </div>
            {/if}
            {#if index === $revealedIndex && !$isStreaming}
              <span class="focus-marker">●</span>
            {/if}
          </div>

          <!-- Render Q&A cards for this chunk -->
          {#each $inlineCards.filter(card => card.chunkIndex === index) as card (card.id)}
            {#if card.type === 'question'}
              <InlineQuestionCard
                selectedText={card.selectedText}
                questionType={card.questionType}
              />
            {:else}
              <InlineAnswerCard
                content={card.content}
                isStreaming={card.isStreaming || false}
              />
            {/if}
          {/each}
        {/if}
      {/each}
    </div>

    <!-- Selection Toolbar -->
    <SelectionToolbar
      visible={selectionToolbarVisible}
      position={selectionToolbarPosition}
      context={imageToolbarVisible ? 'image' : 'text'}
      on:select={handleToolbarSelect}
      on:highlight={handleHighlight}
      on:close={hideSelectionToolbar}
    />

    <!-- Navigation hint -->
    <div class="focus-hint" class:completed={!$hasMore && !$isStreaming}>
      {#if $isStreaming}
        <span class="hint-streaming">Reading...</span>
      {:else if $hasMore}
        <span class="hint-keys">
          <kbd>→</kbd> continue
          <span class="hint-sep">·</span>
          <kbd>←</kbd> back
          <span class="hint-sep">·</span>
          <kbd>esc</kbd> exit
        </span>
      {:else}
        <span class="hint-complete">✓ End of article</span>
      {/if}
    </div>
  </div>
{:else}
  <slot />
{/if}

<style>
  .focus-reader {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    background: var(--reading-bg, #ffffff);
    color: var(--reading-text, #1a1a1a);
    display: flex;
    flex-direction: column;
    transition: background 0.3s ease, color 0.3s ease;
  }

  .focus-reader.sepia {
    background: #fdfcf0;
    color: #5b4636;
  }

  .focus-reader.night {
    background: #1a1a1a;
    color: #e8e6e3;
  }

  .focus-progress {
    position: sticky;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: rgba(0, 0, 0, 0.06);
    z-index: 10;
  }

  .focus-reader.night .focus-progress {
    background: rgba(255, 255, 255, 0.1);
  }

  .focus-progress-bar {
    height: 100%;
    background: #b45309;
    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .focus-content {
    flex: 1;
    max-width: var(--reading-max-width, 680px);
    width: 100%;
    margin: 0 auto;
    padding: 3rem 2rem 6rem;
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
  }

  .focus-chunk {
    position: relative;
    margin-bottom: 1.5rem;
    opacity: 0;
    transform: translateY(12px);
    animation: chunkReveal 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  @keyframes chunkReveal {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .focus-chunk-content {
    font-family: var(--reading-font-family, Georgia, serif);
    font-size: var(--reading-font-size, 18px);
    line-height: var(--reading-line-height, 1.8);
    letter-spacing: -0.01em;
  }

  .streaming-text {
    white-space: pre-wrap;
  }

  .cursor {
    animation: blink 0.8s infinite;
    color: #b45309;
    font-weight: 300;
  }

  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }

  /* Content styling */
  .focus-chunk-content :global(p) {
    margin: 0;
  }

  .focus-chunk-content :global(h1) {
    font-size: 2rem;
    font-weight: 700;
    margin: 0 0 0.5rem;
    line-height: 1.3;
  }

  .focus-chunk-content :global(h2) {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0 0 0.5rem;
  }

  .focus-chunk-content :global(h3) {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0 0 0.5rem;
  }

  .focus-chunk-content :global(ul),
  .focus-chunk-content :global(ol) {
    margin: 0;
    padding-left: 1.5rem;
  }

  .focus-chunk-content :global(blockquote) {
    margin: 0;
    padding-left: 1.25rem;
    border-left: 3px solid #b45309;
    color: var(--reading-muted, #6b7280);
    font-style: italic;
  }

  .focus-chunk-content :global(pre) {
    margin: 0;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 8px;
    overflow-x: auto;
    font-size: 0.875rem;
  }

  .focus-reader.night .focus-chunk-content :global(pre) {
    background: rgba(255, 255, 255, 0.05);
  }

  .focus-chunk-content :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 0.5rem 0;
  }

  /* Image chunk with ask button - only visible on hover */
  .image-chunk {
    position: relative;
  }

  .image-ask-container {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.2s ease, visibility 0.2s ease;
    z-index: 5;
  }

  /* Show button only when hovering on image chunk */
  .image-chunk:hover .image-ask-container {
    opacity: 1;
    visibility: visible;
  }

  .ask-figure-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: rgba(255, 251, 245, 0.98);
    border: 1px solid rgba(180, 160, 140, 0.3);
    border-radius: 20px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    color: #5b4a3f;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
    transition: all 0.2s ease;
    white-space: nowrap;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    backdrop-filter: blur(8px);
  }

  .ask-figure-btn:hover {
    background: #fff;
    border-color: #b45309;
    color: #b45309;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    transform: scale(1.02);
  }

  .ask-figure-btn svg {
    color: #b45309;
  }

  .focus-reader.night .ask-figure-btn {
    background: rgba(42, 37, 32, 0.98);
    border-color: rgba(255, 255, 255, 0.15);
    color: #d4c4b0;
  }

  .focus-reader.night .ask-figure-btn:hover {
    background: #2d2a25;
    border-color: #f59e0b;
    color: #f59e0b;
  }

  .focus-reader.night .ask-figure-btn svg {
    color: #f59e0b;
  }

  .focus-reader.sepia .ask-figure-btn {
    background: rgba(245, 240, 230, 0.98);
  }

  .focus-reader.sepia .ask-figure-btn:hover {
    background: #f5f0e6;
  }

  /* Text selection styles */
  .focus-chunk-content ::selection {
    background: rgba(180, 83, 9, 0.2);
    color: inherit;
  }

  .focus-reader.night .focus-chunk-content ::selection {
    background: rgba(245, 158, 11, 0.3);
  }

  .focus-chunk-content :global(a) {
    color: #b45309;
    text-decoration: none;
  }

  .focus-chunk-content :global(a:hover) {
    text-decoration: underline;
  }

  /* Position marker */
  .focus-marker {
    display: inline-block;
    color: #b45309;
    margin-left: 0.35rem;
    font-size: 0.6rem;
    vertical-align: middle;
    animation: markerPulse 1.5s ease-in-out infinite;
  }

  @keyframes markerPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* Navigation hint */
  .focus-hint {
    position: sticky;
    bottom: 0;
    padding: 1.5rem;
    background: linear-gradient(to top, var(--reading-bg, #fff) 60%, transparent);
    text-align: center;
    font-size: 0.8125rem;
    color: var(--reading-muted, #888);
  }

  .focus-reader.sepia .focus-hint {
    background: linear-gradient(to top, #fdfcf0 60%, transparent);
  }

  .focus-reader.night .focus-hint {
    background: linear-gradient(to top, #1a1a1a 60%, transparent);
  }

  .focus-hint.completed {
    color: #b45309;
  }

  .hint-keys {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .hint-sep {
    opacity: 0.4;
  }

  .hint-streaming {
    color: #b45309;
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    height: 1.5rem;
    padding: 0 0.4rem;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 500;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
  }

  .focus-reader.night kbd {
    background: rgba(255, 255, 255, 0.1);
  }
</style>
