<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { useLogScope } from '@deta/utils'

  // Props
  let {
    documentTitle = 'Document',
    onClose
  }: {
    documentTitle?: string
    onClose: () => void
  } = $props()

  const log = useLogScope('NotebookLMPanel')

  // State
  let panelWidth = $state(350)
  let isResizing = $state(false)
  let copySuccess = $state(false)

  const NOTEBOOKLM_URL = 'https://notebooklm.google.com'
  const MIN_WIDTH = 280
  const MAX_WIDTH = 500

  // Handle resize drag
  function handleResizeStart(e: MouseEvent) {
    isResizing = true
    e.preventDefault()
  }

  function handleResizeMove(e: MouseEvent) {
    if (!isResizing) return
    const newWidth = window.innerWidth - e.clientX
    panelWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth))
  }

  function handleResizeEnd() {
    isResizing = false
  }

  // Open NotebookLM in new window/tab
  function openNotebookLM() {
    log.debug('Opening NotebookLM')
    window.open(NOTEBOOKLM_URL, '_blank', 'noopener,noreferrer')
  }

  // Copy document title to clipboard
  async function copyDocumentInfo() {
    try {
      await navigator.clipboard.writeText(documentTitle)
      copySuccess = true
      setTimeout(() => (copySuccess = false), 2000)
      log.debug('Copied document title to clipboard')
    } catch (err) {
      log.error('Failed to copy:', err)
    }
  }

  onMount(() => {
    window.addEventListener('mousemove', handleResizeMove)
    window.addEventListener('mouseup', handleResizeEnd)
    log.debug('NotebookLM panel mounted')
  })

  onDestroy(() => {
    window.removeEventListener('mousemove', handleResizeMove)
    window.removeEventListener('mouseup', handleResizeEnd)
  })
</script>

<div class="notebooklm-panel" style:width="{panelWidth}px" class:resizing={isResizing}>
  <!-- Resize handle -->
  <div
    class="resize-handle"
    onmousedown={handleResizeStart}
    role="separator"
    aria-orientation="vertical"
    tabindex="0"
  ></div>

  <!-- Header -->
  <header class="panel-header">
    <div class="header-left">
      <span class="panel-icon">📓</span>
      <span class="panel-title">NotebookLM</span>
    </div>
    <div class="header-right">
      <button class="header-btn" onclick={onClose} title="Close panel"> ✕ </button>
    </div>
  </header>

  <!-- Content -->
  <div class="panel-content">
    <!-- Info Section -->
    <div class="info-section">
      <div class="info-icon">🎓</div>
      <h3>Supercharge Your Learning</h3>
      <p>Use NotebookLM for audio overviews, flashcards, quizzes, and AI-powered study tools.</p>
    </div>

    <!-- Current Document -->
    <div class="document-section">
      <span class="section-label">Current Document</span>
      <div class="document-name">{documentTitle}</div>
    </div>

    <!-- Quick Actions -->
    <div class="actions-section">
      <button class="action-btn primary" onclick={openNotebookLM}>
        <span class="action-icon">🚀</span>
        <span class="action-text">
          <strong>Open NotebookLM</strong>
          <small>Opens in new window</small>
        </span>
      </button>

      <button class="action-btn" onclick={copyDocumentInfo}>
        <span class="action-icon">{copySuccess ? '✅' : '📋'}</span>
        <span class="action-text">
          <strong>{copySuccess ? 'Copied!' : 'Copy Document Title'}</strong>
          <small>For easy reference</small>
        </span>
      </button>
    </div>

    <!-- Features List -->
    <div class="features-section">
      <span class="section-label">NotebookLM Features</span>
      <ul class="features-list">
        <li>🎙️ Audio Overviews (podcast-style)</li>
        <li>📚 Flashcards & Quizzes</li>
        <li>📝 Summaries & Outlines</li>
        <li>🗺️ Mind Maps</li>
        <li>💬 AI Chat about your docs</li>
      </ul>
    </div>

    <!-- Workflow Tip -->
    <div class="tip-section">
      <strong>💡 Workflow:</strong>
      <ol class="workflow-steps">
        <li>Upload your PDF to NotebookLM</li>
        <li>Generate study materials</li>
        <li>Read here while reviewing in NotebookLM</li>
      </ol>
    </div>
  </div>
