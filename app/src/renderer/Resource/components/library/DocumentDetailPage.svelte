<script lang="ts">
  import { Icon } from '@deta/icons'
  import type { LibraryDocumentMetadata, Chapter } from '@deta/types'
  import JourneyMapMini from './JourneyMapMini.svelte'
  import JourneyMapFull from './JourneyMapFull.svelte'

  interface Props {
    resourceId: string
    metadata: LibraryDocumentMetadata
    onback: () => void
    oncontinue: (options: { restoreSession?: boolean; chapterIndex?: number }) => void
  }

  let { resourceId, metadata, onback, oncontinue }: Props = $props()

  // Journey Map state
  let journeyMapOpen = $state(false)

  const handleOpenJourneyMap = () => {
    journeyMapOpen = true
  }

  const handleCloseJourneyMap = () => {
    journeyMapOpen = false
  }

  const handleJourneyRead = (chapterIndex: number) => {
    oncontinue({ restoreSession: false, chapterIndex })
  }

  const title = $derived(metadata?.title || 'Untitled Document')
  const author = $derived(metadata?.author || 'Unknown Author')
  const description = $derived(metadata?.description)
  const progress = $derived(metadata?.readingSession?.progressPercent ?? 0)
  const format = $derived(metadata?.originalFormat?.toUpperCase() || 'PDF')
  const chapters = $derived(metadata?.tableOfContents ?? [])
  const currentChapter = $derived(metadata?.readingSession?.currentChapterIndex ?? 0)
  const hasSession = $derived(metadata?.readingSession && progress > 0)
  const pageCount = $derived(metadata?.pageCount)

  // Generate a more sophisticated cover gradient
  const getCoverStyle = (id: string): string => {
    const schemes = [
      { bg: '#1e3a5f', accent: '#2563eb' }, // Deep blue
      { bg: '#1f2937', accent: '#6366f1' }, // Slate/Indigo
      { bg: '#134e4a', accent: '#14b8a6' }, // Teal
      { bg: '#3f3f46', accent: '#a78bfa' }, // Gray/Purple
      { bg: '#44403c', accent: '#f59e0b' } // Stone/Amber
    ]
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash)
    }
    const scheme = schemes[Math.abs(hash) % schemes.length]
    return `background: linear-gradient(145deg, ${scheme.bg} 0%, ${scheme.accent}22 100%); border: 1px solid ${scheme.accent}33;`
  }

  const coverStyle = getCoverStyle(resourceId)

  // Calculate per-chapter progress using actual session data
  const getChapterProgress = (index: number): number => {
    const session = metadata?.readingSession
    if (!session) return 0

    const savedChapterIndex = session.currentChapterIndex ?? 0

    // Past chapters are 100% complete
    if (index < savedChapterIndex) return 100

    // Future chapters are 0%
    if (index > savedChapterIndex) return 0

    // Current chapter: calculate from chunk data
    if (index === savedChapterIndex) {
      const currentChunk = session.currentChunkIndex ?? 0
      const totalChunks = session.totalChunks ?? 1
      return Math.round(((currentChunk + 1) / totalChunks) * 100)
    }

    return 0
  }

  // Check if chapter is bookmarked (placeholder - could be stored in metadata)
  const isBookmarked = (index: number): boolean => {
    return index === 0 // Just first chapter for now as example
  }

  const handleContinueReading = () => {
    oncontinue({ restoreSession: true, chapterIndex: currentChapter })
  }

  const handleStartFromBeginning = () => {
    oncontinue({ restoreSession: false, chapterIndex: 0 })
  }

  const handleChapterSelect = (chapter: Chapter, index: number) => {
    oncontinue({ restoreSession: false, chapterIndex: index })
  }
</script>

