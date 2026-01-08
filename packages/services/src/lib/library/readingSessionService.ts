import type {
  ReadingSession,
  DocumentChatHistory,
  DocumentChatMessage,
  LibraryDocumentMetadata,
  Chapter
} from '@deta/types'

/**
 * Service for managing reading sessions and chat history for library documents.
 * Persists data using resource tags in SFFS.
 */
export class ReadingSessionService {
  private resourceManager: any // ResourceManager type

  constructor(resourceManager: any) {
    this.resourceManager = resourceManager
  }

  /**
   * Save a reading session for a document
   */
  async saveSession(session: ReadingSession): Promise<void> {
    await this.resourceManager.updateResourceTag(
      session.documentId,
      'readingSession',
      JSON.stringify(session)
    )
  }

  /**
   * Get the reading session for a document
   */
  async getSession(documentId: string): Promise<ReadingSession | null> {
    const resource = await this.resourceManager.getResource(documentId)
    const tag = resource?.tags?.find((t: any) => t.name === 'readingSession')
    if (!tag) return null
    try {
      return JSON.parse(tag.value) as ReadingSession
    } catch {
      return null
    }
  }

  /**
   * Update reading progress
   */
  async updateProgress(
    documentId: string,
    currentChunkIndex: number,
    totalChunks: number,
    currentChapterIndex: number = 0
  ): Promise<void> {
    const progressPercent =
      totalChunks > 0 ? Math.round((currentChunkIndex / totalChunks) * 100) : 0

    const session: ReadingSession = {
      documentId,
      lastReadAt: new Date().toISOString(),
      currentChapterIndex,
      currentChunkIndex,
      totalChunks,
      progressPercent
    }

    await this.saveSession(session)
  }

  /**
   * Save chat history for a document
   */
  async saveChatHistory(history: DocumentChatHistory): Promise<void> {
    await this.resourceManager.updateResourceTag(
      history.documentId,
      'chatHistory',
      JSON.stringify(history)
    )
  }

  /**
   * Get chat history for a document
   */
  async getChatHistory(documentId: string): Promise<DocumentChatHistory | null> {
    const resource = await this.resourceManager.getResource(documentId)
    const tag = resource?.tags?.find((t: any) => t.name === 'chatHistory')
    if (!tag) return null
    try {
      return JSON.parse(tag.value) as DocumentChatHistory
    } catch {
      return null
    }
  }

  /**
   * Add a message to chat history
   */
  async addChatMessage(
    documentId: string,
    message: Omit<DocumentChatMessage, 'id' | 'timestamp'>
  ): Promise<void> {
    const existing = await this.getChatHistory(documentId)

    const newMessage: DocumentChatMessage = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...message
    }

    const history: DocumentChatHistory = {
      documentId,
      messages: [...(existing?.messages || []), newMessage],
      lastUpdatedAt: new Date().toISOString()
    }

    await this.saveChatHistory(history)
  }

  /**
   * Clear chat history for a document
   */
  async clearChatHistory(documentId: string): Promise<void> {
    await this.resourceManager.deleteResourceTag(documentId, 'chatHistory')
  }

  /**
   * Get library document metadata from resource
   */
  getLibraryMetadata(resource: any): LibraryDocumentMetadata | null {
    const tag = resource?.tags?.find((t: any) => t.name === 'libraryMetadata')
    if (!tag) return null
    try {
      return JSON.parse(tag.value) as LibraryDocumentMetadata
    } catch {
      return null
    }
  }

  /**
   * Update library document metadata
   */
  async updateLibraryMetadata(
    documentId: string,
    metadata: Partial<LibraryDocumentMetadata>
  ): Promise<void> {
    const resource = await this.resourceManager.getResource(documentId)
    const existing = this.getLibraryMetadata(resource) || ({} as LibraryDocumentMetadata)

    const updated: LibraryDocumentMetadata = {
      ...existing,
      ...metadata
    }

    await this.resourceManager.updateResourceTag(
      documentId,
      'libraryMetadata',
      JSON.stringify(updated)
    )
  }

  /**
   * Extract table of contents from markdown content
   */
  extractTableOfContents(markdown: string): Chapter[] {
    const chapters: Chapter[] = []
    const headingRegex = /^(#{1,6})\s+(.+)$/gm
    let match

    while ((match = headingRegex.exec(markdown)) !== null) {
      chapters.push({
        id: `chapter-${chapters.length}`,
        title: match[2].trim(),
        level: match[1].length,
        startPosition: match.index,
        chunkStartIndex: 0 // Will be calculated when content is chunked
      })
    }

    return chapters
  }

  /**
   * Calculate chunk start indices for chapters based on chunked content
   */
  calculateChapterChunkIndices(chapters: Chapter[], chunks: string[]): Chapter[] {
    let currentPosition = 0
    let chunkIndex = 0

    return chapters.map((chapter) => {
      // Find which chunk contains this chapter's start position
      while (chunkIndex < chunks.length - 1) {
        const chunkLength = chunks[chunkIndex].length
        if (currentPosition + chunkLength > chapter.startPosition) {
          break
        }
        currentPosition += chunkLength
        chunkIndex++
      }

      return {
        ...chapter,
        chunkStartIndex: chunkIndex
      }
    })
  }
}

// Factory function for creating the service
export function createReadingSessionService(resourceManager: any): ReadingSessionService {
  return new ReadingSessionService(resourceManager)
}
