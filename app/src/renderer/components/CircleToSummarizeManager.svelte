<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import Overlay from '../Core/components/Overlays/Overlay.svelte'
  import DrawingToolbar from './DrawingToolbar.svelte'
  import LassoCanvas from './LassoCanvas.svelte'
  import SummaryPopup from './SummaryPopup.svelte'
  import { extractDOMText, extractTitle } from '../utils/contentExtractor'
  import { getCenterPoint } from '../utils/lassoUtils'

  // State from Core.svelte, moved here for encapsulation
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

  // Overlay bounds - full screen
  let overlayBounds = $state({ x: 0, y: 0, width: 0, height: 0 })

  // Update bounds on mount
  $effect(() => {
    if (typeof window !== 'undefined') {
      overlayBounds = {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight
      }
    }
  })

  // Handle resize
  function updateBounds() {
    if (typeof window !== 'undefined') {
      overlayBounds = {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight
      }
    }
  }

  onMount(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateBounds)
    }
  })

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', updateBounds)
    }
  })
</script>

<!-- The Manager renders ONE Overlay that contains all UI elements -->
<!-- enablePointerEvents=true allows clicking through to underlying page relative to the children -->
<!-- But wait, Overlay creates a new window layer. We need the toolbar to be interactive. -->
<Overlay bounds={overlayBounds} autofocus={penToolActive || showSummaryPopup}>
  {#snippet children()}
    <div class="circle-ai-container">
      <!-- 1. Toolbar - Always visible at bottom -->
      <DrawingToolbar
        ontoolchange={(detail) => {
          penToolActive = detail.tool === 'pen'
          if (!penToolActive) {
            showSummaryPopup = false
          }
        }}
        onclose={() => {
          penToolActive = false
          showSummaryPopup = false
        }}
      />

      <!-- 2. Lasso Canvas - Visible when pen tool active -->
      <LassoCanvas
        active={penToolActive}
        on:circleComplete={async (e) => {
          const { bounds, points } = e.detail

          // Get center point for popup position
          const center = getCenterPoint(points)
          summaryPopupPosition = { x: center.x, y: bounds.bottom }

          // Extract content from circled region
          extractedFullText = extractDOMText(bounds)
          summaryTitle = extractTitle(extractedFullText)

          // Show popup and start loading
          showSummaryPopup = true
          isSummaryLoading = true
          isSummaryExpanded = false
          deeperExplanation = ''

          // Call AI to summarize
          try {
            // @ts-ignore - window.api is injected by preload
            const result = await window.api.claudeAgent.summarize(extractedFullText)
            summaryContent = result.content || 'Unable to generate summary.'
            if (result.error) {
              summaryContent = `Error: ${result.error}`
            }
          } catch (err) {
            console.error('Summarize error:', err)
            summaryContent = 'Failed to generate summary. Please try again.'
          } finally {
            isSummaryLoading = false
          }

          // Deactivate pen tool after circle complete
          penToolActive = false
        }}
        on:cancel={() => {
          penToolActive = false
        }}
      />

      <!-- 3. Summary Popup -->
      {#if showSummaryPopup}
        <SummaryPopup
          title={summaryTitle}
          summary={summaryContent}
          isLoading={isSummaryLoading}
          position={summaryPopupPosition}
          isExpanded={isSummaryExpanded}
          {deeperExplanation}
          {isLoadingDeeper}
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
          on:close={() => {
            showSummaryPopup = false
            isSummaryExpanded = false
            deeperExplanation = ''
          }}
        />
      {/if}
    </div>
  {/snippet}
</Overlay>

<style>
  /* Ensure container doesn't block clicks unless hitting a child */
  .circle-ai-container {
    width: 100%;
    height: 100%;
    pointer-events: none; /* Let clicks pass through empty space */
  }

  /* Children need verify pointer events */
  :global(.circle-ai-container > *) {
    pointer-events: auto;
  }
</style>
