<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'
  import { fly, fade } from 'svelte/transition'
  import { marked } from 'marked'

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
  export let centered = false

  // Configure marked for safe rendering
  marked.setOptions({
    breaks: true,
    gfm: true
  })

  // Render markdown to HTML
  $: renderedSummary = summary ? marked.parse(summary) : ''
  $: renderedExplanation = deeperExplanation ? marked.parse(deeperExplanation) : ''

  let popupElement: HTMLDivElement
  let contentElement: HTMLDivElement

  function handleClose() {
    dispatch('close')
  }

  function handleExpand() {
    if (!isExpanded && !isLoadingDeeper) {
      isExpanded = true
      dispatch('expand')
    }
  }

  // Auto-scroll to bottom when content updates (streaming effect)
  $: if (contentElement && summary) {
    setTimeout(() => {
      contentElement.scrollTop = contentElement.scrollHeight
    }, 50)
  }
</script>

<div
  bind:this={popupElement}
  class="summary-popup"
  class:expanded={isExpanded}
  class:centered
  transition:fly={{ y: -20, duration: 400, opacity: 0 }}
>
  <!-- Header with gradient accent -->
  <div class="popup-header">
    <div class="header-content">
      <div class="header-glow"></div>
      <h3 class="popup-title">{title}</h3>
    </div>
    <button class="close-button" on:click={handleClose} aria-label="Close">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  </div>

  <!-- Content area with streaming -->
  <div class="popup-content" bind:this={contentElement}>
    {#if isLoading && !summary}
      <div class="loading">
        <div class="loading-orb">
          <div class="orb-inner"></div>
        </div>
        <span class="loading-text">Analyzing content...</span>
      </div>
    {:else}
      <div class="markdown-content">
        {#if summary}
          {@html renderedSummary}
          {#if isLoading}
            <span class="typing-cursor"></span>
          {/if}
        {:else}
          <span class="placeholder">Waiting for response...</span>
        {/if}
      </div>
    {/if}

    <!-- Expanded deeper explanation -->
    {#if isExpanded}
      <div class="expanded-section" transition:fade={{ duration: 200 }}>
        <div class="divider"></div>
        <h4 class="deeper-title">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          Deeper Insight
        </h4>
        {#if isLoadingDeeper}
          <div class="loading small">
            <div class="loading-orb small">
              <div class="orb-inner"></div>
            </div>
          </div>
        {:else if deeperExplanation}
          <div class="markdown-content deeper">
            {@html renderedExplanation}
          </div>
        {:else}
          <p class="deeper-text placeholder">Loading detailed analysis...</p>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Footer with subtle actions -->
  {#if !isExpanded && !isLoading && summary}
    <div class="popup-footer">
      <button class="action-button" on:click={handleExpand}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>Dive deeper</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .summary-popup {
    background: linear-gradient(
      135deg,
      rgba(20, 20, 30, 0.85) 0%,
      rgba(30, 30, 45, 0.9) 50%,
      rgba(25, 25, 40, 0.85) 100%
    );
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow:
      0 25px 50px -12px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(255, 255, 255, 0.05) inset,
      0 -20px 40px -20px rgba(99, 102, 241, 0.15) inset;
    overflow: hidden;
    width: 100%;
    max-height: 45vh; /* Shorter height - elongated like Cluely */
    display: flex;
    flex-direction: column;
  }

  .summary-popup.expanded {
    max-height: 60vh; /* Still short when expanded */
  }

  /* Header */
  .popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    position: relative;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 12px;
    position: relative;
  }

  .header-glow {
    position: absolute;
    left: -8px;
    width: 4px;
    height: 24px;
    background: linear-gradient(180deg, #6366f1 0%, #a855f7 100%);
    border-radius: 2px;
    box-shadow: 0 0 20px rgba(99, 102, 241, 0.6);
  }

  .popup-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    letter-spacing: -0.02em;
    max-width: 90%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.5);
    transition: all 0.2s ease;
  }

  .close-button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
    transform: scale(1.05);
  }

  /* Content */
  .popup-content {
    padding: 24px;
    overflow-y: auto;
    flex: 1;
    min-height: 120px;
  }

  .popup-content::-webkit-scrollbar {
    width: 6px;
  }

  .popup-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .popup-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 3px;
  }

  .popup-content::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  /* Markdown content styling */
  .markdown-content {
    font-size: 14px;
    line-height: 1.75;
    color: rgba(255, 255, 255, 0.85);
  }

  .markdown-content :global(p) {
    margin: 0 0 12px 0;
  }

  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-content :global(strong) {
    color: rgba(255, 255, 255, 0.95);
    font-weight: 600;
  }

  .markdown-content :global(em) {
    color: rgba(167, 139, 250, 0.9);
    font-style: italic;
  }

  .markdown-content :global(h1),
  .markdown-content :global(h2),
  .markdown-content :global(h3) {
    color: rgba(255, 255, 255, 0.95);
    font-weight: 600;
    margin: 16px 0 8px 0;
    letter-spacing: -0.02em;
  }

  .markdown-content :global(h1) {
    font-size: 18px;
  }
  .markdown-content :global(h2) {
    font-size: 16px;
  }
  .markdown-content :global(h3) {
    font-size: 15px;
  }

  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    margin: 8px 0;
    padding-left: 20px;
  }

  .markdown-content :global(li) {
    margin: 4px 0;
  }

  .markdown-content :global(code) {
    background: rgba(99, 102, 241, 0.2);
    color: #a5b4fc;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
    font-family: 'SF Mono', Monaco, monospace;
  }

  .markdown-content :global(pre) {
    background: rgba(0, 0, 0, 0.3);
    padding: 12px 16px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 12px 0;
  }

  .markdown-content :global(pre code) {
    background: transparent;
    padding: 0;
  }

  .markdown-content :global(blockquote) {
    border-left: 3px solid rgba(99, 102, 241, 0.5);
    margin: 12px 0;
    padding-left: 16px;
    color: rgba(255, 255, 255, 0.7);
    font-style: italic;
  }

  .markdown-content.deeper {
    color: rgba(255, 255, 255, 0.8);
  }

  .placeholder {
    color: rgba(255, 255, 255, 0.4);
    font-style: italic;
  }

  /* Typing cursor animation */
  .typing-cursor {
    display: inline-block;
    width: 2px;
    height: 18px;
    background: linear-gradient(180deg, #6366f1 0%, #a855f7 100%);
    margin-left: 4px;
    animation: blink 0.8s ease-in-out infinite;
    vertical-align: text-bottom;
    border-radius: 1px;
    box-shadow: 0 0 10px rgba(99, 102, 241, 0.5);
  }

  @keyframes blink {
    0%,
    50% {
      opacity: 1;
    }
    51%,
    100% {
      opacity: 0;
    }
  }

  /* Loading state */
  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 0;
    gap: 16px;
  }

  .loading.small {
    padding: 16px 0;
    gap: 12px;
  }

  .loading-orb {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(168, 85, 247, 0.3) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: pulse 2s ease-in-out infinite;
  }

  .loading-orb.small {
    width: 32px;
    height: 32px;
  }

  .orb-inner {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
    animation: glow 1.5s ease-in-out infinite alternate;
  }

  .loading-orb.small .orb-inner {
    width: 16px;
    height: 16px;
  }

  @keyframes pulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.1);
      opacity: 0.8;
    }
  }

  @keyframes glow {
    0% {
      box-shadow: 0 0 20px rgba(99, 102, 241, 0.4);
    }
    100% {
      box-shadow: 0 0 40px rgba(168, 85, 247, 0.6);
    }
  }

  .loading-text {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.6);
    letter-spacing: 0.02em;
  }

  /* Expanded section */
  .expanded-section {
    margin-top: 8px;
  }

  .divider {
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(99, 102, 241, 0.3) 50%,
      transparent 100%
    );
    margin: 20px 0;
  }

  .deeper-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px 0;
    font-size: 13px;
    font-weight: 600;
    color: rgba(167, 139, 250, 0.9);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .deeper-text.placeholder {
    color: rgba(255, 255, 255, 0.4);
    font-style: italic;
    font-size: 14px;
  }

  /* Footer */
  .popup-footer {
    padding: 16px 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .action-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%);
    color: rgba(167, 139, 250, 0.95);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 10px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.25s ease;
  }

  .action-button:hover {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(168, 85, 247, 0.3) 100%);
    border-color: rgba(99, 102, 241, 0.5);
    transform: translateY(-1px);
    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.25);
  }
</style>
