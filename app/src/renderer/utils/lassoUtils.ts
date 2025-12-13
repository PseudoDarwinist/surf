/**
 * Lasso/Circle Gesture Detection Utilities
 */

export interface Point {
  x: number
  y: number
}

/**
 * Calculate distance between two points
 */
function distance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
}

/**
 * Check if a path forms a closed shape (circle/loop)
 * Returns true if the end point is close to the start point
 */
export function isClosedShape(points: Point[], threshold = 50): boolean {
  if (points.length < 10) return false

  const start = points[0]
  const end = points[points.length - 1]

  // Check if end is close to start
  const distToStart = distance(start, end)

  // Also check that the path covers enough area (not just a small scribble)
  const bounds = getBoundingBox(points)
  const minSize = 30 // Minimum 30px in both dimensions

  return distToStart < threshold && bounds.width > minSize && bounds.height > minSize
}

/**
 * Get bounding box of a set of points
 */
export function getBoundingBox(points: Point[]): DOMRect {
  if (points.length === 0) {
    return new DOMRect(0, 0, 0, 0)
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  return new DOMRect(minX, minY, maxX - minX, maxY - minY)
}

/**
 * Smooth a path using Douglas-Peucker algorithm
 * Reduces noise while preserving shape
 */
export function smoothPath(points: Point[], tolerance = 2): Point[] {
  if (points.length <= 2) return points

  // Find the point with the maximum distance from the line between first and last
  const first = points[0]
  const last = points[points.length - 1]

  let maxDist = 0
  let maxIndex = 0

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last)
    if (dist > maxDist) {
      maxDist = dist
      maxIndex = i
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDist > tolerance) {
    const left = smoothPath(points.slice(0, maxIndex + 1), tolerance)
    const right = smoothPath(points.slice(maxIndex), tolerance)

    // Combine results (remove duplicate point at maxIndex)
    return [...left.slice(0, -1), ...right]
  }

  // Return just the endpoints
  return [first, last]
}

/**
 * Calculate perpendicular distance from a point to a line
 */
function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y

  if (dx === 0 && dy === 0) {
    return distance(point, lineStart)
  }

  const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy)

  const closestX = lineStart.x + t * dx
  const closestY = lineStart.y + t * dy

  return distance(point, { x: closestX, y: closestY })
}

/**
 * Get the center point of a set of points
 */
export function getCenterPoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }

  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })

  return {
    x: sum.x / points.length,
    y: sum.y / points.length
  }
}
