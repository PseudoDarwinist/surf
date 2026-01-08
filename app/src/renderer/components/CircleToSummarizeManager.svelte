<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import LassoCanvas from './LassoCanvas.svelte'
  import SummaryPopup from './SummaryPopup.svelte'
  import { extractTitle } from '../utils/contentExtractor'
  import { getCenterPoint } from '../utils/lassoUtils'
  import { useTabs } from '@deta/services/tabs'
  import { useViewManager } from '@deta/services/views'
  import { penToolActiveStore, setPenToolActive } from '../stores/circleToSummarize'

  // Access services
  const tabsService = useTabs()
  const viewManager = useViewManager()

  const LOG_PREFIX = '[CircleToSummarize]'

  // State
  let penToolActive = $state(false)
  let showSummaryPopup = $state(false)
  let summaryPopupPosition = $state({ x: 0, y: 0 })
  let summaryTitle = $state('')
  let summaryContent = $state('')
  let isSummaryLoading = $state(false)
  let isSummaryExpanded = $state(false)
  let deeperExplanation = $state('')
  let isLoadingDeeper = $state(false)
  let extractedFullText = $state('')
  let screenshotUrl = $state<string | undefined>(undefined)

  // Streaming state
  let streamingContent = $state('')

  // Store subscription and cleanup functions
  let storeUnsubscribe: (() => void) | null = null
  let wasWebviewHidden = false
  let streamCleanupFns: (() => void)[] = []

  onMount(() => {
    console.log(LOG_PREFIX, '=== COMPONENT MOUNTED ===')

    // Subscribe to the shared store for pen tool state
    storeUnsubscribe = penToolActiveStore.subscribe(async (active) => {
      console.log(LOG_PREFIX, 'Store update received:', active)

      if (penToolActive !== active) {
        penToolActive = active

        // When pen tool becomes active, hide webviews so our overlay can appear
        if (active && !wasWebviewHidden) {
          console.log(LOG_PREFIX, 'Hiding webviews for drawing mode')
          await viewManager.hideViews(true)
          wasWebviewHidden = true
        }

        // When pen tool becomes inactive AND we're not showing popup, restore webviews
        if (!active && !showSummaryPopup && wasWebviewHidden) {
          console.log(LOG_PREFIX, 'Restoring webviews after drawing mode')
          const activeTab = tabsService.activeTab
          if (activeTab?.view) {
            await viewManager.activate(activeTab.view.id)
          }
          wasWebviewHidden = false
        }
      }
    })

    // Setup streaming event listeners
    // @ts-ignore - window.api is injected
    if (window.api?.claudeAgent) {
      streamCleanupFns.push(
        // @ts-ignore
        window.api.claudeAgent.onStreamStart((data: { screenshotUrl: string }) => {
          console.log(LOG_PREFIX, 'Stream started, screenshot captured')
          screenshotUrl = data.screenshotUrl
          streamingContent = ''
        })
      )
      streamCleanupFns.push(
        // @ts-ignore
        window.api.claudeAgent.onStreamChunk((chunk: string) => {
          console.log(LOG_PREFIX, 'Stream chunk received:', chunk.length)
          streamingContent += chunk
          summaryContent = streamingContent
          summaryTitle = extractTitle(streamingContent)
        })
      )
      streamCleanupFns.push(
        // @ts-ignore
        window.api.claudeAgent.onStreamComplete((data: { content: string }) => {
          console.log(LOG_PREFIX, 'Stream complete')
          summaryContent = data.content
          summaryTitle = extractTitle(data.content)
          extractedFullText = data.content
          isSummaryLoading = false
        })
      )
      streamCleanupFns.push(
        // @ts-ignore
        window.api.claudeAgent.onStreamError((error: string) => {
          console.error(LOG_PREFIX, 'Stream error:', error)
          summaryContent = `Error: ${error}`
          summaryTitle = 'Error'
          isSummaryLoading = false
        })
      )
    }
  })

  onDestroy(() => {
    console.log(LOG_PREFIX, '=== COMPONENT DESTROYED ===')
    if (storeUnsubscribe) {
      storeUnsubscribe()
    }
    // Cleanup stream listeners
    streamCleanupFns.forEach((fn) => fn())
    streamCleanupFns = []
  })

  // Handle ESC key to cancel drawing or close popup
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      console.log(LOG_PREFIX, 'ESC pressed, closing...')
      if (penToolActive) {
        penToolActive = false
        setPenToolActive(false)
      }
      if (showSummaryPopup) {
        handlePopupClose()
      }
    }
  }

  // Restore webviews when popup closes
  async function handlePopupClose() {
    showSummaryPopup = false
    isSummaryExpanded = false
    deeperExplanation = ''
    streamingContent = ''

    // Restore webviews
    if (wasWebviewHidden) {
      console.log(LOG_PREFIX, 'Restoring webviews after popup close')
      const activeTab = tabsService.activeTab
      if (activeTab?.view) {
        await viewManager.activate(activeTab.view.id)
      }
      wasWebviewHidden = false
    }
  }

  // Track state changes
  $effect(() => {
    console.log(LOG_PREFIX, 'Pen tool active:', penToolActive)
  })
