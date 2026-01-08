<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { get, type Writable } from 'svelte/store'
  import ContextualChat from './ContextualChat.svelte'
  import Overlay from '../Core/components/Overlays/Overlay.svelte'
  import { useLogScope } from '@deta/utils'

  const log = useLogScope('ContextualChatManager')

  let showOverlay = $state(false)

  // Full-screen overlay bounds to create backdrop effect
  let overlayBounds = $state({
    x: 0,
    y: 0,
    width: 1920,
    height: 1080
  })

  // Resizable dimensions
  let chatWidth = $state(700)
  let chatHeight = $state(400)
  const MIN_WIDTH = 400
  const MAX_WIDTH = 1200
  const MIN_HEIGHT = 250
  const MAX_HEIGHT = 800

  // Position state for dragging (null = centered, otherwise absolute positioned)
  let posX = $state<number | null>(null)
  let posY = $state<number | null>(null)

  // Interaction state - unified for both resize and drag
  let interactionMode = $state<'none' | 'resize' | 'drag'>('none')
  let resizeDirection = $state<string | null>(null)
  let startMouseX = 0
  let startMouseY = 0
  let startWidth = 0
  let startHeight = 0
  let startPosX = 0
  let startPosY = 0

  // Reference to the backdrop element - used to get the correct window context
  let backdropEl: HTMLDivElement

  let {
    visible,
    selectedText,
    pageContext,
    pageTitle,
    pageUrl
  }: {
    visible: Writable<boolean>
    selectedText: Writable<string>
    pageContext: Writable<string>
    pageTitle: Writable<string>
    pageUrl: Writable<string>
  } = $props()

  let mounted = $state(false)
  let openedViaIPC = $state(false)
  let ipcOpenTime = $state(0)

  // Get the correct window and document from the DOM element (critical for Electron overlay)
  const getOwnerWindow = (): Window => {
    if (backdropEl && backdropEl.ownerDocument && backdropEl.ownerDocument.defaultView) {
      return backdropEl.ownerDocument.defaultView
    }
    return window
  }

  const getOwnerDocument = (): Document => {
    if (backdropEl && backdropEl.ownerDocument) {
      return backdropEl.ownerDocument
    }
    return document
  }

  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && get(visible)) {
      visible.set(false)
      openedViaIPC = false
    }
  }

  const updateOverlayBounds = () => {
    const win = getOwnerWindow()
    overlayBounds = {
      x: 0,
      y: 0,
      width: win.innerWidth,
      height: win.innerHeight
    }
  }

  // Get centered position
  const getCenteredPosition = () => {
    const win = getOwnerWindow()
    return {
      x: (win.innerWidth - chatWidth) / 2,
      y: (win.innerHeight - chatHeight) / 2
    }
  }

  // Global mouse move handler
  const handleGlobalMouseMove = (e: MouseEvent) => {
    if (interactionMode === 'none') return

    e.preventDefault()
    e.stopPropagation()

    const deltaX = e.clientX - startMouseX
    const deltaY = e.clientY - startMouseY

    log.debug('[Resize/Drag] mousemove', { deltaX, deltaY, mode: interactionMode })

    if (interactionMode === 'drag') {
      const win = getOwnerWindow()
      let newX = startPosX + deltaX
      let newY = startPosY + deltaY

      // Keep within viewport bounds
      const maxX = win.innerWidth - chatWidth
      const maxY = win.innerHeight - chatHeight
      newX = Math.max(0, Math.min(maxX, newX))
      newY = Math.max(0, Math.min(maxY, newY))

      posX = newX
      posY = newY
    } else if (interactionMode === 'resize' && resizeDirection) {
      const win = getOwnerWindow()
      let newWidth = startWidth
      let newHeight = startHeight
      let newX = startPosX
      let newY = startPosY

      // Handle horizontal resize
      if (resizeDirection.includes('e')) {
        newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + deltaX))
      } else if (resizeDirection.includes('w')) {
        const widthDelta = Math.min(
          startWidth - MIN_WIDTH,
          Math.max(startWidth - MAX_WIDTH, deltaX)
        )
        newWidth = startWidth - widthDelta
        newX = startPosX + widthDelta
      }

      // Handle vertical resize
      if (resizeDirection.includes('s')) {
        newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeight + deltaY))
      } else if (resizeDirection.includes('n')) {
        const heightDelta = Math.min(
          startHeight - MIN_HEIGHT,
          Math.max(startHeight - MAX_HEIGHT, deltaY)
        )
        newHeight = startHeight - heightDelta
        newY = startPosY + heightDelta
      }

      // Keep within viewport
      const maxX = win.innerWidth - newWidth
      const maxY = win.innerHeight - newHeight
      newX = Math.max(0, Math.min(maxX, newX))
      newY = Math.max(0, Math.min(maxY, newY))

      chatWidth = newWidth
      chatHeight = newHeight
      posX = newX
      posY = newY
    }
  }

  // Global mouse up handler
  const handleGlobalMouseUp = (e: MouseEvent) => {
    log.debug('[Resize/Drag] mouseup', { mode: interactionMode })
    if (interactionMode !== 'none') {
      e.preventDefault()
      e.stopPropagation()
      stopInteraction()
    }
  }

  // Attach event listeners to the correct window
  const attachGlobalListeners = () => {
    const win = getOwnerWindow()
    const doc = getOwnerDocument()

    log.debug('[Resize/Drag] Attaching global listeners to overlay window')

    // Use capture phase for reliability
    win.addEventListener('mousemove', handleGlobalMouseMove, true)
    win.addEventListener('mouseup', handleGlobalMouseUp, true)
    doc.body.style.cursor =
      interactionMode === 'drag' ? 'grabbing' : getCursorForDirection(resizeDirection || '')
    doc.body.style.userSelect = 'none'
  }

  // Detach event listeners
  const detachGlobalListeners = () => {
    const win = getOwnerWindow()
    const doc = getOwnerDocument()

    log.debug('[Resize/Drag] Detaching global listeners')

    win.removeEventListener('mousemove', handleGlobalMouseMove, true)
    win.removeEventListener('mouseup', handleGlobalMouseUp, true)
    doc.body.style.cursor = ''
    doc.body.style.userSelect = ''
  }

  // Start resize interaction
  const startResize = (e: MouseEvent, direction: string) => {
    e.preventDefault()
    e.stopPropagation()

    log.debug('[Resize] Starting resize', { direction, clientX: e.clientX, clientY: e.clientY })

    // Initialize position if centered
    if (posX === null || posY === null) {
      const centered = getCenteredPosition()
      posX = centered.x
      posY = centered.y
    }

    interactionMode = 'resize'
    resizeDirection = direction
    startMouseX = e.clientX
    startMouseY = e.clientY
    startWidth = chatWidth
    startHeight = chatHeight
    startPosX = posX
    startPosY = posY

    attachGlobalListeners()
  }

  // Start drag interaction
  const startDrag = (e: MouseEvent) => {
    // Only drag from header area, not from buttons
    const target = e.target as HTMLElement
    if (
      target.closest('button') ||
      target.closest('.provider-toggle') ||
      target.closest('.close-btn')
    ) {
      return
    }

    e.preventDefault()
    e.stopPropagation()

    log.debug('[Drag] Starting drag', { clientX: e.clientX, clientY: e.clientY })

    // Initialize position if centered
    if (posX === null || posY === null) {
      const centered = getCenteredPosition()
      posX = centered.x
      posY = centered.y
    }

    interactionMode = 'drag'
    startMouseX = e.clientX
    startMouseY = e.clientY
    startPosX = posX
    startPosY = posY

    attachGlobalListeners()
  }

  // Stop any interaction
  const stopInteraction = () => {
    log.debug('[Resize/Drag] Stopping interaction')
    interactionMode = 'none'
    resizeDirection = null
    detachGlobalListeners()
  }

  const getCursorForDirection = (direction: string): string => {
    const cursors: Record<string, string> = {
      n: 'ns-resize',
      s: 'ns-resize',
      e: 'ew-resize',
      w: 'ew-resize',
      ne: 'nesw-resize',
      nw: 'nwse-resize',
      se: 'nwse-resize',
      sw: 'nesw-resize'
    }
    return cursors[direction] || 'default'
  }

  onMount(() => {
    mounted = true

    // Delay to ensure DOM element is available
    setTimeout(() => {
      updateOverlayBounds()

      const win = getOwnerWindow()
      const doc = getOwnerDocument()

      log.debug(
        '[ContextualChatManager] Mounted, owner window:',
        win !== window ? 'OVERLAY' : 'MAIN'
      )

      win.addEventListener('resize', updateOverlayBounds)
      doc.addEventListener('keydown', handleEscape)
    }, 100)

    const unsubVisible = visible.subscribe((isVisible) => {
      showOverlay = isVisible

      if (isVisible && !openedViaIPC) {
        const text = get(selectedText)
        if (text && text.length > 0) {
          const mainDocSelection = window.getSelection()?.toString().trim() || ''
          if (mainDocSelection.length === 0) {
            openedViaIPC = true
            ipcOpenTime = Date.now()
          }
        }
      } else if (!isVisible) {
        openedViaIPC = false
        // Reset position when closing
        posX = null
        posY = null
      }
    })

    return () => {
      unsubVisible()
    }
  })

  onDestroy(() => {
    mounted = false
    stopInteraction()

    try {
      const win = getOwnerWindow()
      const doc = getOwnerDocument()
      win.removeEventListener('resize', updateOverlayBounds)
      doc.removeEventListener('keydown', handleEscape)
    } catch (e) {
      // Window may already be destroyed
    }
  })

  const handleBackdropClick = (e: MouseEvent) => {
    // Don't close if we're in the middle of any interaction
    if (interactionMode !== 'none') {
      e.preventDefault()
      e.stopPropagation()
      return
    }

    const target = e.target as HTMLElement
    // Only close if clicking directly on backdrop element itself
    // Check the target is exactly the backdrop, not any child
    if (target === backdropEl) {
      log.debug('[Backdrop] Closing popup - clicked on backdrop')
      visible.set(false)
      openedViaIPC = false
    }
  }

  // Compute style for chat wrapper
  const getWrapperStyle = () => {
    if (posX !== null && posY !== null) {
      return `width: ${chatWidth}px; height: ${chatHeight}px; left: ${posX}px; top: ${posY}px; transform: none;`
    }
    return `width: ${chatWidth}px; height: ${chatHeight}px;`
  }
