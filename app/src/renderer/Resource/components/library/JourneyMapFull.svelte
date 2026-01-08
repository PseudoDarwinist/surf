<script lang="ts">
  import { onMount } from 'svelte'
  import { fade, fly, scale } from 'svelte/transition'
  import { cubicOut, backOut } from 'svelte/easing'
  import { Icon } from '@deta/icons'

  interface Touchpoint {
    id: string
    title: string
    summary: string
    type: 'intro' | 'argument' | 'evidence' | 'turning_point' | 'conclusion'
    chapterIndex: number
  }

  interface Props {
    open?: boolean
    documentTitle?: string
    touchpoints?: Touchpoint[]
    onclose?: () => void
    onread?: (chapterIndex: number) => void
  }

  let {
    open = false,
    documentTitle = 'Document',
    touchpoints = [],
    onclose,
    onread
  }: Props = $props()

  const mockTouchpoints: Touchpoint[] = [
    {
      id: '1',
      title: 'Introduction & Context',
      summary:
        'Sets the stage by introducing the core problem of airline disruption management and why traditional approaches fall short in handling complex, real-time scenarios.',
      type: 'intro',
      chapterIndex: 0
    },
    {
      id: '2',
      title: 'The Neural Network Approach',
      summary:
        'Presents the key insight: using artificial neural networks to model the complex, non-linear relationships between disruption variables and optimal recovery strategies.',
      type: 'argument',
      chapterIndex: 1
    },
    {
      id: '3',
      title: 'Training Data & Methodology',
      summary:
        'Details how historical disruption data was collected, preprocessed, and used to train the model. Explains the choice of network architecture and hyperparameters.',
      type: 'evidence',
      chapterIndex: 2
    },
    {
      id: '4',
      title: 'Key Findings',
      summary:
        'The turning point: reveals that the ANN model outperforms traditional optimization methods by 23% in recovery time while reducing passenger impact by 18%.',
      type: 'turning_point',
      chapterIndex: 3
    },
    {
      id: '5',
      title: 'Implications & Future Work',
      summary:
        'Discusses how these findings could reshape airline operations, limitations of the current approach, and promising directions for future research.',
      type: 'conclusion',
      chapterIndex: 4
    }
  ]

  const displayTouchpoints = $derived(touchpoints.length > 0 ? touchpoints : mockTouchpoints)

  let mounted = $state(false)
  let selectedIndex = $state<number | null>(null)

  const selectedTouchpoint = $derived(
    selectedIndex !== null ? displayTouchpoints[selectedIndex] : null
  )

  // Phase configuration - each touchpoint type is a "phase" in the journey
  const phaseConfig: Record<string, { color: string; label: string; icon: string }> = {
    intro: { color: '#3B82F6', label: 'Introduction', icon: 'flag.fill' },
    argument: { color: '#8B5CF6', label: 'Key Argument', icon: 'lightbulb.fill' },
    evidence: { color: '#10B981', label: 'Evidence', icon: 'chart.bar.fill' },
    turning_point: { color: '#F59E0B', label: 'Turning Point', icon: 'star.fill' },
    conclusion: { color: '#EF4444', label: 'Conclusion', icon: 'flag.checkered' }
  }

  // Generate the S-curve journey path (horizontal, like customer journey map)
  const generateJourneyPath = (count: number, containerWidth: number) => {
    // Phase widths
    const phaseWidth = containerWidth / count
    const pathHeight = 300 // Height of the S-curve area
    const topY = 80
    const bottomY = pathHeight - 40
    const midY = (topY + bottomY) / 2

    const nodes: { x: number; y: number; phase: number }[] = []
    let path = ''

    // We'll create a snake pattern that goes up and down
    // Pattern: start top-left, go down, then up, then down...
    for (let i = 0; i < count; i++) {
      const phaseCenter = phaseWidth * i + phaseWidth / 2

      // Determine vertical position based on pattern
      // Each phase alternates: top -> bottom -> top -> bottom
      let y: number
      if (i % 2 === 0) {
        y = topY
      } else {
        y = bottomY
      }

      nodes.push({ x: phaseCenter, y, phase: i })

      if (i === 0) {
        path = `M ${phaseCenter} ${y}`
      } else {
        const prevNode = nodes[i - 1]
        // Create S-curve between nodes
        const midX = (prevNode.x + phaseCenter) / 2
        path += ` C ${midX} ${prevNode.y}, ${midX} ${y}, ${phaseCenter} ${y}`
      }
    }

    return { path, nodes, pathHeight }
  }

  // Calculate dimensions based on touchpoint count
  const containerWidth = $derived(Math.max(900, displayTouchpoints.length * 220))
  const journey = $derived(generateJourneyPath(displayTouchpoints.length, containerWidth))

  const handleTouchpointClick = (index: number) => {
    selectedIndex = index
  }

  const handleCloseDetail = () => {
    selectedIndex = null
  }

  const handleRead = () => {
    if (selectedTouchpoint) {
      onread?.(selectedTouchpoint.chapterIndex)
      selectedIndex = null
      onclose?.()
    }
  }

  const handleClose = () => {
    selectedIndex = null
    onclose?.()
  }

  onMount(() => {
    requestAnimationFrame(() => {
      mounted = true
    })
  })