</script>

<svelte:window on:keydown={handleKeyDown} />

<!-- Simple CSS fixed overlay - NO Overlay component, NO window.open() -->
{#if penToolActive || showSummaryPopup}
  <div class="drawing-overlay" class:has-popup={showSummaryPopup && !penToolActive}>
    <!-- Pen tool active indicator -->
    {#if penToolActive}
      <div class="pen-indicator">
        <span>✏️ Circle content to summarize (ESC to cancel)</span>
      </div>
    {/if}

    <!-- Lasso Canvas -->
    <LassoCanvas
      active={penToolActive}
      on:circleComplete={async (e) => {
        const { bounds, points } = e.detail
        console.log(LOG_PREFIX, 'Circle complete:', bounds)

        // Get center point for popup position (not used anymore but keep for reference)
        const center = getCenterPoint(points)
        summaryPopupPosition = { x: center.x, y: bounds.bottom }

        // Get the active tab's view ID for screenshot capture
        const activeTab = tabsService.activeTab
        const viewId = activeTab?.view?.id

        if (!viewId) {
          console.error('No active view ID found')
          summaryTitle = 'Error'
          summaryContent = 'Could not identify the active tab for content extraction.'
          showSummaryPopup = true
          penToolActive = false
          setPenToolActive(false)
          return
        }

        // Show popup and start loading with streaming
        showSummaryPopup = true
        isSummaryLoading = true
        isSummaryExpanded = false
        deeperExplanation = ''
        summaryTitle = 'Analyzing content...'
        summaryContent = ''
        streamingContent = ''

        // Call streaming AI to summarize using screenshot
        try {
          // @ts-ignore - window.api is injected by preload
          await window.api.claudeAgent.summarizeWithScreenshotStream(
            {
              x: Math.floor(bounds.x),
              y: Math.floor(bounds.y),
              width: Math.floor(bounds.width),
              height: Math.floor(bounds.height)
            },
            viewId
          )
          // Response comes via stream events, not return value
        } catch (err) {
          console.error('Screenshot summarize error:', err)
          summaryContent = 'Failed to generate summary. Please try again.'
          summaryTitle = 'Error'
          isSummaryLoading = false
        }

        // Deactivate pen tool after circle complete
        penToolActive = false
        setPenToolActive(false)
      }}
      on:cancel={() => {
        penToolActive = false
        setPenToolActive(false)
      }}
    />

    <!-- Summary Popup - centered in viewport -->
    {#if showSummaryPopup}
      <div class="popup-backdrop" on:click={handlePopupClose}>
        <div class="popup-container" on:click|stopPropagation>
          <SummaryPopup
            title={summaryTitle}
            summary={summaryContent}
            isLoading={isSummaryLoading}
            position={summaryPopupPosition}
            isExpanded={isSummaryExpanded}
            {deeperExplanation}
            {isLoadingDeeper}
            centered={true}
            on:expand={async () => {
              if (isLoadingDeeper || deeperExplanation) return

              isSummaryExpanded = true
              isLoadingDeeper = true

              try {
                // @ts-ignore - window.api is injected by preload
                const result = await window.api.claudeAgent.explainDeep(
                  summaryTitle,
                  extractedFullText
                )
                deeperExplanation = result.content || 'Unable to generate detailed explanation.'
                if (result.error) {
                  deeperExplanation = `Error: ${result.error}`
                }
              } catch (err) {
                console.error('Deep explain error:', err)
                deeperExplanation = 'Failed to generate explanation. Please try again.'
              } finally {
                isLoadingDeeper = false
              }
            }}
            on:close={handlePopupClose}
          />
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Fixed overlay - covers entire viewport */
  .drawing-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 99999;
    pointer-events: auto;
  }

  .drawing-overlay.has-popup {
    /* Transparent when popup is showing - glassmorphism is on backdrop */
    background: transparent;
  }

  /* Glassmorphism backdrop - positions popup at top */
  .popup-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(12px) saturate(150%);
    -webkit-backdrop-filter: blur(12px) saturate(150%);
    display: flex;
    align-items: flex-start; /* Top alignment like Cluely */
    justify-content: center;
    padding-top: 8vh; /* Position near top of screen */
    animation: backdropFadeIn 0.3s ease-out;
    pointer-events: auto;
    cursor: pointer;
    z-index: 100001;
  }

  .popup-container {
    width: 95%;
    max-width: 900px; /* Much wider for elongated look */
    max-height: 50vh; /* Short height */
    animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: auto;
    cursor: default;
  }

  /* Pen tool indicator - floating pill */
  .pen-indicator {
    position: absolute;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.95) 0%, rgba(168, 85, 247, 0.95) 100%);
    color: white;
    border-radius: 28px;
    font-size: 14px;
    font-weight: 500;
    z-index: 100000;
    animation: floatIn 0.3s ease-out;
    box-shadow:
      0 8px 32px rgba(99, 102, 241, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.1) inset;
    pointer-events: none;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  @keyframes backdropFadeIn {
    from {
      opacity: 0;
      backdrop-filter: blur(0px);
    }
    to {
      opacity: 1;
      backdrop-filter: blur(12px);
    }
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-40px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes floatIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
