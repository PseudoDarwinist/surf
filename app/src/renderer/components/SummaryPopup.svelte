<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'
  import { fly, fade } from 'svelte/transition'

  const dispatch = createEventDispatcher<{
    close: void
    expand: void
  }>()

  export let title = 'Selected Content'
  export let summary = ''
  export let isLoading = false
  export let position: { x: number; y: number } = { x: 0, y: 0 }
  export let isExpanded = false
  export let deeperExplanation = ''
  export let isLoadingDeeper = false

  let popupElement: HTMLDivElement
  let isDragging = false
  let dragStartY = 0
  let currentHeight = 120
  let expandThreshold = 180

  // Calculate popup position (near the circled content, but within viewport)
  $: popupStyle = calculatePopupStyle(position, isExpanded)

  function calculatePopupStyle(pos: { x: number; y: number }, expanded: boolean) {
    const width = expanded ? 400 : 320
    const height = expanded ? 'auto' : `${currentHeight}px`

    // Position near the circle, but ensure it's visible
    let left = pos.x - width / 2
    let top = pos.y + 20 // Below the circle

    // Keep within viewport
    const padding = 20
    left = Math.max(padding, Math.min(left, window.innerWidth - width - padding))
    top = Math.max(padding, Math.min(top, window.innerHeight - 300))

    return `left: ${left}px; top: ${top}px; width: ${width}px; min-height: ${height};`
  }

  function handleDragStart(e: MouseEvent | TouchEvent) {
    isDragging = true
    dragStartY = 'touches' in e ? e.touches[0].clientY : e.clientY

    window.addEventListener('mousemove', handleDragMove)
    window.addEventListener('mouseup', handleDragEnd)
    window.addEventListener('touchmove', handleDragMove)
    window.addEventListener('touchend', handleDragEnd)
  }

  function handleDragMove(e: MouseEvent | TouchEvent) {
    if (!isDragging) return

    const currentY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const delta = currentY - dragStartY

    // Increase height when dragging down
    if (delta > 0) {
      currentHeight = Math.min(400, 120 + delta)

      // If dragged past threshold, trigger expansion
      if (currentHeight > expandThreshold && !isExpanded) {
        isExpanded = true
        dispatch('expand')
      }
    }
  }

  function handleDragEnd() {
    isDragging = false

    // Snap to expanded or collapsed
    if (currentHeight > expandThreshold) {
      currentHeight = 300
      if (!isExpanded) {
        isExpanded = true
        dispatch('expand')
      }
    } else {
      currentHeight = 120
    }

    window.removeEventListener('mousemove', handleDragMove)
    window.removeEventListener('mouseup', handleDragEnd)
    window.removeEventListener('touchmove', handleDragMove)
    window.removeEventListener('touchend', handleDragEnd)
  }

  function handleClose() {
    dispatch('close')
  }

  function handleClickOutside(e: MouseEvent) {
    if (popupElement && !popupElement.contains(e.target as Node)) {
      handleClose()
    }
  }

  onMount(() => {
    // Delay adding click listener to avoid immediate close
    setTimeout(() => {
      window.addEventListener('click', handleClickOutside)
    }, 100)

    return () => {
      window.removeEventListener('click', handleClickOutside)
    }
  })
</script>

<div
  bind:this={popupElement}
  class="summary-popup"
  class:expanded={isExpanded}
  class:dragging={isDragging}
  style={popupStyle}
  transition:fly={{ y: 20, duration: 300 }}
