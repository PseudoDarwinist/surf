import { MetadataExtractor } from '@deta/web-parser'
import type { WebMetadata } from '@deta/web-parser'

export type LinkMetadata = WebMetadata & {
  url: string
}

// Simple in-memory cache for metadata
const metadataCache = new Map<string, LinkMetadata>()

/**
 * Fetches link metadata using the existing MetadataExtractor from web-parser.
 * Results are cached to avoid duplicate requests.
 */
export async function fetchLinkMetadata(url: string): Promise<LinkMetadata | null> {
  // Check cache first
  if (metadataCache.has(url)) {
    console.log('[LinkPreview] Cache hit for:', url)
    return metadataCache.get(url)!
  }

  console.log('[LinkPreview] Fetching metadata for:', url)

  try {
    const parsedUrl = new URL(url)
    const extractor = new MetadataExtractor(parsedUrl)
    console.log('[LinkPreview] Calling extractRemote...')
    const metadata = await extractor.extractRemote()
    console.log('[LinkPreview] Got metadata:', metadata)

    const result: LinkMetadata = {
      ...metadata,
      url
    }

    // Cache the result
    metadataCache.set(url, result)

    return result
  } catch (error) {
    console.error('[LinkPreview] Failed to fetch link metadata:', error)
    return null
  }
}

/**
 * Clears the metadata cache (useful for testing or when needed)
 */
export function clearMetadataCache(): void {
  metadataCache.clear()
}
