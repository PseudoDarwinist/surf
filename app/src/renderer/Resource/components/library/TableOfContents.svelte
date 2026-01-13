<script lang="ts">
  import { Icon } from '@deta/icons'
  import type { Chapter } from '@deta/types'

  interface Props {
    chapters: Chapter[]
    currentChapter?: number
    onselect: (chapter: Chapter, index: number) => void
  }

  let { chapters, currentChapter, onselect }: Props = $props()
</script>

<nav class="table-of-contents">
  {#if chapters.length === 0}
    <div class="empty-toc">
      <Icon name="list.bullet" size="1.5rem" />
      <p>No chapters found</p>
    </div>
  {:else}
    <ul>
      {#each chapters as chapter, index}
        <li
          class="toc-item"
          class:current={index === currentChapter}
          class:completed={currentChapter !== undefined && index < currentChapter}
          style="--indent: {(chapter.level - 1) * 0.75}rem"
        >
          <button onclick={() => onselect(chapter, index)} class:active={index === currentChapter}>
            <span class="toc-indicator">
              {#if currentChapter !== undefined && index < currentChapter}
                <Icon name="checkmark.circle" size="1rem" />
              {:else if index === currentChapter}
                <Icon name="book.fill" size="1rem" />
              {:else}
                <Icon name="book" size="1rem" />
              {/if}
            </span>
            <span class="toc-title">{chapter.title}</span>
            {#if index === currentChapter}
              <span class="current-badge">Reading</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</nav>

<style lang="scss">
  .table-of-contents {
    ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .empty-toc {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      color: var(--text-secondary, rgba(0, 0, 0, 0.5));
      gap: 0.5rem;

      p {
        margin: 0;
        font-size: 0.9rem;
      }
    }

    .toc-item {
      padding-left: var(--indent);

      button {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.6rem 0.75rem;
        background: none;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        text-align: left;
        color: var(--text-primary);
        font-size: 0.9rem;

        &:hover {
          background: rgba(0, 0, 0, 0.05);
        }

        &.active {
          background: var(--accent-subtle, rgba(59, 130, 246, 0.1));
          border-left: 3px solid var(--accent-color, #3b82f6);
          margin-left: -3px;
        }
      }

      &.completed button {
        opacity: 0.7;

        .toc-indicator {
          color: var(--success-color, #22c55e);
        }
      }

      .toc-indicator {
        flex-shrink: 0;
        color: var(--text-secondary);
      }

      .toc-title {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .current-badge {
        flex-shrink: 0;
        margin-left: auto;
        font-size: 0.7rem;
        padding: 0.15rem 0.4rem;
        background: var(--accent-color, #3b82f6);
        color: white;
        border-radius: 4px;
        font-weight: 500;
      }
    }
  }
</style>