>
  <!-- Header with title -->
  <div class="popup-header">
    <h3 class="popup-title">{title}</h3>
    <button class="close-button" on:click={handleClose}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  </div>

  <!-- Summary content -->
  <div class="popup-content">
    {#if isLoading}
      <div class="loading">
        <div class="loading-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    {:else}
      <p class="summary-text">{summary}</p>
    {/if}

    <!-- Expanded section with deeper explanation -->
    {#if isExpanded}
      <div class="expanded-section" transition:fade={{ duration: 200 }}>
        <div class="divider"></div>
        <h4 class="deeper-title">Deeper Explanation</h4>
        {#if isLoadingDeeper}
          <div class="loading">
            <div class="loading-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        {:else if deeperExplanation}
          <p class="deeper-text">{deeperExplanation}</p>
        {:else}
          <p class="deeper-text placeholder">Loading more details...</p>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Drag handle -->
  <div class="drag-handle" on:mousedown={handleDragStart} on:touchstart={handleDragStart}>
    <div class="drag-indicator"></div>
    {#if !isExpanded}
      <span class="drag-hint">Drag for more</span>
    {/if}
  </div>
</div>

<style>
  .summary-popup {
    position: fixed;
    z-index: 10000;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(20px);
    border-radius: 16px;
    box-shadow:
      0 8px 40px rgba(0, 0, 0, 0.15),
      0 2px 8px rgba(0, 0, 0, 0.1),
      inset 0 0 0 1px rgba(0, 0, 0, 0.05);
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .summary-popup.dragging {
    transition: none;
  }

  .summary-popup.expanded {
    min-height: 280px;
  }

  .popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }

  .popup-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #1a1a1a;
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    border-radius: 8px;
    cursor: pointer;
    color: #999;
    transition: all 0.2s;
  }

  .close-button:hover {
    background: rgba(0, 0, 0, 0.05);
    color: #333;
  }

  .popup-content {
    padding: 12px 16px;
    max-height: 300px;
    overflow-y: auto;
  }

  .summary-text {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: #333;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 0;
  }

  .loading-dots {
    display: flex;
    gap: 4px;
  }

  .loading-dots span {
    width: 6px;
    height: 6px;
    background: #6366f1;
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out both;
  }

  .loading-dots span:nth-child(1) {
    animation-delay: -0.32s;
  }
  .loading-dots span:nth-child(2) {
    animation-delay: -0.16s;
  }

  @keyframes bounce {
    0%,
    80%,
    100% {
      transform: scale(0);
    }
    40% {
      transform: scale(1);
    }
  }

  .expanded-section {
    margin-top: 8px;
  }

  .divider {
    height: 1px;
    background: rgba(0, 0, 0, 0.06);
    margin: 12px 0;
  }

  .deeper-title {
    margin: 0 0 8px 0;
    font-size: 13px;
    font-weight: 600;
    color: #6366f1;
  }

  .deeper-text {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: #333;
  }

  .deeper-text.placeholder {
    color: #999;
    font-style: italic;
  }

  .drag-handle {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 16px 12px;
    cursor: ns-resize;
    user-select: none;
  }

  .drag-indicator {
    width: 36px;
    height: 4px;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 2px;
  }

  .drag-hint {
    margin-top: 4px;
    font-size: 11px;
    color: #999;
  }

  /* Dark mode */
  :global([data-color-scheme='dark']) .summary-popup {
    background: rgba(30, 30, 30, 0.98);
    box-shadow:
      0 8px 40px rgba(0, 0, 0, 0.4),
      0 2px 8px rgba(0, 0, 0, 0.3),
      inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  }

  :global([data-color-scheme='dark']) .popup-header {
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }

  :global([data-color-scheme='dark']) .popup-title {
    color: #fff;
  }

  :global([data-color-scheme='dark']) .close-button {
    color: #666;
  }

  :global([data-color-scheme='dark']) .close-button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  :global([data-color-scheme='dark']) .summary-text,
  :global([data-color-scheme='dark']) .deeper-text {
    color: #e5e5e5;
  }

  :global([data-color-scheme='dark']) .divider {
    background: rgba(255, 255, 255, 0.08);
  }

  :global([data-color-scheme='dark']) .drag-indicator {
    background: rgba(255, 255, 255, 0.2);
  }
</style>
