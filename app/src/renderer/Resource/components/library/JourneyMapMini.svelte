<script lang="ts">
  import { onMount } from 'svelte'

  interface Touchpoint {
    id: string
    title: string
    type: 'intro' | 'argument' | 'evidence' | 'turning_point' | 'conclusion'
  }

  interface Props {
    touchpoints?: Touchpoint[]
    onopen?: () => void
  }

  let { touchpoints = [], onopen }: Props = $props()

  const mockTouchpoints: Touchpoint[] = [
    { id: '1', title: 'Introduction', type: 'intro' },
    { id: '2', title: 'Key Concept', type: 'argument' },
    { id: '3', title: 'Evidence', type: 'evidence' },
    { id: '4', title: 'Analysis', type: 'turning_point' },
    { id: '5', title: 'Conclusion', type: 'conclusion' }
  ]

  const displayTouchpoints = $derived(touchpoints.length > 0 ? touchpoints : mockTouchpoints)

  let mounted = $state(false)
  let hovered = $state(false)

  // Vibrant colors for the phases
  const typeColors: Record<string, string> = {
    intro: '#60A5FA', // Blue
    argument: '#34D399', // Emerald/Green
    evidence: '#A3E635', // Lime
    turning_point: '#FBBF24', // Amber
    conclusion: '#F87171' // Red
  }

  // Generate VERTICAL wave path
  const generateVerticalWave = (count: number, width: number, height: number) => {
    const paddingY = 40
    const paddingX = 40 // Reduced padding to allow wider swing
    const effectiveHeight = height - paddingY * 2

    // Wave parameters
    const amplitude = (width - paddingX * 2) / 2
    const centerX = width / 2

    const nodes: { x: number; y: number }[] = []
    let path = ''

    // We want to generate a smooth S-curve going down
    // Use more segments for smoother curve
    const steps = 50
    const stepY = effectiveHeight / steps

    let pathD = ''

    // Generate the path points
    for (let i = 0; i <= steps; i++) {
      const y = paddingY + i * stepY
      // Cosine wave for the S-shape: Starts at left (or right), swings
      // freq needs to align with number of touchpoints roughly, but visual appeal comes first.
      // 1.5 cycles looks good for a tall card (Left -> Right -> Left -> Right)
      const progress = i / steps
      const freq = 3.5 * Math.PI // 1.75 cycles
      const x = centerX + Math.cos(progress * freq + Math.PI) * amplitude * 0.9

      if (i === 0) {
        pathD = `M ${x} ${y}`
      } else {
        pathD += ` L ${x} ${y}`
      }
    }

    // Now calculate exact node positions on this conceptual curve
    // We want them distributed evenly along the Y axis
    for (let i = 0; i < count; i++) {
      const y = paddingY + (effectiveHeight / (count - 1)) * i

      // Calculate corresponding X based on the same formula
      const progress = i / (count - 1)
      const freq = 3.5 * Math.PI
      const x = centerX + Math.cos(progress * freq + Math.PI) * amplitude * 0.9

      nodes.push({ x, y })
    }

    return { path: pathD, nodes }
  }

  // Refined smooth Curve generator using Cubic Bezier for better quality than straight lines
  const generateSmoothVerticalPath = (count: number, width: number, height: number) => {
    const paddingTop = 40
    const paddingBottom = 40
    const availableHeight = height - paddingTop - paddingBottom
    const amplitude = (width - 60) / 2
    const centerX = width / 2

    const nodes: { x: number; y: number }[] = []

    // Calculate nodes positions
    for (let i = 0; i < count; i++) {
      const progress = i / (count - 1)
      const y = paddingTop + progress * availableHeight

      // Alternating Swing: Left -> Right -> Left
      // We use Math.sin.
      // Phase shift: we want to start top-left ish? Or Center?
      // Let's mirror the reference: Top-Leftish -> Right -> Left ...
      // Sin(0) = 0 (Check center). Cos(PI) = -1 (Left).
      // Let's use Cosine to start on an edge.
      // Cycles: We want roughly 2 full swings for 5 items?
      const cycles = 1.0 // Full Sine wave (0 to 2PI)
      const theta = progress * Math.PI * 2.5 + Math.PI // Start at PI (Left)

      const x = centerX + Math.cos(theta) * amplitude
      nodes.push({ x, y })
    }

    // Generate smooth path through nodes
    // Simple Catmull-Rom or just Bezier connecting points?
    // Since we know the analytic curve (Cos), we can just sample it
    let path = `M ${nodes[0].x} ${nodes[0].y}`

    // Sample intermediate points for smoothness
    const samples = 100
    for (let i = 1; i <= samples; i++) {
      const progress = i / samples
      const y = paddingTop + progress * availableHeight
      const theta = progress * Math.PI * 2.5 + Math.PI
      const x = centerX + Math.cos(theta) * amplitude
      path += ` L ${x} ${y}`
      // Note: L is fine if samples are high enough.
      // For true SVG curve we'd calculate control points but dense line segments work for visual effects too and are easier to map gradient to if needed (though SVG stroke supports gradient along path usually via other means, but standard gradient is linear in space).
      // Actually, let's stick to a standard path data for cleaner rendering
    }

    // Let's try to make a proper Bezier string for "Standard" look
    // Actually, standard `C` curves between points usually look best if control points are vertical.
    // But for a continuous S-wave, sampling is robust.

    return { path, nodes }
  }

  const journey = $derived(generateSmoothVerticalPath(displayTouchpoints.length, 200, 280))

  // Gradient stops: Blue (Top) -> Green -> Yellow -> Red (Bottom)
  // We can just use the type colors of the nodes
  const gradientStops = $derived(
    displayTouchpoints.map((tp, i) => ({
      offset: (i / (displayTouchpoints.length - 1)) * 100,
      color: typeColors[tp.type] || '#ccc'
    }))
  )

  onMount(() => {
    requestAnimationFrame(() => {
      mounted = true
    })
  })

  const handleClick = () => {
    onopen?.()
  }
