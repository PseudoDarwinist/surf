<script lang="ts">
  import { Icon } from '@deta/icons'

  interface Props {
    stage: 'loading' | 'rendering' | 'restoring' | 'ready'
  }

  let { stage }: Props = $props()

  const stages = [
    { id: 'loading', label: 'Loading document' },
    { id: 'rendering', label: 'Rendering document' },
    { id: 'restoring', label: 'Restoring your reading session' }
  ]

  const currentStageIndex = $derived(stages.findIndex((s) => s.id === stage))
</script>

{#if stage !== 'ready'}
  <div class="loading-overlay">
    <div class="loading-content">
      <div class="loading-icon">
        <Icon name="arrow.clockwise" size="2rem" />
      </div>

      <div class="stages">
        {#each stages as s, i}
          <div class="stage" class:active={s.id === stage} class:completed={i < currentStageIndex}>
            <span class="stage-icon">
              {#if i < currentStageIndex}
                <Icon name="checkmark.circle.fill" size="1rem" />
              {:else if s.id === stage}
                <span class="spinner">
                  <Icon name="arrow.clockwise" size="1rem" />
                </span>
              {:else}
                <span class="stage-dot"></span>
              {/if}
            </span>
            <span class="stage-label">{s.label}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  .loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.95);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);

    :global(.dark) & {
      background: rgba(0, 0, 0, 0.9);
    }
  }

  .loading-content {
    text-align: center;
  }

  .loading-icon {
    margin-bottom: 2rem;
    color: var(--accent-color, #3b82f6);
    animation: spin 1s linear infinite;
  }

  .stages {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    text-align: left;
  }

  .stage {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.95rem;
    color: var(--text-secondary, rgba(0, 0, 0, 0.5));
    transition: all 0.3s ease;

    &.active {
      color: var(--accent-color, #3b82f6);
      font-weight: 500;
    }

    &.completed {
      color: var(--success-color, #22c55e);
    }

    .stage-icon {
      width: 1.25rem;
      height: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .stage-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      opacity: 0.3;
    }

    .spinner {
      animation: spin 1s linear infinite;
      display: flex;
    }
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
