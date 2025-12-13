<script lang="ts">
  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher<{
    toolChange: { tool: 'pen' | 'none' }
    close: void
  }>()

  // Tool state
  let activeTool: 'pen' | 'none' = 'none'
  let isExpanded = true

  function selectTool(tool: 'pen' | 'none') {
    activeTool = tool
    dispatch('toolChange', { tool })
  }

  function toggleExpand() {
    isExpanded = !isExpanded
  }

  function close() {
    activeTool = 'none'
    dispatch('close')
  }

  // Keyboard shortcut to toggle pen tool
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'd' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      selectTool(activeTool === 'pen' ? 'none' : 'pen')
    }
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

<div class="toolbar-container" class:collapsed={!isExpanded}>
  {#if isExpanded}
    <div class="toolbar">
      <button
        class="tool-button"
        class:active={activeTool === 'pen'}
        on:click={() => selectTool(activeTool === 'pen' ? 'none' : 'pen')}
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

      <button class="tool-button close-btn" on:click={close} title="Close">
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
    <button class="expand-button" on:click={toggleExpand} title="Expand Toolbar">
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

{#if activeTool === 'pen'}
  <div class="pen-active-indicator">
    <span>✏️ Circle content to summarize</span>
  </div>
{/if}

<style>
  .toolbar-container {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
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
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
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
    position: fixed;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 16px;
    background: rgba(99, 102, 241, 0.95);
    color: white;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
    z-index: 9999;
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