</script>

<button
  class="journey-mini"
  class:hovered
  onclick={handleClick}
  onmouseenter={() => (hovered = true)}
  onmouseleave={() => (hovered = false)}
  aria-label="Open Journey Map"
>
  <div class="card">
    <svg width="200" height="280" viewBox="0 0 200 280" fill="none">
      <defs>
        <linearGradient id="journeyGradientVert" x1="0%" y1="0%" x2="0%" y2="100%">
          {#each gradientStops as stop}
            <stop offset="{stop.offset}%" stop-color={stop.color} />
          {/each}
        </linearGradient>

        <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood flood-color="white" flood-opacity="0.2" result="glowColor" />
          <feComposite in="glowColor" in2="blur" operator="in" result="softGlow" />
          <feMerge>
            <feMergeNode in="softGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- Subtly darker background pattern or grid could go here -->

      <!-- Path -->
      {#if mounted}
        <!-- Glow backing -->
        <path
          d={journey.path}
          fill="none"
          stroke="url(#journeyGradientVert)"
          stroke-width="6"
          stroke-linecap="round"
          stroke-opacity="0.15"
          filter="blur(4px)"
          class="path-glow"
        />

        <!-- Main Dashed Path -->
        <path
          d={journey.path}
          fill="none"
          stroke="url(#journeyGradientVert)"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-dasharray="8 8"
          class="path-main"
        />
      {/if}

      <!-- Touchpoint Nodes -->
      {#each journey.nodes as node, i}
        {@const tp = displayTouchpoints[i]}
        {@const color = typeColors[tp?.type || 'argument']}

        {#if mounted}
          <g class="node" style="--delay: {i * 100}ms" transform="translate({node.x}, {node.y})">
            <!-- Outer Ring (just stroke) -->
            <circle r="8" fill="none" stroke={color} stroke-width="1.5" stroke-opacity="0.3" />

            <!-- Solid Dot -->
            <circle r="6" fill={color} stroke="white" stroke-width="1.5" class="node-dot" />
          </g>
        {/if}
      {/each}
    </svg>

    <!-- Top-left overlay icon or decoration? Optional. -->
  </div>

  <div class="label-container">
    <span class="title">Socratic Discourse</span>
    <span class="subtitle">{displayTouchpoints.length} touchpoints</span>
  </div>
</button>

<style lang="scss">
  .journey-mini {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);

    &:hover {
      transform: translateY(-4px);

      .card {
        box-shadow:
          0 20px 40px -4px rgba(0, 0, 0, 0.4),
          0 0 0 1px rgba(255, 255, 255, 0.15) inset;
        border-color: rgba(255, 255, 255, 0.2);
      }
    }
  }

  .card {
    position: relative;
    width: 200px;
    height: 280px;
    border-radius: 20px;
    background: linear-gradient(160deg, #111827 0%, #1f2937 100%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow:
      0 10px 25px -5px rgba(0, 0, 0, 0.3),
      0 0 0 1px rgba(255, 255, 255, 0.05) inset;
    overflow: hidden;
    transition: all 0.3s ease;
  }

  .path-main {
    stroke-dashoffset: 1000;
    animation: dashGrow 2s ease-out forwards;
  }

  .path-glow {
    stroke-dashoffset: 1000;
    animation: dashGrow 2s ease-out forwards;
  }

  @keyframes dashGrow {
    from {
      stroke-dashoffset: 1000;
    }
    to {
      stroke-dashoffset: 0;
    }
  }

  .node {
    opacity: 0;
    animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    animation-delay: var(--delay);
  }

  @keyframes popIn {
    from {
      opacity: 0;
      transform: scale(0);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .label-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: light-dark(#1f2937, #f3f4f6);
    letter-spacing: -0.01em;
  }

  .subtitle {
    font-size: 0.75rem;
    color: light-dark(#6b7280, #9ca3af);
    font-weight: 500;
  }
</style>
