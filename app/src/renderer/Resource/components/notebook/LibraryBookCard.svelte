<script lang="ts">
  import { Icon } from '@deta/icons'
  import type { LibraryDocumentMetadata } from '@deta/types'

  interface Props {
    id: string
    metadata: LibraryDocumentMetadata
    onclick: () => void
    ondelete?: () => void
    oncontextmenu?: (e: MouseEvent) => void
  }

  let { id, metadata, onclick, ondelete, oncontextmenu }: Props = $props()

  const title = $derived(metadata?.title || 'Untitled Document')
  const author = $derived(metadata?.author || 'Unknown Author')
  const progress = $derived(metadata?.readingSession?.progressPercent ?? 0)
  const format = $derived(metadata?.originalFormat?.toUpperCase() || 'PDF')

  // Generate a consistent color based on document ID
  const getGradientColors = (docId: string): [string, string] => {
    const gradients: [string, string][] = [
      ['#667eea', '#764ba2'],
      ['#f093fb', '#f5576c'],
      ['#4facfe', '#00f2fe'],
      ['#43e97b', '#38f9d7'],
      ['#fa709a', '#fee140'],
      ['#a8edea', '#fed6e3'],
      ['#ff9a9e', '#fecfef'],
      ['#667eea', '#764ba2'],
      ['#ffecd2', '#fcb69f'],
      ['#a1c4fd', '#c2e9fb']
    ]

    // Simple hash to pick gradient
    let hash = 0
    for (let i = 0; i < docId.length; i++) {
      hash = docId.charCodeAt(i) + ((hash << 5) - hash)
    }
    const index = Math.abs(hash) % gradients.length
    return gradients[index]
  }

  const [gradientStart, gradientEnd] = getGradientColors(id)

  const getFormatIcon = (fmt: string): string => {
    switch (fmt.toLowerCase()) {
      case 'pdf':
        return 'doc.text'
      case 'epub':
        return 'book'
      case 'pptx':
        return 'rectangle.stack'
      case 'docx':
        return 'doc'
      default:
        return 'doc'
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onclick()
    }
  }

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation()
    if (ondelete) {
      ondelete()
    }
  }
</script>

<article
  class="book-card"
  {onclick}
  {oncontextmenu}
  onkeydown={handleKeyDown}
  role="button"
  tabindex="0"
  aria-label="Open {title}"
>
  <div
    class="cover"
    style="background: linear-gradient(135deg, {gradientStart} 0%, {gradientEnd} 100%)"
  >
    {#if ondelete}
      <button class="delete-btn" onclick={handleDelete} title="Delete document">
        <Icon name="xmark" size="0.9rem" />
      </button>
    {/if}
    <div class="placeholder-cover">
      <Icon name={getFormatIcon(format)} size="2rem" />
      <span class="format-badge">{format}</span>
    </div>
  </div>

  <div class="info">
    <h4 class="title" {title}>{title}</h4>
    <span class="author" title={author}>{author}</span>

    <div class="progress-section">
      <span class="progress-label">Progress</span>
      <span class="progress-value">{progress}%</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width: {progress}%"></div>
    </div>
  </div>
</article>

<style lang="scss">
  .book-card {
    background: var(--card-bg, white);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    }

    &:focus-visible {
      outline: 2px solid var(--accent-color, #3b82f6);
      outline-offset: 2px;
    }

    &:active {
      transform: translateY(0);
    }

    .cover {
      aspect-ratio: 3 / 4;
      min-height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;

      .delete-btn {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: none;
        background: rgba(0, 0, 0, 0.5);
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition:
          opacity 0.2s ease,
          background 0.2s ease;

        &:hover {
          background: rgba(220, 38, 38, 0.9);
        }
      }

      .placeholder-cover {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: white;
        gap: 0.5rem;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);

        .format-badge {
          padding: 0.2rem 0.5rem;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 600;
          backdrop-filter: blur(4px);
        }
      }
    }

    &:hover .delete-btn {
      opacity: 1;
    }

    .info {
      padding: 0.75rem;
      flex: 1;
      display: flex;
      flex-direction: column;

      .title {
        font-size: 0.85rem;
        font-weight: 600;
        margin: 0 0 0.25rem;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        line-height: 1.3;
        color: var(--text-primary);
      }

      .author {
        font-size: 0.75rem;
        color: var(--text-secondary, rgba(0, 0, 0, 0.5));
        display: block;
        margin-bottom: auto;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .progress-section {
        display: flex;
        justify-content: space-between;
        font-size: 0.7rem;
        color: var(--text-secondary, rgba(0, 0, 0, 0.5));
        margin-top: 0.5rem;
        margin-bottom: 0.25rem;
      }

      .progress-bar {
        height: 3px;
        background: rgba(0, 0, 0, 0.1);
        border-radius: 2px;
        overflow: hidden;

        .progress-fill {
          height: 100%;
          background: var(--accent-color, #3b82f6);
          transition: width 0.3s ease;
          border-radius: 2px;
        }
      }
    }
  }
</style>