</div>

<style>
  .notebooklm-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: light-dark(#fafafa, #1a1a1a);
    border-left: 1px solid light-dark(#e0e0e0, #333);
    position: relative;
    flex-shrink: 0;
  }

  .notebooklm-panel.resizing {
    user-select: none;
  }

  .resize-handle {
    position: absolute;
    left: -4px;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: col-resize;
    background: transparent;
    z-index: 10;
  }

  .resize-handle:hover,
  .notebooklm-panel.resizing .resize-handle {
    background: light-dark(rgba(99, 102, 241, 0.3), rgba(129, 140, 248, 0.3));
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: light-dark(#f5f5f5, #252525);
    border-bottom: 1px solid light-dark(#e0e0e0, #333);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .panel-icon {
    font-size: 1.1rem;
  }
  .panel-title {
    font-weight: 600;
    font-size: 0.9rem;
    color: light-dark(#333, #eee);
  }

  .header-btn {
    background: none;
    border: none;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    border-radius: 4px;
    color: light-dark(#666, #999);
  }

  .header-btn:hover {
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.1));
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .info-section {
    text-align: center;
    padding: 1rem;
    background: light-dark(#f0f4ff, #1e2a3a);
    border-radius: 12px;
  }

  .info-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }
  .info-section h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    color: light-dark(#333, #eee);
  }
  .info-section p {
    margin: 0;
    font-size: 0.85rem;
    color: light-dark(#666, #aaa);
    line-height: 1.4;
  }

  .document-section {
    padding: 0.75rem;
    background: light-dark(#fff, #2a2a2a);
    border: 1px solid light-dark(#e0e0e0, #444);
    border-radius: 8px;
  }

  .section-label {
    display: block;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: light-dark(#888, #777);
    margin-bottom: 0.25rem;
  }
  .document-name {
    font-weight: 500;
    color: light-dark(#333, #eee);
    font-size: 0.9rem;
    word-break: break-word;
  }

  .actions-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: light-dark(#fff, #2a2a2a);
    border: 1px solid light-dark(#e0e0e0, #444);
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .action-btn:hover {
    background: light-dark(#f5f5f5, #333);
  }

  .action-btn.primary {
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    border: none;
    color: white;
  }

  .action-btn.primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
  }
  .action-btn.primary .action-text small {
    color: rgba(255, 255, 255, 0.8);
  }

  .action-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
  }
  .action-text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .action-text strong {
    font-size: 0.9rem;
    font-weight: 600;
  }
  .action-text small {
    font-size: 0.75rem;
    color: light-dark(#888, #888);
  }

  .features-section {
    padding: 0.75rem;
    background: light-dark(#fff, #2a2a2a);
    border: 1px solid light-dark(#e0e0e0, #444);
    border-radius: 8px;
  }
  .features-list {
    margin: 0.5rem 0 0;
    padding: 0;
    list-style: none;
  }
  .features-list li {
    padding: 0.35rem 0;
    font-size: 0.85rem;
    color: light-dark(#555, #bbb);
  }

  .tip-section {
    padding: 0.75rem;
    background: light-dark(#fffbeb, #2a2617);
    border: 1px solid light-dark(#fcd34d, #524a20);
    border-radius: 8px;
    font-size: 0.8rem;
    color: light-dark(#92400e, #fcd34d);
  }
  .workflow-steps {
    margin: 0.5rem 0 0;
    padding-left: 1.25rem;
  }
  .workflow-steps li {
    margin: 0.25rem 0;
  }
</style>