</script>

<!-- Full-screen Overlay that contains both backdrop and chat -->
{#if showOverlay}
  <Overlay bounds={overlayBounds} autofocus={true}>
    {#snippet children()}
      <div
        bind:this={backdropEl}
        class="overlay-backdrop"
        class:interacting={interactionMode !== 'none'}
        on:click={handleBackdropClick}
      >
        <div
          class="chat-wrapper"
          class:interacting={interactionMode !== 'none'}
          class:positioned={posX !== null}
          style={getWrapperStyle()}
          on:click|stopPropagation
        >
          <!-- Drag handle indicator (visible grip) -->
          <div class="drag-indicator" on:mousedown={startDrag} title="Drag to move">
            <span class="grip-dots"></span>
          </div>

          <!-- Resize handles -->
          <!-- Corners -->
          <div class="resize-handle corner nw" on:mousedown={(e) => startResize(e, 'nw')}></div>
          <div class="resize-handle corner ne" on:mousedown={(e) => startResize(e, 'ne')}></div>
          <div class="resize-handle corner sw" on:mousedown={(e) => startResize(e, 'sw')}></div>
          <div class="resize-handle corner se" on:mousedown={(e) => startResize(e, 'se')}></div>
          <!-- Edges -->
          <div class="resize-handle edge n" on:mousedown={(e) => startResize(e, 'n')}></div>
          <div class="resize-handle edge s" on:mousedown={(e) => startResize(e, 's')}></div>
          <div class="resize-handle edge e" on:mousedown={(e) => startResize(e, 'e')}></div>
          <div class="resize-handle edge w" on:mousedown={(e) => startResize(e, 'w')}></div>

          <ContextualChat {selectedText} {pageContext} {pageTitle} {pageUrl} {visible} />
        </div>
      </div>
    {/snippet}
  </Overlay>
{/if}

<style>
  .overlay-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .chat-wrapper {
    position: relative;
    max-width: 90vw;
    max-height: 85vh;
    animation: slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* When positioned absolutely (after first drag), use absolute positioning */
  .chat-wrapper.positioned {
    position: absolute;
    animation: none;
  }

  .chat-wrapper.interacting {
    animation: none;
    transition: none;
    user-select: none;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(30px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* Drag indicator - visible at top center */
  .drag-indicator {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    width: 48px;
    height: 20px;
    cursor: grab;
    z-index: 15;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.15s ease;
  }

  .drag-indicator:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .drag-indicator:active {
    cursor: grabbing;
    background: rgba(255, 255, 255, 0.15);
  }

  .grip-dots {
    width: 32px;
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }

  .drag-indicator:hover .grip-dots {
    background: rgba(255, 255, 255, 0.5);
  }

  /* Resize handles */
  .resize-handle {
    position: absolute;
    z-index: 10;
    background: transparent;
  }

  /* Corner handles - made larger for easier grabbing */
  .resize-handle.corner {
    width: 20px;
    height: 20px;
  }

  .resize-handle.corner.nw {
    top: -6px;
    left: -6px;
    cursor: nwse-resize;
  }

  .resize-handle.corner.ne {
    top: -6px;
    right: -6px;
    cursor: nesw-resize;
  }

  .resize-handle.corner.sw {
    bottom: -6px;
    left: -6px;
    cursor: nesw-resize;
  }

  .resize-handle.corner.se {
    bottom: -6px;
    right: -6px;
    cursor: nwse-resize;
  }

  /* Edge handles - thicker for easier grabbing */
  .resize-handle.edge.n {
    top: -6px;
    left: 20px;
    right: 20px;
    height: 12px;
    cursor: ns-resize;
  }

  .resize-handle.edge.s {
    bottom: -6px;
    left: 20px;
    right: 20px;
    height: 12px;
    cursor: ns-resize;
  }

  .resize-handle.edge.e {
    top: 20px;
    bottom: 20px;
    right: -6px;
    width: 12px;
    cursor: ew-resize;
  }

  .resize-handle.edge.w {
    top: 20px;
    bottom: 20px;
    left: -6px;
    width: 12px;
    cursor: ew-resize;
  }

  /* Visual indicator on hover - subtle grip lines for corners */
  .resize-handle.corner::after {
    content: '';
    position: absolute;
    width: 8px;
    height: 8px;
    border-style: solid;
    border-color: rgba(255, 255, 255, 0.4);
    border-width: 0;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .resize-handle.corner:hover::after {
    opacity: 1;
  }

  .resize-handle.corner.se::after {
    right: 4px;
    bottom: 4px;
    border-right-width: 2px;
    border-bottom-width: 2px;
  }

  .resize-handle.corner.sw::after {
    left: 4px;
    bottom: 4px;
    border-left-width: 2px;
    border-bottom-width: 2px;
  }

  .resize-handle.corner.ne::after {
    right: 4px;
    top: 4px;
    border-right-width: 2px;
    border-top-width: 2px;
  }

  .resize-handle.corner.nw::after {
    left: 4px;
    top: 4px;
    border-left-width: 2px;
    border-top-width: 2px;
  }

  .resize-handle.edge:hover {
    background: rgba(255, 255, 255, 0.1);
  }
</style>
