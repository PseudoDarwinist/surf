<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { Icon } from '@deta/icons'

  export let enabled: boolean = false
  export let revealedCount: number = 0
  export let totalCount: number = 0
  export let compact: boolean = false

  const dispatch = createEventDispatcher<{
    toggle: boolean
    revealAll: void
    reset: void
  }>()

  function handleToggle() {
    dispatch('toggle', !enabled)
  }

  function handleRevealAll() {
    dispatch('revealAll')
  }

  function handleReset() {
    dispatch('reset')
  }

  $: progressPercent = totalCount > 0 ? Math.round((revealedCount / totalCount) * 100) : 0
</script>

<div class="focus-toolbar" class:compact class:active={enabled}>
  <button
    class="focus-toggle"
    class:enabled
    on:click={handleToggle}
    title={enabled ? 'Exit Focus Mode' : 'Focus Mode (read paragraph by paragraph)'}
  >
    {#if enabled}
      <Icon name="x" size={14} />
      <span class="toggle-label">Exit Focus</span>
    {:else}
      <Icon name="book-open" size={14} />
      <span class="toggle-label">Focus</span>
    {/if}
  </button>

  {#if enabled && totalCount > 0}
    <div class="focus-stats">
      <span class="stats-progress">{progressPercent}%</span>
      <span class="stats-count">{revealedCount}/{totalCount}</span>
    </div>

    <div class="focus-actions">
      <button
        class="action-btn"
        on:click={handleReset}
        title="Start from beginning"
        disabled={revealedCount <= 1}
      >
        <Icon name="rotate-ccw" size={12} />
      </button>
      <button
        class="action-btn"
        on:click={handleRevealAll}
        title="Reveal all"
        disabled={revealedCount >= totalCount}
      >
        <Icon name="chevrons-down" size={12} />
      </button>
    </div>
  {/if}
</div>

<style>
  .focus-toolbar {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.25rem;
    border-radius: 8px;
    transition: all 0.2s ease;
  }

  .focus-toolbar.active {
    background: rgba(59, 130, 246, 0.08);
    padding: 0.25rem 0.5rem;
  }

  .focus-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary, #64748b);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .focus-toggle:hover {
    background: rgba(0, 0, 0, 0.04);
    color: var(--text-primary, #1e293b);
  }

  .focus-toggle.enabled {
    background: var(--accent-color, #3b82f6);
    color: white;
  }

  .focus-toggle.enabled:hover {
    background: var(--accent-color-hover, #2563eb);
  }

  .toggle-label {
    font-size: 0.8125rem;
  }

  .compact .toggle-label {
    display: none;
  }

  .focus-stats {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-muted, #94a3b8);
    font-variant-numeric: tabular-nums;
  }

  .stats-progress {
    font-weight: 600;
    color: var(--accent-color, #3b82f6);
  }

  .stats-count {
    opacity: 0.7;
  }

  .focus-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary, #64748b);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-btn:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.04);
    color: var(--text-primary, #1e293b);
  }

  .action-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* Dark mode */
  :global([data-color-scheme='dark']) .focus-toggle:hover:not(.enabled) {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary-dark, #e2e8f0);
  }

  :global([data-color-scheme='dark']) .action-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary-dark, #e2e8f0);
  }

  :global([data-color-scheme='dark']) .focus-toolbar.active {
    background: rgba(59, 130, 246, 0.15);
  }
</style>