</script>

{#if open}
  <div class="journey-full" transition:fade={{ duration: 200 }} role="dialog" aria-modal="true">
    <!-- Backdrop -->
    <div class="backdrop" onclick={handleClose}></div>

    <!-- Main container -->
    <div class="container" transition:fly={{ y: 40, duration: 400, easing: cubicOut }}>
      <!-- Header -->
      <header class="header">
        <button class="close-btn" onclick={handleClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M15 5L5 15M5 5L15 15"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </button>

        <div class="title-area">
          <h1>Socratic Discourse</h1>
          <p class="subtitle">{documentTitle}</p>
        </div>

        <div class="badge">
          <span class="badge-count">{displayTouchpoints.length}</span>
          <span class="badge-label">touchpoints</span>
        </div>
      </header>

      <!-- Journey Map Area -->
      <div class="journey-area">
        <!-- Phase Headers (Chevrons) -->
        <div class="phase-headers" style="width: {containerWidth}px">
          {#each displayTouchpoints as tp, i}
            {@const config = phaseConfig[tp.type]}
            {#if mounted}
              <div
                class="phase-chevron"
                class:first={i === 0}
                class:last={i === displayTouchpoints.length - 1}
                style="
                  --color: {config.color};
                  --delay: {i * 80}ms;
                  width: {containerWidth / displayTouchpoints.length}px;
                "
              >
                <span class="phase-label">{config.label}</span>
              </div>
            {/if}
          {/each}
        </div>

        <!-- S-Curve Journey Path -->
        <div
          class="journey-canvas"
          style="width: {containerWidth}px; height: {journey.pathHeight}px"
        >
          <svg
            width={containerWidth}
            height={journey.pathHeight}
            viewBox="0 0 {containerWidth} {journey.pathHeight}"
            fill="none"
          >
            <defs>
              <!-- Gradient following the path -->
              <linearGradient id="journeyGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                {#each displayTouchpoints as tp, i}
                  {@const config = phaseConfig[tp.type]}
                  <stop
                    offset="{(i / (displayTouchpoints.length - 1)) * 100}%"
                    stop-color={config.color}
                  />
                {/each}
              </linearGradient>

              <!-- Glow filter -->
              <filter id="pathGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <!-- Path glow -->
            {#if mounted}
              <path
                d={journey.path}
                fill="none"
                stroke="url(#journeyGradient)"
                stroke-width="8"
                stroke-linecap="round"
                stroke-dasharray="12 8"
                opacity="0.2"
                class="path-glow"
              />

              <!-- Main dashed path -->
              <path
                d={journey.path}
                fill="none"
                stroke="url(#journeyGradient)"
                stroke-width="4"
                stroke-linecap="round"
                stroke-dasharray="12 8"
                class="path-main"
              />
            {/if}

            <!-- Touchpoint Nodes -->
            {#each journey.nodes as node, i}
              {@const tp = displayTouchpoints[i]}
              {@const config = phaseConfig[tp.type]}
              {@const isSelected = selectedIndex === i}
              {#if mounted}
                <g
                  class="touchpoint"
                  class:selected={isSelected}
                  style="--delay: {i * 100}ms; --color: {config.color}"
                  transform="translate({node.x}, {node.y})"
                >
                  <!-- Click target -->
                  <circle
                    r="50"
                    fill="transparent"
                    class="click-target"
                    onclick={() => handleTouchpointClick(i)}
                    role="button"
                    tabindex="0"
                  />

                  <!-- Outer pulse ring -->
                  <circle
                    r="28"
                    fill="none"
                    stroke={config.color}
                    stroke-width="2"
                    opacity="0.25"
                    class="pulse-ring"
                  />

                  <!-- Node background -->
                  <circle
                    r="20"
                    fill="#0f172a"
                    stroke={config.color}
                    stroke-width="3"
                    class="node-bg"
                  />

                  <!-- Node fill -->
                  <circle
                    r="12"
                    fill={config.color}
                    stroke="white"
                    stroke-width="2"
                    class="node-fill"
                  />

                  <!-- Inner highlight -->
                  <circle r="4" fill="white" opacity="0.7" class="node-highlight" />
                </g>

                <!-- Label below/above node -->
                <foreignObject
                  x={node.x - 100}
                  y={node.y + (i % 2 === 0 ? 35 : -85)}
                  width="200"
                  height="50"
                  class="node-label-container"
                  style="--delay: {i * 100 + 50}ms"
                >
                  <button
                    class="node-label"
                    class:above={i % 2 !== 0}
                    onclick={() => handleTouchpointClick(i)}
                  >
                    <span class="label-title">{tp.title}</span>
                  </button>
                </foreignObject>
              {/if}
            {/each}
          </svg>
        </div>
      </div>

      <!-- Footer -->
      <footer class="footer">
        <p class="hint">Click any touchpoint to explore its content</p>
      </footer>
    </div>

    <!-- Detail Panel -->
    {#if selectedTouchpoint}
      {@const config = phaseConfig[selectedTouchpoint.type]}
      <div
        class="detail-panel"
        transition:fly={{ x: 400, duration: 350, easing: cubicOut }}
        style="--accent: {config.color}"
      >
        <header class="panel-header">
          <button class="panel-back" onclick={handleCloseDetail}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M12 4L6 10L12 16"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
            <span>Back</span>
          </button>

          <div class="panel-type">
            <Icon name={config.icon} size="0.875rem" />
            <span>{config.label}</span>
          </div>
        </header>

        <div class="panel-content">
          <div class="panel-step">{(selectedIndex ?? 0) + 1} of {displayTouchpoints.length}</div>
          <h2 class="panel-title">{selectedTouchpoint.title}</h2>
          <p class="panel-summary">{selectedTouchpoint.summary}</p>
        </div>

        <footer class="panel-actions">
          <button class="action-primary" onclick={handleRead}>
            <Icon name="book.fill" size="1.125rem" />
            <span>Read this section</span>
          </button>

          <div class="action-row">
            <button class="action-secondary" disabled>
              <Icon name="bubble.left.fill" size="1rem" />
              <span>Talk</span>
            </button>
            <button class="action-secondary" disabled>
              <Icon name="photo.fill" size="1rem" />
              <span>Visualize</span>
            </button>
            <button class="action-secondary" disabled>
              <Icon name="questionmark.circle.fill" size="1rem" />
              <span>Quiz</span>
            </button>
          </div>
        </footer>
      </div>
    {/if}
  </div>
{/if}

<style lang="scss">
  .journey-full {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(20px);
  }

  .container {
    position: relative;
    width: calc(100% - 2rem);
    height: calc(100% - 2rem);
    max-width: 1400px;
    max-height: 700px;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  // Header
  .header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(0, 0, 0, 0.2);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: white;
    }
  }

  .title-area {
    flex: 1;

    h1 {
      font-size: 1.25rem;
      font-weight: 700;
      color: white;
      margin: 0;
    }

    .subtitle {
      font-size: 0.8125rem;
      color: rgba(255, 255, 255, 0.5);
      margin: 0.125rem 0 0;
    }
  }

  .badge {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
  }

  .badge-count {
    font-size: 1.125rem;
    font-weight: 700;
    color: white;
  }

  .badge-label {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.5);
  }

  // Journey Area
  .journey-area {
    flex: 1;
    min-height: 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0 2rem 1rem;

    &::-webkit-scrollbar {
      height: 6px;
    }

    &::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.03);
      border-radius: 3px;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 3px;
    }
  }

  // Phase Headers (Chevrons)
  .phase-headers {
    display: flex;
    margin-bottom: 1rem;
    padding-top: 1rem;
  }

  .phase-chevron {
    position: relative;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color);
    opacity: 0;
    animation: chevronAppear 0.4s ease-out forwards;
    animation-delay: var(--delay);

    // Chevron shape with clip-path
    clip-path: polygon(
      0 0,
      calc(100% - 12px) 0,
      100% 50%,
      calc(100% - 12px) 100%,
      0 100%,
      12px 50%
    );

    &.first {
      clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%);
      border-radius: 6px 0 0 6px;
    }

    &.last {
      clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 12px 50%);
      border-radius: 0 6px 6px 0;
    }

    .phase-label {
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: white;
      padding: 0 1.5rem;
      white-space: nowrap;
    }
  }

  @keyframes chevronAppear {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  // Journey Canvas
  .journey-canvas {
    position: relative;
  }

  // Path animations
  .path-main {
    stroke-dashoffset: 2000;
    animation: drawPath 2s ease-out forwards;
    animation-delay: 0.3s;
  }

  .path-glow {
    stroke-dashoffset: 2000;
    animation: drawPath 2s ease-out forwards;
    animation-delay: 0.2s;
  }

  @keyframes drawPath {
    to {
      stroke-dashoffset: 0;
    }
  }

  // Touchpoint nodes
  .touchpoint {
    cursor: pointer;
    /* opacity: 0; */
    /* animation: nodeAppear 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; */
    /* animation-delay: calc(0.5s + var(--delay)); */

    .click-target {
      cursor: pointer;
    }

    &:hover,
    &.selected {
      .pulse-ring {
        animation: pulse 1.5s ease-out infinite;
      }

      .node-bg {
        r: 24;
        stroke-width: 4;
      }

      .node-fill {
        r: 15;
      }
    }

    &.selected {
      .node-bg {
        fill: var(--color);
        fill-opacity: 0.2;
      }
    }
  }

  @keyframes nodeAppear {
    from {
      opacity: 0;
      transform: scale(0);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes pulse {
    0% {
      r: 28;
      opacity: 0.25;
    }
    100% {
      r: 45;
      opacity: 0;
    }
  }

  .pulse-ring,
  .node-bg,
  .node-fill {
    transition: all 0.3s ease;
  }

  // Node labels
  .node-label-container {
    opacity: 0;
    animation: labelAppear 0.4s ease-out forwards;
    animation-delay: calc(0.6s + var(--delay));
    overflow: visible;
  }

  @keyframes labelAppear {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .node-label {
    display: block;
    width: 100%;
    background: none;
    border: none;
    padding: 0.5rem;
    cursor: pointer;
    text-align: center;

    &.above {
      .label-title {
        // Labels above nodes
      }
    }

    .label-title {
      font-size: 0.8125rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.85);
      line-height: 1.3;
      display: block;
    }

    &:hover .label-title {
      color: white;
    }
  }

  // Footer
  .footer {
    flex-shrink: 0;
    padding: 1rem;
    text-align: center;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(0, 0, 0, 0.2);

    .hint {
      font-size: 0.8125rem;
      color: rgba(255, 255, 255, 0.4);
      margin: 0;
    }
  }

  // Detail Panel
  .detail-panel {
    position: absolute;
    top: 1rem;
    right: 1rem;
    bottom: 1rem;
    width: 380px;
    max-width: calc(100% - 2rem);
    display: flex;
    flex-direction: column;
    background: linear-gradient(165deg, #0f172a 0%, #1e293b 100%);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: -20px 0 60px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(0, 0, 0, 0.2);
  }

  .panel-back {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: white;
    }
  }

  .panel-type {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent);
  }

  .panel-content {
    flex: 1;
    padding: 1.5rem 1.25rem;
    overflow-y: auto;
  }

  .panel-step {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent);
    margin-bottom: 0.5rem;
  }

  .panel-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: white;
    line-height: 1.35;
    margin: 0 0 1rem;
  }

  .panel-summary {
    font-size: 0.9375rem;
    color: rgba(255, 255, 255, 0.6);
    line-height: 1.65;
    margin: 0;
  }

  .panel-actions {
    padding: 1.25rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(0, 0, 0, 0.2);
  }

  .action-primary {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.875rem;
    background: var(--accent);
    border: none;
    border-radius: 10px;
    color: white;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      filter: brightness(1.1);
    }
  }

  .action-row {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .action-secondary {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.625rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.4);
    font-size: 0.6875rem;
    font-weight: 500;
    cursor: not-allowed;
    opacity: 0.5;
  }
</style>
