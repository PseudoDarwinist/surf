/**
 * Content Sanitizer for Library Documents
 *
 * Cleans converted markdown of common artifacts from PDF/EPUB conversion
 * and provides chapter splitting functionality.
 */

/**
 * Clean converted markdown of common conversion artifacts
 */
export function sanitizeMarkdown(markdown: string): string {
  return (
    markdown
      // Remove standalone page numbers (lines with just numbers)
      .replace(/^\s*\d+\s*$/gm, '')
      // Remove "Page X of Y" patterns
      .replace(/page\s+\d+\s+(of\s+\d+)?/gi, '')
      // Remove "X |" left-aligned page numbers
      .replace(/^\s*\d+\s*\|\s*/gm, '')
      // Remove reference numbers [1], [2], etc. but keep markdown links
      .replace(/(?<!\])\[\d+\](?!\()/g, '')
      // Remove orphan bullets (lines with just bullet points)
      .replace(/^\s*[-•]\s*$/gm, '')
      // Remove double-space lines followed by page numbers
      .replace(/\n\s*\n\s*\d+\s*\n/g, '\n\n')
      // Remove "Table of Contents" type headers if they precede ToC content
      // (this is handled more precisely in isTableOfContentsSection)
      // Clean excessive whitespace
      .replace(/\n{4,}/g, '\n\n\n')
      // Remove trailing whitespace on lines
      .replace(/[ \t]+$/gm, '')
      .trim()
  )
}

/**
 * Strip page number from end of chapter title
 * e.g., "Chapter 1 Introduction 25" -> "Chapter 1 Introduction"
 */
export function stripPageNumber(title: string): string {
  return title
    .replace(/\s+\d+\s*$/, '')
    .replace(/\s*\.\s*\.\s*\.\s*\d+\s*$/, '') // Remove "... 25" patterns
    .trim()
}

/**
 * Detect if a section looks like a Table of Contents
 * ToC sections have many short lines ending with page numbers
 */
export function isTableOfContentsSection(text: string): boolean {
  const lines = text.split('\n').filter((line) => line.trim().length > 0)

  if (lines.length < 3) return false

  // Count lines that look like ToC entries (short with trailing numbers)
  const tocPatternLines = lines.filter((line) => {
    const trimmed = line.trim()
    // ToC entries are typically: short text followed by page number
    // e.g., "Chapter 1 Introduction.....25" or "Chapter 1 Introduction 25"
    if (trimmed.length > 80) return false
    if (/\s\d+\s*$/.test(trimmed)) return true
    if (/\.{2,}\s*\d+\s*$/.test(trimmed)) return true // Dotted leaders
    return false
  })

  // If more than 50% of lines match ToC pattern, it's likely a ToC
  return tocPatternLines.length > lines.length * 0.5
}

/**
 * Chapter data structure (exported for use by other modules)
 */
export interface ChapterData {
  id: string
  title: string
  level: number
  markdown: string
  imageResourceIds: string[]
  startPosition: number
  chunkStartIndex: number
}

/**
 * Split markdown into chapters by heading structure
 *
 * This function identifies chapter boundaries using heading patterns and
 * filters out Table of Contents sections to provide clean chapter content.
 */
export function splitIntoChapters(markdown: string): ChapterData[] {
  const chapters: ChapterData[] = []

  // Split by H2 headings (most common chapter level)
  // Use lookbehind to keep the heading with the content
  const sections = markdown.split(/(?=^## )/m)

  let startPosition = 0

  for (const section of sections) {
    const lines = section.split('\n')

    // Skip if this looks like a ToC section
    if (isTableOfContentsSection(section)) {
      startPosition += section.length + 1
      continue
    }

    // Try to extract heading title
    const titleMatch = section.match(/^##\s+(.+)$/m)
    if (!titleMatch) {
      // Check for H1 if this is the first section (book title, intro)
      const h1Match = section.match(/^#\s+(.+)$/m)
      if (h1Match && chapters.length === 0) {
        chapters.push({
          id: `chapter-${chapters.length}`,
          title: stripPageNumber(h1Match[1]),
          level: 1,
          markdown: sanitizeMarkdown(section),
          imageResourceIds: extractImageResourceIds(section),
          startPosition,
          chunkStartIndex: 0 // Will be computed by caller
        })
      }
      startPosition += section.length + 1
      continue
    }

    const title = stripPageNumber(titleMatch[1])

    // Skip very short titles that are likely ToC remnants
    if (title.length < 2) {
      startPosition += section.length + 1
      continue
    }

    chapters.push({
      id: `chapter-${chapters.length}`,
      title,
      level: 2,
      markdown: sanitizeMarkdown(section),
      imageResourceIds: extractImageResourceIds(section),
      startPosition,
      chunkStartIndex: 0 // Will be computed by caller
    })

    startPosition += section.length + 1
  }

  return chapters
}

/**
 * Extract image resource IDs from markdown content
 * Looks for surf:// protocol references to image resources
 */
export function extractImageResourceIds(markdown: string): string[] {
  const ids: string[] = []

  // Match surf://resource/ID patterns
  const surfPattern = /surf:\/\/(?:surf\/)?resource\/([a-zA-Z0-9-]+)/g
  let match
  while ((match = surfPattern.exec(markdown)) !== null) {
    ids.push(match[1])
  }

  return ids
}

/**
 * Extract figure captions from markdown content
 * Looks for patterns like "FIGURE 1.2 Description..." or "Figure 1: Description..."
 */
export function extractFigureCaptions(markdown: string): Map<string, string> {
  const captions = new Map<string, string>()

  // Common figure caption patterns
  const patterns = [
    /(?:FIGURE|Figure)\s+([\d.]+)[:\s]+([^\n]+)/g,
    /(?:Fig\.?)\s+([\d.]+)[:\s]+([^\n]+)/gi,
    /\*\*(?:Figure|FIGURE)\s+([\d.]+)\*\*[:\s]+([^\n]+)/g
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(markdown)) !== null) {
      const figureNumber = match[1]
      const caption = match[2].trim()
      captions.set(figureNumber, caption)
    }
  }

  return captions
}

/**
 * Clean up markdown that came from MarkItDown for display
 * This is called after splitting into chapters for final polish
 */
export function polishChapterContent(markdown: string): string {
  return (
    markdown
      // Ensure proper spacing after headings
      .replace(/^(#{1,6}\s+[^\n]+)\n(?!\n)/gm, '$1\n\n')
      // Fix broken list items (common in PDF conversion)
      .replace(/^\s*[-•]\s*\n\s*([^\n]+)/gm, '- $1')
      // Normalize bullet points
      .replace(/^[•·]\s*/gm, '- ')
      // Clean up excessive blank lines
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}