<div class="document-detail">
  <header class="nav-header">
    <button class="back-btn" onclick={onback}>
      <Icon name="chevron.left" size="0.875rem" />
      <span>Back to Library</span>
    </button>
  </header>

  <div class="detail-content">
    <!-- Left: Journey Map + Metadata -->
    <aside class="sidebar">
      <div class="cover-container">
        <!-- Journey Map Mini (replaces boring cover) -->
        <JourneyMapMini onopen={handleOpenJourneyMap} />
      </div>

      <div class="metadata">
        <div class="meta-item">
          <span class="meta-label">Progress</span>
          <span class="meta-value">{progress}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {progress}%"></div>
        </div>

        {#if pageCount}
          <div class="meta-item">
            <span class="meta-label">Pages</span>
            <span class="meta-value">{pageCount}</span>
          </div>
        {/if}

        {#if metadata?.originalPath}
          <div class="meta-item source">
            <span class="meta-label">Source</span>
            <span class="meta-value source-path" title={metadata.originalPath}>
              {metadata.originalPath.split('/').pop()}
            </span>
          </div>
        {/if}
      </div>
    </aside>

    <!-- Right: Content -->
    <main class="main-content">
      <div class="title-section">
        <h1>{title}</h1>
        <p class="author">by {author}</p>

        <button
          class="start-reading-link"
          onclick={hasSession ? handleContinueReading : handleStartFromBeginning}
        >
          {hasSession ? 'Continue Reading' : 'Start Reading'}
        </button>
      </div>

      {#if description}
        <section class="description-section">
          <h2>About This Document</h2>
          <p>{description}</p>
        </section>
      {/if}

      {#if chapters.length > 0}
        <section class="chapters-section">
          <h2>Table of Contents</h2>

          <div class="chapters-list">
            {#each chapters as chapter, index}
              {@const chapterProgress = getChapterProgress(index)}
              {@const isActive = index === currentChapter}
              {@const isComplete = index < currentChapter}
              {@const bookmarked = isBookmarked(index)}

              <button
                class="chapter-item"
                class:active={isActive}
                class:completed={isComplete}
                onclick={() => handleChapterSelect(chapter, index)}
              >
                <div class="chapter-icon">
                  <Icon name={isComplete ? 'checkmark.circle.fill' : 'book'} size="1.25rem" />
                </div>

                <div class="chapter-content">
                  <span class="chapter-title">{chapter.title}</span>
                  <div class="chapter-progress-bar">
                    <div class="chapter-progress-fill" style="width: {chapterProgress}%"></div>
                  </div>
                </div>

                {#if bookmarked}
                  <div class="bookmark-indicator">
                    <Icon name="bookmark.fill" size="1rem" />
                  </div>
                {/if}
              </button>
            {/each}
          </div>
        </section>
      {/if}
    </main>
  </div>
</div>

<!-- Full Journey Map Modal -->
<JourneyMapFull
  open={journeyMapOpen}
  documentTitle={title}
  onclose={handleCloseJourneyMap}
  onread={handleJourneyRead}
/>

<style lang="scss">
  .document-detail {
    height: 100%;
    overflow-y: auto;
    background: light-dark(#fafafa, #0f0f0f);
  }

  .nav-header {
    position: sticky;
    top: 0;
    z-index: 10;
    padding: 1rem 1.5rem;
    background: light-dark(#fafafa, #0f0f0f);
    border-bottom: 1px solid light-dark(#e5e5e5, #262626);
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    background: none;
    border: none;
    color: light-dark(#525252, #a3a3a3);
    cursor: pointer;
    padding: 0.375rem 0.5rem;
    margin: -0.375rem -0.5rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.15s ease;

    &:hover {
      background: light-dark(#f5f5f5, #1a1a1a);
      color: light-dark(#171717, #f5f5f5);
    }
  }

  .detail-content {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 3rem;
    max-width: 1100px;
    margin: 0 auto;
    padding: 2rem 2.5rem 4rem;

    @media (max-width: 768px) {
      grid-template-columns: 1fr;
      gap: 2rem;
      padding: 1.5rem;
    }
  }

  // Sidebar (Cover + Metadata)
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;

    @media (max-width: 768px) {
      flex-direction: row;
      align-items: flex-start;
      gap: 1.25rem;
    }
  }

  .cover-container {
    @media (max-width: 768px) {
      flex-shrink: 0;
      width: 120px;
    }
  }

  .cover {
    aspect-ratio: 2.8 / 4;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -2px rgba(0, 0, 0, 0.1),
      0 0 0 1px rgba(0, 0, 0, 0.05);
    position: relative;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, transparent 50%);
    }

    .cover-inner {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      color: rgba(255, 255, 255, 0.9);
      position: relative;
      z-index: 1;
    }

    .format-label {
      font-size: 0.6875rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      padding: 0.25rem 0.625rem;
      background: rgba(255, 255, 255, 0.15);
      border-radius: 4px;
      backdrop-filter: blur(8px);
    }
  }

  .metadata {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;

    @media (max-width: 768px) {
      flex: 1;
    }
  }

  .meta-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8125rem;

    &.source {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
    }
  }

  .meta-label {
    color: light-dark(#737373, #737373);
    font-weight: 500;
  }

  .meta-value {
    color: light-dark(#262626, #e5e5e5);
    font-weight: 600;

    &.source-path {
      font-weight: 400;
      font-size: 0.75rem;
      color: light-dark(#3b82f6, #60a5fa);
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .progress-bar {
    height: 4px;
    background: light-dark(#e5e5e5, #262626);
    border-radius: 2px;
    overflow: hidden;
    margin-top: -0.25rem;
  }

  .progress-fill {
    height: 100%;
    background: light-dark(#3b82f6, #60a5fa);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  // Main Content
  .main-content {
    min-width: 0;
  }

  .title-section {
    margin-bottom: 2rem;

    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      color: light-dark(#0a0a0a, #fafafa);
      margin: 0 0 0.375rem;
      line-height: 1.25;
      letter-spacing: -0.025em;
    }

    .author {
      font-size: 0.9375rem;
      color: light-dark(#525252, #a3a3a3);
      margin: 0 0 1.25rem;
    }
  }

  .start-reading-link {
    display: inline-flex;
    align-items: center;
    background: none;
    border: none;
    padding: 0;
    font-size: 0.9375rem;
    font-weight: 500;
    color: light-dark(#3b82f6, #60a5fa);
    cursor: pointer;
    transition: color 0.15s ease;

    &:hover {
      color: light-dark(#2563eb, #93c5fd);
      text-decoration: underline;
    }
  }

  .description-section {
    margin-bottom: 2.5rem;
    padding: 1.25rem;
    background: light-dark(#f5f5f5, #171717);
    border-radius: 12px;
    border: 1px solid light-dark(#e5e5e5, #262626);

    h2 {
      font-size: 0.875rem;
      font-weight: 600;
      color: light-dark(#171717, #f5f5f5);
      margin: 0 0 0.625rem;
    }

    p {
      font-size: 0.875rem;
      color: light-dark(#525252, #a3a3a3);
      line-height: 1.65;
      margin: 0;
    }
  }

  .chapters-section {
    h2 {
      font-size: 1rem;
      font-weight: 600;
      color: light-dark(#171717, #f5f5f5);
      margin: 0 0 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid light-dark(#e5e5e5, #262626);
    }
  }

  .chapters-list {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .chapter-item {
    display: flex;
    align-items: flex-start;
    gap: 0.875rem;
    width: 100%;
    padding: 0.875rem 1rem;
    background: transparent;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;

    &:hover {
      background: light-dark(#f5f5f5, #1a1a1a);
    }

    &.active {
      background: light-dark(#eff6ff, #1e3a5f);

      .chapter-icon {
        color: light-dark(#3b82f6, #60a5fa);
      }

      .chapter-progress-fill {
        background: light-dark(#3b82f6, #60a5fa);
      }
    }

    &.completed {
      .chapter-icon {
        color: light-dark(#22c55e, #4ade80);
      }

      .chapter-title {
        color: light-dark(#737373, #737373);
      }
    }
  }

  .chapter-icon {
    flex-shrink: 0;
    color: light-dark(#a3a3a3, #525252);
    margin-top: 0.125rem;
  }

  .chapter-content {
    flex: 1;
    min-width: 0;
  }

  .chapter-title {
    display: block;
    font-size: 0.9375rem;
    font-weight: 500;
    color: light-dark(#262626, #e5e5e5);
    margin-bottom: 0.5rem;
    line-height: 1.35;
  }

  .chapter-progress-bar {
    height: 3px;
    background: light-dark(#e5e5e5, #262626);
    border-radius: 1.5px;
    overflow: hidden;
  }

  .chapter-progress-fill {
    height: 100%;
    background: light-dark(#d4d4d4, #404040);
    border-radius: 1.5px;
    transition: width 0.3s ease;
  }

  .bookmark-indicator {
    flex-shrink: 0;
    color: light-dark(#f59e0b, #fbbf24);
    margin-top: 0.125rem;
  }
</style>
