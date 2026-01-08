<script lang="ts">
  import { Icon } from '@deta/icons'

  interface Props {
    onupload: (files: File[]) => void
    isConverting?: boolean
    conversionProgress?: {
      stage: 'queued' | 'extracting' | 'converting' | 'complete' | 'error'
      progress: number
      message?: string
    }
  }

  let { onupload, isConverting = false, conversionProgress }: Props = $props()

  let isDragging = $state(false)

  const SUPPORTED_EXTENSIONS = ['pdf', 'epub', 'pptx', 'docx']
  const SUPPORTED_MIME_TYPES = [
    'application/pdf',
    'application/epub+zip',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]

  const isValidFile = (file: File): boolean => {
    // Check MIME type
    if (SUPPORTED_MIME_TYPES.includes(file.type)) {
      return true
    }
    // Fallback to extension check
    const ext = file.name.split('.').pop()?.toLowerCase()
    return ext ? SUPPORTED_EXTENSIONS.includes(ext) : false
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    isDragging = true
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    isDragging = false
  }

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    isDragging = false

    const files = Array.from(e.dataTransfer?.files || [])
    const validFiles = files.filter(isValidFile)

    if (validFiles.length > 0) {
      onupload(validFiles)
    }
  }

  const handleClick = () => {
    // Signal parent to open file picker
    onupload([])
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  const stageLabels: Record<string, string> = {
    queued: 'Queued for processing...',
    extracting: 'Extracting content...',
    converting: 'Converting to readable format...',
    complete: 'Conversion complete!',
    error: 'Conversion failed'
  }
</script>

<div
  class="library-dropzone"
  class:dragging={isDragging}
  class:converting={isConverting}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  onclick={handleClick}
  onkeydown={handleKeyDown}
  role="button"
  tabindex="0"
  aria-label="Upload document to library"
>
  {#if isConverting && conversionProgress}
    <div class="converting-state">
      <div class="spinner">
        <Icon name="arrow.clockwise" size="1.5rem" />
      </div>
      <h3>Processing document...</h3>
      <p>{stageLabels[conversionProgress.stage] || conversionProgress.message}</p>
      <div class="progress-bar">
        <div class="progress" style="width: {conversionProgress.progress}%"></div>
      </div>
    </div>
  {:else}
    <div class="upload-icon">
      <Icon name="doc.text" size="2rem" />
    </div>
    <h3>Upload a document</h3>
    <p>Drag and drop a file here, or click to browse</p>
    <div class="file-types">
      {#each SUPPORTED_EXTENSIONS as ext}
        <span class="chip">{ext.toUpperCase()}</span>
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .library-dropzone {
    border: 2px dashed var(--border-color, rgba(0, 0, 0, 0.15));
    border-radius: 16px;
    padding: 2rem 1.5rem;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
    background: var(--surface-subtle, rgba(0, 0, 0, 0.02));
    margin: 0.75rem;

    &:hover,
    &.dragging {
      border-color: var(--accent-color, #3b82f6);
      background: var(--accent-subtle, rgba(59, 130, 246, 0.05));

      .upload-icon {
        transform: scale(1.1);
        color: var(--accent-color, #3b82f6);
      }
    }

    &.converting {
      cursor: default;
      pointer-events: none;
    }

    &:focus-visible {
      outline: 2px solid var(--accent-color, #3b82f6);
      outline-offset: 2px;
    }

    .upload-icon {
      margin-bottom: 0.5rem;
      color: var(--text-secondary, rgba(0, 0, 0, 0.5));
      transition: all 0.2s ease;
    }

    h3 {
      margin: 0.5rem 0 0.25rem;
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    p {
      color: var(--text-secondary, rgba(0, 0, 0, 0.5));
      font-size: 0.85rem;
      margin: 0 0 1rem;
    }

    .file-types {
      display: flex;
      gap: 0.5rem;
      justify-content: center;
      flex-wrap: wrap;

      .chip {
        padding: 0.2rem 0.6rem;
        background: var(--chip-bg, rgba(0, 0, 0, 0.06));
        border-radius: 1rem;
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--text-secondary);
      }
    }

    .converting-state {
      .spinner {
        animation: spin 1s linear infinite;
        margin-bottom: 0.5rem;
        color: var(--accent-color, #3b82f6);
      }

      h3 {
        color: var(--accent-color, #3b82f6);
      }
    }

    .progress-bar {
      width: 100%;
      height: 4px;
      background: rgba(0, 0, 0, 0.1);
      border-radius: 2px;
      margin-top: 1rem;
      overflow: hidden;

      .progress {
        height: 100%;
        background: var(--accent-color, #3b82f6);
        transition: width 0.3s ease;
        border-radius: 2px;
      }
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
