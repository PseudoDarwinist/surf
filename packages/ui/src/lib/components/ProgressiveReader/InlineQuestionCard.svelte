<script lang="ts">
  import { fly } from 'svelte/transition'

  export let selectedText: string = ''
  export let questionType: 'tldr' | 'visual' | 'explain' | 'realworld' | 'bigpicture' = 'explain'

  // Map question types to display text
  const questionMap = {
    tldr: 'Give me the TL;DR',
    visual: 'How can I visualize this?',
    explain: 'Can you explain this in more detail?',
    realworld: 'What\'s a real-world example of this?',
    bigpicture: 'How does this fit into the big picture?'
  }

  // Truncate text if too long
  function truncateText(text: string, maxLength: number = 100): string {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength).trim() + '...'
  }

  $: displayText = truncateText(selectedText)
  $: questionText = questionMap[questionType]
</script>

<div class="question-card" transition:fly={{ y: 10, duration: 200 }}>
  <div class="question-content">
    <span class="regarding">Regarding:</span>
    <span class="quoted-text">"{displayText}"</span>
    <span class="question-text">{questionText}</span>
  </div>
</div>

<style>
  .question-card {
    margin: 1rem 0 0.5rem;
    margin-left: 2rem;
    padding: 1rem 1.25rem;
    background: #f5efe6;
    border-radius: 12px;
    border-left: 3px solid #c9a87c;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .question-content {
    font-size: 15px;
    line-height: 1.6;
    color: #5b4a3f;
  }

  .regarding {
    font-weight: 600;
    color: #8b7355;
    margin-right: 4px;
  }

  .quoted-text {
    font-style: italic;
    color: #6b5a4a;
  }

  .question-text {
    display: block;
    margin-top: 0.5rem;
    font-weight: 500;
    color: #5b4a3f;
  }

  /* Dark mode support */
  :global(.night) .question-card {
    background: #2d2a25;
    border-left-color: #a08060;
  }

  :global(.night) .question-content {
    color: #d4c4b0;
  }

  :global(.night) .regarding {
    color: #c9a87c;
  }

  :global(.night) .quoted-text {
    color: #b0a090;
  }

  :global(.night) .question-text {
    color: #d4c4b0;
  }

  /* Sepia mode support */
  :global(.sepia) .question-card {
    background: #f0e8d8;
    border-left-color: #b89860;
  }
</style>
