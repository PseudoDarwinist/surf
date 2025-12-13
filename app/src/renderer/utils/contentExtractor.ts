/**
 * Content Extraction Utilities
 * Extract text/content from a screen region by querying the DOM
 */

/**
 * Extract text from DOM elements within a bounding box
 */
export function extractDOMText(bounds: DOMRect): string {
  const elements = document.elementsFromPoint(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2
  )

  // Collect text from elements within bounds
  const textParts: string[] = []
  const visited = new Set<Element>()

  for (const element of elements) {
    if (visited.has(element)) continue
    visited.add(element)

    // Skip script, style, and other non-content elements
    const tagName = element.tagName.toLowerCase()
    if (['script', 'style', 'meta', 'link', 'noscript'].includes(tagName)) {
      continue
    }

    // Get element bounds
    const rect = element.getBoundingClientRect()

    // Check if element is within or overlaps with our bounds
    if (rectsOverlap(rect, bounds)) {
      const text = extractTextFromElement(element, bounds)
      if (text.trim()) {
        textParts.push(text.trim())
      }
    }
  }

  // Also try to get all text nodes within the bounds
  const allTextInBounds = getTextNodesInBounds(bounds)
  if (allTextInBounds && !textParts.includes(allTextInBounds)) {
    textParts.unshift(allTextInBounds)
  }

  // Return unique text, prioritizing shorter/more specific content
  const uniqueTexts = [...new Set(textParts)]
  return uniqueTexts.slice(0, 3).join('\n\n')
}

/**
 * Extract text from a single element, considering bounds
 */
function extractTextFromElement(element: Element, bounds: DOMRect): string {
  // For text-heavy elements, get innerText
  const textContent = (element as HTMLElement).innerText || element.textContent || ''

  // If element is fully within bounds, return all text
  const rect = element.getBoundingClientRect()
  if (isRectFullyInside(rect, bounds)) {
    return textContent.substring(0, 500) // Limit to 500 chars
  }

  // Otherwise, try to get just the overlapping portion
  // This is approximate - real implementation would use Range API
  return textContent.substring(0, 200)
}

/**
 * Get all text nodes that are within the given bounds
 */
function getTextNodesInBounds(bounds: DOMRect): string {
  const texts: string[] = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null)

  let node: Node | null
  while ((node = walker.nextNode())) {
    const range = document.createRange()
    range.selectNodeContents(node)
    const rects = range.getClientRects()

    for (const rect of rects) {
      if (rectsOverlap(rect, bounds)) {
        const text = node.textContent?.trim()
        if (text && text.length > 2) {
          texts.push(text)
        }
        break
      }
    }
  }

  return texts.join(' ').substring(0, 500)
}

/**
 * Check if two rectangles overlap
 */
function rectsOverlap(rect1: DOMRect, rect2: DOMRect): boolean {
  return !(
    rect1.right < rect2.left ||
    rect1.left > rect2.right ||
    rect1.bottom < rect2.top ||
    rect1.top > rect2.bottom
  )
}

/**
 * Check if rect1 is fully inside rect2
 */
function isRectFullyInside(rect1: DOMRect, rect2: DOMRect): boolean {
  return (
    rect1.left >= rect2.left &&
    rect1.right <= rect2.right &&
    rect1.top >= rect2.top &&
    rect1.bottom <= rect2.bottom
  )
}

/**
 * Get a title/term from the extracted content
 * Returns the first meaningful phrase or word
 */
export function extractTitle(text: string): string {
  // Try to find a standalone term (single word or short phrase)
  const lines = text.split('\n').filter((l) => l.trim())

  if (lines.length > 0) {
    const firstLine = lines[0].trim()

    // If first line is short, use it as title
    if (firstLine.length < 50) {
      return firstLine
    }

    // Otherwise, extract first few words
    const words = firstLine.split(' ').slice(0, 5)
    return words.join(' ') + (words.length < firstLine.split(' ').length ? '...' : '')
  }

  return 'Selected Content'
}
