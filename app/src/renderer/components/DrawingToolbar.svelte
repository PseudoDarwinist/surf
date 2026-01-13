<script lang="ts">
  // Using Svelte 5 runes mode
  import { onMount, onDestroy } from 'svelte'
  import { penToolActiveStore, setPenToolActive } from '../stores/circleToSummarize'

  // Debug logging prefix
  const LOG_PREFIX = '[DrawingToolbar]'

  interface Props {
    ontoolchange?: (detail: { tool: 'pen' | 'none' }) => void
    onclose?: () => void
  }

  let { ontoolchange, onclose }: Props = $props()

  // Store subscription
  let storeUnsubscribe: (() => void) | null = null

  onMount(() => {
    console.log(LOG_PREFIX, '=== TOOLBAR MOUNTED ===')
    console.log(LOG_PREFIX, 'ontoolchange defined:', !!ontoolchange)
    console.log(LOG_PREFIX, 'onclose defined:', !!onclose)

    // Subscribe to the shared store for pen tool state
    storeUnsubscribe = penToolActiveStore.subscribe((active) => {
      console.log(LOG_PREFIX, 'Store update received:', active)
      const newTool = active ? 'pen' : 'none'
      if (activeTool !== newTool) {
        console.log(LOG_PREFIX, 'Updating local activeTool from store')
        activeTool = newTool
        // Notify parent of the change (so it can update its state too)
        ontoolchange?.({ tool: newTool })
      }
    })
  })

  onDestroy(() => {
    console.log(LOG_PREFIX, '=== TOOLBAR DESTROYED ===')
    if (storeUnsubscribe) {
      storeUnsubscribe()
    }
  })

  // Tool state using $state
  let activeTool = $state<'pen' | 'none'>('none')
  let isExpanded = $state(true)

  function selectTool(tool: 'pen' | 'none') {
    console.log(LOG_PREFIX, 'selectTool called:', tool)
    console.log(LOG_PREFIX, 'Previous activeTool:', activeTool)
    activeTool = tool
    console.log(LOG_PREFIX, 'New activeTool:', activeTool)
    console.log(LOG_PREFIX, 'Calling ontoolchange callback...')
    ontoolchange?.({ tool })
    // Also sync with the shared store
    setPenToolActive(tool === 'pen')
    console.log(LOG_PREFIX, 'ontoolchange callback executed and store synced')
  }

  function toggleExpand() {
    isExpanded = !isExpanded
  }

  function close() {
    activeTool = 'none'
    setPenToolActive(false) // Sync with store
    onclose?.()
  }

  // Keyboard shortcut to toggle pen tool (works when overlay has focus)
  function handleKeyDown(e: KeyboardEvent) {
    console.log(LOG_PREFIX, 'Key pressed:', e.key, 'metaKey:', e.metaKey, 'ctrlKey:', e.ctrlKey)
    if (e.key === 'd' && (e.metaKey || e.ctrlKey)) {
      console.log(LOG_PREFIX, 'Cmd+D detected! Toggling pen tool')
      e.preventDefault()
      selectTool(activeTool === 'pen' ? 'none' : 'pen')
    }
  }

  // Track state changes
  $effect(() => {
    console.log(LOG_PREFIX, 'activeTool state changed to:', activeTool)
  })
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="toolbar-container" class:collapsed={!isExpanded}>
  {#if isExpanded}
    <div class="toolbar">
      <button
        class="tool-button"
        class:active={activeTool === 'pen'}
        onclick={() => selectTool(activeTool === 'pen' ? 'none' : 'pen')}
        title="Pen Tool (Cmd+D)"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M12 19l7-7 3 3-7 7-3-3z" />
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          <path d="M2 2l7.586 7.586" />
          <circle cx="11" cy="11" r="2" />
        </svg>
      </button>

      <div class="divider"></div>

      <button class="tool-button close-btn" onclick={close} title="Close">
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
  {:else}
    <button class="expand-button" onclick={toggleExpand} title="Expand Toolbar">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      </svg>
    </button>
  {/if}
</div>

<style>
  .toolbar-container {
    /* No longer using fixed positioning - rendered inside overlay */
    pointer-events: auto;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(12px);
    border-radius: 16px;
    box-shadow:
      0 4px 24px rgba(0, 0, 0, 0.12),
      0 1px 4px rgba(0, 0, 0, 0.08),
      inset 0 0 0 1px rgba(0, 0, 0, 0.06);
    /* animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); */
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .tool-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: none;
    background: transparent;
    border-radius: 12px;
    cursor: pointer;
    color: #666;
    transition: all 0.2s ease;
  }

  .tool-button:hover {
    background: rgba(0, 0, 0, 0.05);
    color: #333;
  }

  .tool-button.active {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
  }

  .tool-button.close-btn {
    width: 32px;
    height: 32px;
  }

  .tool-button.close-btn:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .divider {
    width: 1px;
    height: 24px;
    background: rgba(0, 0, 0, 0.1);
    margin: 0 4px;
  }

  .expand-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border: none;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(12px);
    border-radius: 50%;
    cursor: pointer;
    color: #666;
    box-shadow:
      0 4px 24px rgba(0, 0, 0, 0.12),
      0 1px 4px rgba(0, 0, 0, 0.08);
    transition: all 0.2s ease;
  }

  .expand-button:hover {
    transform: scale(1.05);
    color: #6366f1;
  }

  .pen-active-indicator {
    /* Note: This indicator is rendered inside the full-screen overlay now */
    position: absolute;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 16px;
    background: rgba(99, 102, 241, 0.95);
    color: white;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
    z-index: 1;
    animation: fadeIn 0.2s ease;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  /* Dark mode support */
  :global([data-color-scheme='dark']) .toolbar {
    background: rgba(30, 30, 30, 0.95);
    box-shadow:
      0 4px 24px rgba(0, 0, 0, 0.3),
      0 1px 4px rgba(0, 0, 0, 0.2),
      inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  }

  :global([data-color-scheme='dark']) .tool-button {
    color: #aaa;
  }

  :global([data-color-scheme='dark']) .tool-button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  :global([data-color-scheme='dark']) .divider {
    background: rgba(255, 255, 255, 0.1);
  }

  :global([data-color-scheme='dark']) .expand-button {
    background: rgba(30, 30, 30, 0.95);
    color: #aaa;
  }
</style>
