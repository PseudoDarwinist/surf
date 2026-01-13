<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte'
  import { isClosedShape, getBoundingBox, smoothPath, type Point } from '../utils/lassoUtils'

  const dispatch = createEventDispatcher<{
    circleComplete: { bounds: DOMRect; points: Point[] }
    cancel: void
  }>()

  export let active = false

  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D | null = null
  let isDrawing = false
  let points: Point[] = []

  // Stroke style
  const STROKE_COLOR = '#6366f1'
  const STROKE_WIDTH = 3
  const STROKE_OPACITY = 0.8

  onMount(() => {
    if (canvas) {
      ctx = canvas.getContext('2d')
      resizeCanvas()
    }
  })

  function resizeCanvas() {
    if (canvas) {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
  }

  function startDrawing(e: MouseEvent) {
    if (!active || !ctx) return

    isDrawing = true
    points = [{ x: e.clientX, y: e.clientY }]

    // Start path
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.beginPath()
    ctx.moveTo(e.clientX, e.clientY)
    ctx.strokeStyle = STROKE_COLOR
    ctx.lineWidth = STROKE_WIDTH
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalAlpha = STROKE_OPACITY
  }

  function draw(e: MouseEvent) {
    if (!isDrawing || !ctx || !active) return

    const point = { x: e.clientX, y: e.clientY }
    points.push(point)

    // Draw smooth line
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
  }

  function endDrawing() {
    if (!isDrawing || !ctx) return

    isDrawing = false

    // Check if shape is closed (forms a circle/loop)
    if (points.length > 10) {
      const smoothedPoints = smoothPath(points)

      if (isClosedShape(smoothedPoints)) {
        // Get bounding box of the circled region
        const bounds = getBoundingBox(smoothedPoints)

        // Animate the shape closing
        animateClose(smoothedPoints, () => {
          dispatch('circleComplete', { bounds, points: smoothedPoints })
          clearCanvas()
        })
        return
      }
    }

    // Shape not closed, fade out
    fadeOutAndClear()
  }

  function animateClose(pts: Point[], onComplete: () => void) {
    if (!ctx) return

    // Draw a nice closing animation
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)

    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y)
    }
    ctx.closePath()

    // Fill with semi-transparent color
    ctx.fillStyle = 'rgba(99, 102, 241, 0.1)'
    ctx.fill()
    ctx.strokeStyle = STROKE_COLOR
    ctx.lineWidth = STROKE_WIDTH
    ctx.stroke()

    // Shrink animation
    setTimeout(onComplete, 300)
  }

  function fadeOutAndClear() {
    if (!ctx) return

    let opacity = STROKE_OPACITY
    const fadeInterval = setInterval(() => {
      opacity -= 0.1
      if (opacity <= 0) {
        clearInterval(fadeInterval)
        clearCanvas()
      } else {
        ctx!.clearRect(0, 0, canvas.width, canvas.height)
        ctx!.globalAlpha = opacity
        ctx!.beginPath()
        ctx!.moveTo(points[0].x, points[0].y)
        for (let i = 1; i < points.length; i++) {
          ctx!.lineTo(points[i].x, points[i].y)
        }
        ctx!.stroke()
      }
    }, 30)
  }

  function clearCanvas() {
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    points = []
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && active) {
      clearCanvas()
      dispatch('cancel')
    }
  }

  // Handle window resize
  function handleResize() {
    resizeCanvas()
  }
</script>

<svelte:window on:keydown={handleKeyDown} on:resize={handleResize} />

{#if active}
  <canvas
    bind:this={canvas}
    class="lasso-canvas"
    on:mousedown={startDrawing}
    on:mousemove={draw}
    on:mouseup={endDrawing}
    on:mouseleave={endDrawing}
  />
{/if}

<style>
  .lasso-canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9998;
    cursor: crosshair;
    pointer-events: auto;
  }
</style>
