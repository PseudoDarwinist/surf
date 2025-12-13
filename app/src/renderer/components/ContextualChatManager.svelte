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

  // Resize state
  let isResizing = $state(false)
  let resizeDirection = $state<string | null>(null)
  let startX = 0
  let startY = 0
  let startWidth = 0
  let startHeight = 0

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

  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && get(visible)) {
      visible.set(false)
      openedViaIPC = false
    }
  }

  const updateOverlayBounds = () => {
    if (typeof window !== 'undefined') {
      overlayBounds = {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight
      }
    }
  }

  // Resize handlers
  const startResize = (e: MouseEvent, direction: string) => {
    e.preventDefault()
    e.stopPropagation()
    isResizing = true
    resizeDirection = direction
    startX = e.clientX
    startY = e.clientY
    startWidth = chatWidth
    startHeight = chatHeight

    document.addEventListener('mousemove', handleResize)
    document.addEventListener('mouseup', stopResize)
    document.body.style.cursor = getCursorForDirection(direction)
    document.body.style.userSelect = 'none'
  }

  const handleResize = (e: MouseEvent) => {
    if (!isResizing || !resizeDirection) return

    const deltaX = e.clientX - startX
    const deltaY = e.clientY - startY

    let newWidth = startWidth
    let newHeight = startHeight

    // Handle horizontal resize
    if (resizeDirection.includes('e')) {
      newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + deltaX * 2))
    } else if (resizeDirection.includes('w')) {
      newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth - deltaX * 2))
    }

    // Handle vertical resize
    if (resizeDirection.includes('s')) {
      newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeight + deltaY * 2))
    } else if (resizeDirection.includes('n')) {
      newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeight - deltaY * 2))
    }

    chatWidth = newWidth
    chatHeight = newHeight
  }

  const stopResize = () => {
    isResizing = false
    resizeDirection = null
    document.removeEventListener('mousemove', handleResize)
    document.removeEventListener('mouseup', stopResize)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
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
    if (typeof document === 'undefined') return

    mounted = true
    updateOverlayBounds()

    // Update bounds on resize
    window.addEventListener('resize', updateOverlayBounds)
    document.addEventListener('keydown', handleEscape)

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
      }
    })

    return () => {
      unsubVisible()
    }
  })

  onDestroy(() => {
    mounted = false
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', updateOverlayBounds)
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', handleEscape)
    }
  })

  const handleBackdropClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    // Only close if clicking directly on backdrop, not the chat window
    if (target.classList.contains('overlay-backdrop')) {
      visible.set(false)
      openedViaIPC = false
    }
  }
</script>

<!-- Full-screen Overlay that contains both backdrop and chat -->
{#if showOverlay}
  <Overlay bounds={overlayBounds} autofocus={true}>
    {#snippet children()}
      <div class="overlay-backdrop" on:click={handleBackdropClick}>
        <div
          class="chat-wrapper"
          class:resizing={isResizing}
          style="width: {chatWidth}px; height: {chatHeight}px;"
        >
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

  .chat-wrapper.resizing {
    animation: none;
    transition: none;
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

  /* Resize handles */
  .resize-handle {
    position: absolute;
    z-index: 10;
  }

  /* Corner handles */
  .resize-handle.corner {
    width: 16px;
    height: 16px;
  }

  .resize-handle.corner.nw {
    top: -4px;
    left: -4px;
    cursor: nwse-resize;
  }

  .resize-handle.corner.ne {
    top: -4px;
    right: -4px;
    cursor: nesw-resize;
  }

  .resize-handle.corner.sw {
    bottom: -4px;
    left: -4px;
    cursor: nesw-resize;
  }

  .resize-handle.corner.se {
    bottom: -4px;
    right: -4px;
    cursor: nwse-resize;
  }

  /* Edge handles */
  .resize-handle.edge {
    background: transparent;
  }

  .resize-handle.edge.n {
    top: -4px;
    left: 16px;
    right: 16px;
    height: 8px;
    cursor: ns-resize;
  }

  .resize-handle.edge.s {
    bottom: -4px;
    left: 16px;
    right: 16px;
    height: 8px;
    cursor: ns-resize;
  }

  .resize-handle.edge.e {
    top: 16px;
    bottom: 16px;
    right: -4px;
    width: 8px;
    cursor: ew-resize;
  }

  .resize-handle.edge.w {
    top: 16px;
    bottom: 16px;
    left: -4px;
    width: 8px;
    cursor: ew-resize;
  }

  /* Visual indicator on hover */
  .resize-handle:hover {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }

  .resize-handle.corner:hover {
    background: rgba(255, 255, 255, 0.15);
  }
</style>
