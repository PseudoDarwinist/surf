<script lang="ts">
  import { fly } from 'svelte/transition'

  export let content: string = ''
  export let isStreaming: boolean = false

  // Simple markdown-like rendering for basic formatting
  function formatContent(text: string): string {
    if (!text) return ''

    // Escape HTML
    let formatted = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    // Bold
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')

    // Italic
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>')

    // Code
    formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>')

    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>')

    return formatted
  }

  $: formattedContent = formatContent(content)
</script>

<div class="answer-card" transition:fly={{ y: 10, duration: 200, delay: 100 }}>
  <div class="answer-icon">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
  </div>
  <div class="answer-content">
    {#if isStreaming && !content}
      <div class="streaming-placeholder">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
    {:else}
      <div class="answer-text">
        {@html formattedContent}
        {#if isStreaming}
          <span class="cursor">|</span>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .answer-card {
    display: flex;
    gap: 12px;
    margin: 0.5rem 0 1.5rem;
    margin-left: 1rem;
    padding: 1rem 1.25rem;
    background: #faf5ed;
    border-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .answer-icon {
    flex-shrink: 0;
    display: flex;
    align-items: flex-start;
    padding-top: 2px;
    color: #8b7355;
  }

  .answer-content {
    flex: 1;
    min-width: 0;
  }

  .answer-text {
    font-size: 15px;
    line-height: 1.7;
    color: #4a3f35;
  }

  .answer-text :global(strong) {
    font-weight: 600;
    color: #3a3025;
  }

  .answer-text :global(em) {
    font-style: italic;
  }

  .answer-text :global(code) {
    padding: 2px 6px;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.9em;
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

  .streaming-placeholder {
    display: flex;
    gap: 4px;
    padding: 8px 0;
  }

  .dot {
    width: 8px;
    height: 8px;
    background: #c9a87c;
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out both;
  }

  .dot:nth-child(1) {
    animation-delay: -0.32s;
  }

  .dot:nth-child(2) {
    animation-delay: -0.16s;
  }

  @keyframes bounce {
    0%, 80%, 100% {
      transform: scale(0.8);
      opacity: 0.5;
    }
    40% {
      transform: scale(1);
      opacity: 1;
    }
  }

  /* Dark mode support */
  :global(.night) .answer-card {
    background: #252220;
  }

  :global(.night) .answer-icon {
    color: #c9a87c;
  }

  :global(.night) .answer-text {
    color: #d4c4b0;
  }

  :global(.night) .answer-text :global(strong) {
    color: #e8d8c0;
  }

  :global(.night) .answer-text :global(code) {
    background: rgba(255, 255, 255, 0.08);
  }

  :global(.night) .dot {
    background: #a08060;
  }

  /* Sepia mode support */
  :global(.sepia) .answer-card {
    background: #f8f0e0;
  }

  :global(.sepia) .answer-text {
    color: #5b4636;
  }
</style>
