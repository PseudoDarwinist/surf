<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { Icon } from '@deta/icons'

  export let preferencesOpen: boolean = false
  export let tocOpen: boolean = false
  export let notebookLMOpen: boolean = false
  export let readingMode: 'normal' | 'sepia' | 'night' = 'normal'

  const dispatch = createEventDispatcher<{
    togglePreferences: void
    toggleToc: void
    toggleNotebookLM: void
    exit: void
    help: void
    quiz: void
    backToOverview: void
  }>()
</script>

<!-- Floating Pill Toolbar - syncs with reading mode theme -->
<div class="focus-toolbar-container" class:sepia={readingMode === 'sepia'} class:night={readingMode === 'night'}>
  <div class="focus-toolbar-pill">
    <button class="pill-btn" title="Back to Overview" on:click={() => dispatch('backToOverview')}>
      <Icon name="arrow.left" size={15} />
    </button>

    <div class="pill-divider"></div>

    <button class="pill-btn" title="Exit Focus Mode" on:click={() => dispatch('exit')}>
      <Icon name="leave" size={15} />
    </button>

    <button class="pill-btn" class:active={tocOpen} title="Table of Contents" on:click={() => dispatch('toggleToc')}>
      <Icon name="list-details" size={15} />
    </button>

    <button class="pill-btn" title="Quiz (Coming Soon)" on:click={() => dispatch('quiz')}>
      <Icon name="check" size={15} />
    </button>

    <button class="pill-btn" class:active={notebookLMOpen} title="NotebookLM" on:click={() => dispatch('toggleNotebookLM')}>
      📓
    </button>

    <button class="pill-btn" class:active={preferencesOpen} title="Reading Preferences" on:click={() => dispatch('togglePreferences')}>
      <Icon name="settings" size={15} />
    </button>

    <button class="pill-btn" title="Keyboard shortcuts: ← → to navigate" on:click={() => dispatch('help')}>
      <Icon name="help.circle" size={15} />
    </button>
  </div>
</div>

<style>
  /* Container - transparent, truly floating */
  .focus-toolbar-container {
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    display: flex;
    justify-content: center;
    padding: 0;
    background: transparent;
    pointer-events: none; /* Allow clicking through container */
  }

  /* No background variants needed - container is always transparent */
  .focus-toolbar-container.sepia,
  .focus-toolbar-container.night {
    background: transparent;
  }

  /* Pill - compact styling per reading mode */
  .focus-toolbar-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(0, 0, 0, 0.08);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
    pointer-events: auto; /* Re-enable clicking on the pill */
    backdrop-filter: blur(8px);
  }

  .sepia .focus-toolbar-pill {
    background: rgba(247, 243, 233, 0.95);  /* ChapterPal sepia #f7f3e9 */
    border-color: rgba(212, 197, 169, 0.3);  /* ChapterPal sepia border */
  }

  .night .focus-toolbar-pill {
    background: rgba(40, 40, 40, 0.95);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .pill-divider {
    width: 1px;
    height: 1rem;
    background: rgba(0, 0, 0, 0.1);
    margin: 0 0.25rem;
  }

  .sepia .pill-divider {
    background: rgba(139, 115, 85, 0.2);
  }

  .night .pill-divider {
    background: rgba(255, 255, 255, 0.15);
  }

  .pill-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.65rem;
    height: 1.65rem;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .sepia .pill-btn {
    color: #8b7355;
  }

  .night .pill-btn {
    color: #94a3b8;
  }

  .pill-btn:hover {
    background: rgba(0, 0, 0, 0.06);
    color: #1e293b;
  }

  .sepia .pill-btn:hover {
    background: rgba(139, 115, 85, 0.1);
    color: #5b4636;
  }

  .night .pill-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #e2e8f0;
  }

  .pill-btn.active {
    background: rgba(0, 0, 0, 0.1);
    color: #1e293b;
  }

  .sepia .pill-btn.active {
    background: rgba(139, 115, 85, 0.15);
    color: #5b4636;
  }

  .night .pill-btn.active {
    background: rgba(255, 255, 255, 0.15);
    color: #e2e8f0;
  }
</style>
