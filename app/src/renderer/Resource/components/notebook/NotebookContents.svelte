<svelte:options runes={true} />

<script module lang="ts">
  export function attachLoadMore(node: HTMLElement, loadMoreFn: () => void) {
    const observerOptions = {
      root: null,
      rootMargin: '100px',
      threshold: 0.1
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadMoreFn()
        }
      })
    }, observerOptions)

    observer.observe(node)

    return {
      destroy() {
        observer.disconnect()
      }
    }
  }
</script>

<script lang="ts">
  import { Icon } from '@deta/icons'
  import { Notebook, useNotebookManager } from '@deta/services/notebooks'
  import {
    Button,
    contextMenu,
    NotebookCover,
    openDialog,
    ResourceLoader,
    SearchInput,
    SourceCard,
    SurfLoader
  } from '@deta/ui'
  import {
    handleNotebookClick,
    handleResourceClick,
    openResource
  } from '../../handlers/notebookOpenHandlers'
  import NotebookEditor from './NotebookEditor/NotebookEditor.svelte'
  import { conditionalArrayItem, SearchResourceTags, truncate, markdownToHtml } from '@deta/utils'
  import { type OpenTarget, type Option, ResourceTypes, SpaceEntryOrigin } from '@deta/types'
  import NotebookSidebarNoteName from './NotebookSidebarNoteName.svelte'
  import {
    useResourceManager,
    Resource,
    getResourceCtxItems,
    type ResourceSearchResult
  } from '@deta/services/resources'
  import { useMessagePortClient } from '@deta/services/messagePort'
  import { promptForFilesAndTurnIntoResources } from '@deta/services'
  import LibraryDropZone from './LibraryDropZone.svelte'
  import LibraryBookCard from './LibraryBookCard.svelte'
  import type { LibraryDocumentMetadata } from '@deta/types'

  let { notebookId }: { notebookId?: string } = $props()

  let isCustomizingNotebook = $state(undefined) as Notebook | undefined | null
  let isNewNotebook = $state(undefined) as Notebook | undefined | null

  let searchQuery = $state('')
  let categoryScrollContainer = $state<HTMLElement>()

  let notesLoadMoreTrigger = $state<HTMLElement | null>(null)
  let sourcesLoadMoreTrigger = $state<HTMLElement | null>(null)

  // on index page, collapse notes and sources by default only showing notebooks
  // on within a notebook, collapse only sources by default
  let collapsedCategories = $derived<Set<string>>(
    notebookId ? new Set(['sources']) : new Set(['notes', 'sources'])
  )

  const notebookManager = useNotebookManager()
  const resourceManager = useResourceManager()

  // TODO: have a sane way to manage `Drafts` in the notebook manager itself
  const notebooksList = $derived(
    (() => {
      const draftsNotebook = {
        id: 'drafts',
        nameValue: 'Drafts',
        colorValue: [
          ['#5d5d62', '5d5d62'],
          ['#2e2f34', '#2e2f34'],
          ['#efefef', '#efefef']
        ]
      }

      const filtered = notebookManager.sortedNotebooks
        .filter((e) => {
          if (!searchQuery) return true
          return e.nameValue.toLowerCase().includes(searchQuery.toLowerCase())
        })
        .sort((a, b) => (b.data.pinned === true) - (a.data.pinned === true))

      if (!searchQuery) {
        return [draftsNotebook, ...filtered]
      } else {
        if (draftsNotebook.nameValue.toLowerCase().includes(searchQuery.toLowerCase())) {
          return [draftsNotebook, ...filtered]
        }
        return filtered
      }
    })()
  )

  const handleCreateNote = () => {
    useMessagePortClient().createNote.send({ isNewTabPage: true })
  }

  const handleCreateNotebook = async () => {
    try {
      const notebook = await notebookManager.createNotebook(
        {
          name: 'Untitled Notebook'
        },
        true
      )
      isNewNotebook = notebook
    } catch (e) {
      console.error('Failed to create notebook', e)
    }
  }

  const handlePinNotebook = (notebookId: string) => {
    notebookManager.updateNotebookData(notebookId, { pinned: true })
  }
  const handleUnPinNotebook = (notebookId: string) => {
    notebookManager.updateNotebookData(notebookId, { pinned: false })
  }

  const handleDeleteNotebook = async (notebook: Notebook) => {
    const { closeType: confirmed } = await openDialog({
      title: `Delete <i>${truncate(notebook.nameValue, 26)}</i>`,
      message: `This can't be undone. <br>Your resources won't be deleted.`,
      actions: [
        { title: 'Cancel', type: 'reset' },
        { title: 'Delete', type: 'submit', kind: 'danger' }
      ]
    })
    if (!confirmed) return
    notebookManager.deleteNotebook(notebook.id, true)
  }

  const handleCancelNewNotebook = async (notebook: Notebook) => {
    notebookManager.deleteNotebook(notebook.id, true)
  }

  const onDeleteResource = async (resource: Resource) => {
    const { closeType: confirmed } = await openDialog({
      title: `Delete <i>${truncate(resource.metadata.name, 26)}</i>`,
      message: `This can't be undone.`,
      actions: [
        { title: 'Cancel', type: 'reset' },
        { title: 'Delete', type: 'submit', kind: 'danger' }
      ]
    })
    if (!confirmed) return
    notebookManager.deleteResourcesFromSurf(resource.id, true)
  }

  const handleAddToNotebook = (notebookId: string, resourceId: string) => {
    notebookManager.addResourcesToNotebook(
      notebookId,
      [resourceId],
      SpaceEntryOrigin.ManuallyAdded,
      true
    )
  }
  const handleRemoveFromNotebook = (notebookId: string, resourceId: string) => {
    notebookManager.removeResourcesFromNotebook(notebookId, [resourceId], true)
  }

  const handleUploadFiles = async () => {
    await promptForFilesAndTurnIntoResources(resourceManager, notebookId)
  }

  // Library document upload handler
  let isConvertingLibrary = $state(false)
  let libraryConversionProgress = $state<any>(null)

  const handleUploadLibraryDocument = async (files: File[]) => {
    if (files.length === 0) {
      // Trigger file picker
      // @ts-ignore
      const selectedFiles = await window.api.showOpenDialog({
        title: 'Add Documents to Library',
        buttonLabel: 'Add to Library',
        filters: [
          {
            name: 'Documents',
            extensions: ['pdf', 'epub', 'pptx', 'docx']
          }
        ],
        properties: ['openFile', 'multiSelections']
      })
      if (!selectedFiles || selectedFiles.length === 0) return

      // Process selected files - showOpenDialog returns { file, path, name, type } objects
      for (const item of selectedFiles) {
        // New format: item.path is the full path
        const filePath = item.path
        console.log('[Library] Selected file path:', filePath)

        if (filePath && typeof filePath === 'string') {
          await processLibraryFile(filePath)
        } else {
          console.error('[Library] Could not get file path from:', item)
        }
      }
    } else {
      // Process dropped files - Electron adds .path property to File objects
      for (const file of files) {
        const filePath = (file as any).path
        console.log('[Library] Dropped file path:', filePath, 'name:', file.name)

        if (filePath && typeof filePath === 'string') {
          await processLibraryFile(filePath)
        } else {
          console.error(
            '[Library] Dropped file has no path property. File:',
            file.name,
            'Type:',
            typeof file
          )
          // Show user-friendly error
          libraryConversionProgress = {
            stage: 'error',
            progress: 0,
            message: `Cannot get file path for ${file.name}. Try using the file picker instead.`
          }
          setTimeout(() => {
            libraryConversionProgress = null
          }, 3000)
        }
      }
    }
  }

  const processLibraryFile = async (filePath: string) => {
    try {
      isConvertingLibrary = true
      console.log('[Library] Processing file:', filePath)

      // Set up progress listener
      // @ts-ignore
      window.api?.onDocumentConvertProgress?.((progress: any) => {
        libraryConversionProgress = progress
        console.log('[Library] Conversion progress:', progress)
      })

      // Convert document (uses MarkItDown if available, falls back to Marker/pdf-parse)
      let markdown = ''
      let conversionMetadata: any = {}
      let extractedImages: any[] = []
      let figureCaptions: Record<string, string> = {}

      libraryConversionProgress = {
        stage: 'extracting',
        progress: 10,
        message: 'Converting document...'
      }

      try {
        // @ts-ignore - IPC call to main process (now uses MarkItDown first)
        const result = await window.api?.convertDocument?.(filePath)

        if (result && result.markdown) {
          markdown = result.markdown
          conversionMetadata = result.metadata || {}
          extractedImages = result.images || []
          figureCaptions = conversionMetadata.figureCaptions || {}

          console.log('[Library] Document conversion successful:', {
            method: result.method,
            markdownLength: markdown.length,
            title: conversionMetadata.title,
            imageCount: extractedImages.length,
            captionCount: Object.keys(figureCaptions).length
          })
        } else {
          throw new Error('Conversion returned no content')
        }
      } catch (conversionError: any) {
        console.error('[Library] Document conversion failed:', conversionError)
        libraryConversionProgress = {
          stage: 'error',
          progress: 0,
          message: conversionError?.message || 'Conversion failed'
        }

        // Create error placeholder
        const fileName = filePath.split('/').pop() || 'Untitled'
        markdown = `# ${fileName}\n\n> ⚠️ **Conversion failed**\n>\n> ${conversionError?.message || 'Unknown error'}\n\n*Original file: ${filePath}*`
      }

      // Process images in markdown - Docling embeds them as base64 inline
      // We need to extract base64 images and create SFFS resources for them
      libraryConversionProgress = {
        stage: 'converting',
        progress: 40,
        message: 'Processing embedded images...'
      }

      // Find all base64 image embeds in markdown: ![alt](data:image/png;base64,...)
      const base64ImageRegex = /!\[([^\]]*)\]\((data:image\/([^;]+);base64,([^)]+))\)/g
      let imageIndex = 0
      let match: RegExpExecArray | null

      // Collect all matches first (regex exec is stateful)
      const base64Matches: Array<{
        fullMatch: string
        alt: string
        dataUrl: string
        mimeType: string
        base64Data: string
      }> = []

      while ((match = base64ImageRegex.exec(markdown)) !== null) {
        base64Matches.push({
          fullMatch: match[0],
          alt: match[1],
          dataUrl: match[2],
          mimeType: `image/${match[3]}`,
          base64Data: match[4]
        })
      }

      console.log(`[Library] Found ${base64Matches.length} embedded base64 images in markdown`)

      // Process each base64 image and create SFFS resources
      for (const imgMatch of base64Matches) {
        try {
          // Convert base64 to blob
          const byteCharacters = atob(imgMatch.base64Data)
          const byteNumbers = new Array(byteCharacters.length)
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i)
          }
          const byteArray = new Uint8Array(byteNumbers)
          const blob = new Blob([byteArray], { type: imgMatch.mimeType })

          // Build descriptive name
          const imageName = imgMatch.alt || `Figure ${imageIndex + 1}`

          // Create resource for this image
          const imageResource = await resourceManager.createResource(imgMatch.mimeType, blob, {
            name: imageName,
            mimeType: imgMatch.mimeType
          })

          // Replace base64 data URL with surf:// URL in markdown
          const surfUrl = `surf://surf/resource/${imageResource.id}?raw=true`
          markdown = markdown.replace(imgMatch.dataUrl, surfUrl)

          console.log(`[Library] Created image resource ${imageIndex + 1}: ${imageResource.id}`)
          imageIndex++
        } catch (imgError) {
          console.warn('[Library] Failed to process embedded image:', imgError)
        }
      }

      // Also process any extracted images from files (fallback for non-embedded images)
      if (extractedImages.length > 0) {
        console.log(`[Library] Also processing ${extractedImages.length} extracted image files...`)

        for (const img of extractedImages) {
          if (img.source === 'inline' || !img.path) continue

          try {
            // @ts-ignore - IPC call to read file as base64
            const imageData = await window.api?.readFileAsBase64?.(img.path)

            if (imageData) {
              const ext = img.path.split('.').pop()?.toLowerCase() || 'png'
              const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`

              const byteCharacters = atob(imageData)
              const byteNumbers = new Array(byteCharacters.length)
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i)
              }
              const byteArray = new Uint8Array(byteNumbers)
              const blob = new Blob([byteArray], { type: mimeType })

              const imageName = img.caption
                ? `${img.figureNumber ? `Figure ${img.figureNumber}: ` : ''}${img.caption.substring(0, 50)}`
                : img.figureNumber
                  ? `Figure ${img.figureNumber}`
                  : `Image from page ${img.page || 'unknown'}`

              const imageResource = await resourceManager.createResource(mimeType, blob, {
                name: imageName,
                mimeType
              })

              // Replace file path references if any exist in markdown
              const surfUrl = `surf://surf/resource/${imageResource.id}?raw=true`
              const filename = img.path.split('/').pop() || ''
              if (filename) {
                const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                markdown = markdown.replace(
                  new RegExp(`\\]\\([^)]*${escapedFilename}\\)`, 'g'),
                  `](${surfUrl})`
                )
              }
            }
          } catch (imgError) {
            console.warn('[Library] Failed to process extracted image:', img.path, imgError)
          }
        }
      }

      console.log(`[Library] Processed ${imageIndex} inline images total`)

      // Extract filename for title
      const fileName = filePath.split('/').pop() || 'Untitled'
      const title = conversionMetadata.title || fileName.replace(/\.[^.]+$/, '')

      // Determine format from extension
      const ext = filePath.split('.').pop()?.toLowerCase() as 'pdf' | 'epub' | 'pptx' | 'docx'

      libraryConversionProgress = {
        stage: 'converting',
        progress: 60,
        message: 'Splitting into chapters...'
      }

      // Split markdown into chapters with per-chapter content
      // This is the key change for ChapterPal-style chapter isolation
      const tableOfContents: any[] = []

      try {
        // Detect which heading level to split on
        // First try H2 (most common chapter level), then H1, then H3
        const h1Count = (markdown.match(/^# [^\n]+$/gm) || []).length
        const h2Count = (markdown.match(/^## [^\n]+$/gm) || []).length
        const h3Count = (markdown.match(/^### [^\n]+$/gm) || []).length

        // Debug: Show first part of markdown and sample lines that look like headers
        console.log(`[Library] Markdown length: ${markdown.length}`)
        console.log(`[Library] First 500 chars of markdown:`, markdown.substring(0, 500))
        const potentialHeaders = markdown
          .split('\n')
          .filter(
            (line) =>
              line.trim().length > 0 &&
              line.trim().length < 100 &&
              (line.startsWith('#') ||
                /^[A-Z][A-Z\s]+$/.test(line.trim()) ||
                /^[IVX]+\./.test(line.trim()))
          )
          .slice(0, 20)
        console.log('[Library] Potential header lines:', potentialHeaders)

        console.log(`[Library] Heading counts: H1=${h1Count}, H2=${h2Count}, H3=${h3Count}`)

        // Choose appropriate split level
        // If many H2s, split on H2
        // If few/no H2s but many H1s, split on H1
        // If mostly H3 (like long books with sub-sections), split on H3
        let splitPattern: RegExp
        let headingPattern: RegExp
        let headingLevel: number

        if (h2Count >= 3) {
          splitPattern = /(?=^## )/m
          headingPattern = /^## (.+)$/m
          headingLevel = 2
          console.log('[Library] Splitting on H2 headings')
        } else if (h1Count >= 2) {
          splitPattern = /(?=^# )/m
          headingPattern = /^# (.+)$/m
          headingLevel = 1
          console.log('[Library] Splitting on H1 headings')
        } else if (h3Count >= 3) {
          splitPattern = /(?=^### )/m
          headingPattern = /^### (.+)$/m
          headingLevel = 3
          console.log('[Library] Splitting on H3 headings')
        } else {
          // Fallback: Try to find any headers or break on long empty lines
          console.log('[Library] No clear heading structure, using fallback')
          splitPattern = /(?=^#{1,3} )/m
          headingPattern = /^(#{1,3}) (.+)$/m
          headingLevel = 0 // Mixed
        }

        const sections = markdown.split(splitPattern)
        let startPosition = 0
        let chapterIndex = 0

        for (const section of sections) {
          // Skip very short sections (likely artifacts)
          if (section.trim().length < 50) {
            startPosition += section.length + 1
            continue
          }

          // Detect ToC sections (many short lines with page numbers)
          const lines = section.split('\n').filter((l) => l.trim().length > 0)
          const tocPatternLines = lines.filter((line) => {
            const trimmed = line.trim()
            if (trimmed.length > 80) return false
            return /\s\d+\s*$/.test(trimmed) || /\.{2,}\s*\d+\s*$/.test(trimmed)
          })
          const isToC = lines.length > 3 && tocPatternLines.length > lines.length * 0.5

          if (isToC) {
            console.log('[Library] Skipping ToC section')
            startPosition += section.length + 1
            continue
          }

          // Try to extract heading title
          let titleMatch: RegExpMatchArray | null = null
          let detectedLevel = headingLevel

          if (headingLevel === 0) {
            // Mixed mode - check for any heading
            const h1Match = section.match(/^# (.+)$/m)
            const h2Match = section.match(/^## (.+)$/m)
            const h3Match = section.match(/^### (.+)$/m)
            titleMatch = h1Match || h2Match || h3Match
            detectedLevel = h1Match ? 1 : h2Match ? 2 : 3
          } else {
            titleMatch = section.match(headingPattern)
          }

          if (!titleMatch && chapterIndex > 0) {
            startPosition += section.length + 1
            continue
          }

          const chapterTitle = titleMatch
            ? titleMatch[1].replace(/\s+\d+\s*$/, '').trim()
            : 'Introduction'

          // Sanitize the chapter markdown (images are already inline from Docling)
          const cleanedMarkdown = section
            .replace(/^\s*\d+\s*$/gm, '') // Remove standalone page numbers
            .replace(/page\s+\d+\s+(of\s+\d+)?/gi, '') // Remove "Page X of Y"
            .replace(/(?<!\])\[\d+\](?!\()/g, '') // Remove reference numbers but keep links
            .replace(/^\s*[-•]\s*$/gm, '') // Remove orphan bullets
            .replace(/\n{4,}/g, '\n\n\n') // Clean excessive whitespace
            .trim()

          // Count inline images in this chapter (already have surf:// URLs)
          const inlineImageCount = (cleanedMarkdown.match(/!\[.*?\]\(surf:\/\//g) || []).length
          if (inlineImageCount > 0) {
            console.log(`[Library] Chapter ${chapterIndex} has ${inlineImageCount} inline images`)
          }

          tableOfContents.push({
            id: `chapter-${chapterIndex}`,
            title: chapterTitle,
            level: detectedLevel || headingLevel || 2,
            markdown: cleanedMarkdown,
            imageResourceIds: [], // Images are now inline in markdown, not separate
            startPosition,
            chunkStartIndex: chapterIndex
          })

          console.log(
            `[Library] Chapter ${chapterIndex}: "${chapterTitle.substring(0, 40)}..." (${cleanedMarkdown.length} chars, ${inlineImageCount} inline images)`
          )
          chapterIndex++
          startPosition += section.length + 1
        }

        console.log('[Library] Split into', tableOfContents.length, 'chapters')
      } catch (splitError) {
        console.warn('[Library] Chapter splitting failed, using fallback:', splitError)
        // Fallback: create single chapter with all content
        // Images are already inline in markdown with surf:// URLs
        tableOfContents.push({
          id: 'chapter-0',
          title: title,
          level: 1,
          markdown: markdown,
          imageResourceIds: [],
          startPosition: 0,
          chunkStartIndex: 0
        })
      }

      // Create library document metadata with per-chapter markdown
      const libraryMetadata = {
        originalFormat: ext || 'pdf',
        originalPath: filePath,
        title,
        author: conversionMetadata.author || undefined,
        pageCount: conversionMetadata.pageCount || undefined,
        tableOfContents
      }

      libraryConversionProgress = {
        stage: 'converting',
        progress: 90,
        message: 'Saving to library...'
      }

      // Create blob from markdown content (full document for compatibility)
      const contentBlob = new Blob([markdown], { type: 'text/markdown' })

      // Create the resource
      const resource = await resourceManager.createResource(
        ResourceTypes.LIBRARY_DOCUMENT,
        contentBlob,
        {
          name: title,
          sourceURI: `file://${filePath}`
        },
        [{ name: 'libraryMetadata', value: JSON.stringify(libraryMetadata) }]
      )

      console.log(
        '[Library] Created library document:',
        resource.id,
        title,
        `(${tableOfContents.length} chapters)`
      )

      libraryConversionProgress = {
        stage: 'complete',
        progress: 100,
        message: `Document added to library! (${tableOfContents.length} chapters)`
      }

      // Reset after a delay
      setTimeout(() => {
        isConvertingLibrary = false
        libraryConversionProgress = null
      }, 2000)
    } catch (error) {
      console.error('[Library] Failed to process file:', error)
      libraryConversionProgress = {
        stage: 'error',
        progress: 0,
        message: String(error)
      }
      isConvertingLibrary = false
    }
  }

  const getLibraryMetadata = (resource: Resource): LibraryDocumentMetadata | null => {
    // Try to get from tag first
    const tag = resource?.tags?.find((t: any) => t.name === 'libraryMetadata')
    if (tag) {
      try {
        return JSON.parse(tag.value) as LibraryDocumentMetadata
      } catch {
        console.warn('[Library] Failed to parse metadata tag for', resource.id)
      }
    }

    // Fallback: create metadata from resource properties
    // This ensures the card renders even if the tag isn't loaded yet
    if (resource.type === ResourceTypes.LIBRARY_DOCUMENT) {
      console.log('[Library] Using fallback metadata for:', resource.id, resource.metadata?.name)
      return {
        title: resource.metadata?.name || 'Untitled Document',
        originalFormat: 'pdf',
        originalPath: resource.metadata?.sourceURI || '',
        tableOfContents: []
      }
    }

    return null
  }

  const handleLibraryCardClick = (resource: Resource) => {
    // Navigate to document detail page
    handleResourceClick(resource.id, new MouseEvent('click'))
  }

  const handleOpenAsFile = (resourceId: string) => {
    // @ts-ignore
    window.api.openResourceLocally(resourceId)
  }

  const handleExport = (resourceId: string) => {
    // @ts-ignore
    window.api.exportResource(resourceId)
  }

  const getSourceCardCtxItems = (resource: Resource, sourceNotebookId?: string) =>
    getResourceCtxItems({
      resource,
      sortedNotebooks: notebookManager.sortedNotebooks,
      onAddToNotebook: (notebookId) => handleAddToNotebook(notebookId, resource.id),
      onOpen: (target: OpenTarget) => openResource(resource.id, { target, offline: false }),
      onOpenOffline: (resourceId: string) =>
        openResource(resourceId, { offline: true, target: 'tab' }),
      onDeleteResource: () => onDeleteResource(resource),
      onOpenAsFile: () => handleOpenAsFile(resource.id),
      onExport: () => handleExport(resource.id),
      onRemove:
        !sourceNotebookId || sourceNotebookId === 'drafts'
          ? undefined
          : () => handleRemoveFromNotebook(sourceNotebookId, resource.id)
    })

  const categories = $derived([
    ...conditionalArrayItem(notebookId === undefined, {
      id: 'notebooks',
      label: 'Notebooks',
      icon: {
        main: 'notebook',
        add: 'add'
      }
    }),
    {
      id: 'notes',
      label: 'Notes',
      icon: {
        main: 'note',
        add: 'add'
      }
    },
    {
      id: 'sources',
      label: 'Media',
      icon: {
        main: 'link',
        add: 'folder.open'
      }
    },
    {
      id: 'library',
      label: 'My Library',
      icon: {
        main: 'book',
        add: 'folder.open'
      }
    }
  ])

  const getAddButtonAction = (categoryId: string) => {
    if (categoryId === 'notebooks') return handleCreateNotebook
    if (categoryId === 'notes') return handleCreateNote
    if (categoryId === 'sources') return handleUploadFiles
    if (categoryId === 'library') return () => handleUploadLibraryDocument([])
  }

  const getAddButtonTooltip = (categoryId: string) => {
    if (categoryId === 'notebooks') return 'Create Notebook'
    if (categoryId === 'notes') return 'Create Note'
    if (categoryId === 'sources') return 'Import Media'
    if (categoryId === 'library') return 'Add Document'
  }

  const toggleCategoryCollapse = (categoryId: string) => {
    const newCollapsed = new Set(collapsedCategories)
    if (newCollapsed.has(categoryId)) {
      newCollapsed.delete(categoryId)
    } else {
      newCollapsed.add(categoryId)
    }
    collapsedCategories = newCollapsed
  }

  const resetCollapsedCategories = () => {
    collapsedCategories = new Set()
  }

  const isCategoryCollapsed = (categoryId: string) => collapsedCategories.has(categoryId)

  $effect(() => {
    if (searchQuery.length > 0) {
      if (categoryScrollContainer) {
        categoryScrollContainer.scrollTo({ left: 0, behavior: 'smooth' })
      }
      resetCollapsedCategories()
    }
  })
</script>

{#snippet loadingSnippet()}
  <div class="loading-more">
    <Icon name="spinner" />
  </div>
{/snippet}

{#snippet noResultsSnippet(categoryLabel: string)}
  <section class="empty">
    <p>No {categoryLabel} found for "{searchQuery}"</p>
  </section>
{/snippet}

{#snippet notesList({ resources, searchResults, pagination, loadMore })}
  {#if searchQuery && searchResults?.length === 0}
    {@render noResultsSnippet('notes')}
  {:else if resources.length <= 0}
    {#if searchQuery.length > 0}
      {@render noResultsSnippet('notes')}
    {:else}
      <div class="px py">
        <section class="empty">
          <h1>What are Surf Notes?</h1>

          <p style="max-width: 50ch;">
            Surf notes are rich text documents that you can create manually or generate using Surf's
            AI from your personal media.<br />
          </p>

          <p style="max-width: 48ch;">
            Jump start a new note by asking Surf's AI something in the input box above or create a
            blank note using the button.
          </p>
        </section>
      </div>
    {/if}
  {:else}
    <div class="sources-grid">
      {#each searchResults ?? resources as resource, i (typeof resource === 'string' ? resource : resource.id + i)}
        <ResourceLoader {resource}>
          {#snippet children(resource: Resource)}
            <NotebookSidebarNoteName {resource} sourceNotebookId={notebookId} />
          {/snippet}
        </ResourceLoader>
      {/each}
    </div>

    {#if pagination.hasMore && !searchQuery}
      <div
        class="load-more-trigger"
        bind:this={notesLoadMoreTrigger}
        data-load-more="notes"
        use:attachLoadMore={loadMore}
      >
        {#if pagination.isLoadingMore}
          {@render loadingSnippet()}
        {/if}
      </div>
    {/if}
  {/if}
{/snippet}

{#snippet sourcesList({ resources, searchResults, pagination, loadMore })}
  {#if searchQuery && searchResults?.length === 0}
    {@render noResultsSnippet('media')}
  {:else if resources.length === 0}
    <div class="px py">
      <div class="empty">
        <h1>Surf Media</h1>

        <p style="max-width: 55ch;">
          Add media from across the web or your system to your notebook and to use it together with
          Surf Notes to turn them into something great.
        </p>

        <p style="max-width: 57ch;">
          Save web pages using the "Save" button while browsing, import local files or add existing
          media from other notebooks by right-clicking them.
        </p>
      </div>
    </div>
  {:else}
    <div class="sources-grid">
      {#each searchResults ?? resources as resource, i (typeof resource === 'string' ? resource : resource.id + i)}
        <ResourceLoader {resource}>
          {#snippet children(resource: Resource)}
            <SourceCard
              --width={'34px'}
              --height={'41px'}
              --max-width={''}
              {resource}
              text
              {onDeleteResource}
              onclick={(e) => handleResourceClick(resource.id, e)}
              {@attach contextMenu({
                canOpen: true,
                items: getSourceCardCtxItems(resource, notebookId)
              })}
            />
          {/snippet}
        </ResourceLoader>
      {/each}
    </div>

    {#if pagination.hasMore && !searchQuery}
      <div
        class="load-more-trigger"
        bind:this={sourcesLoadMoreTrigger}
        data-load-more="sources"
        use:attachLoadMore={loadMore}
      >
        {#if pagination.isLoadingMore}
          {@render loadingSnippet()}
        {/if}
      </div>
    {/if}
  {/if}
{/snippet}

{#snippet libraryList({ resources, searchResults, pagination, loadMore })}
  {#if searchQuery && searchResults?.length === 0}
    {@render noResultsSnippet('documents')}
  {:else}
    <!-- Always show drop zone at TOP -->
    <LibraryDropZone
      onupload={handleUploadLibraryDocument}
      isConverting={isConvertingLibrary}
      conversionProgress={libraryConversionProgress}
    />

    {#if resources.length > 0}
      <!-- Book cards grid below drop zone -->
      <div class="library-grid">
        {#each searchResults ?? resources as resource, i (typeof resource === 'string' ? resource : resource.id + i)}
          <ResourceLoader {resource}>
            {#snippet children(resource: Resource)}
              {@const metadata = getLibraryMetadata(resource)}
              {#if metadata}
                <LibraryBookCard
                  id={resource.id}
                  {metadata}
                  onclick={() => handleLibraryCardClick(resource)}
                  ondelete={() => onDeleteResource(resource)}
                  {@attach contextMenu({
                    canOpen: true,
                    items: [
                      {
                        type: 'action',
                        text: 'Open',
                        icon: 'book',
                        action: () => handleLibraryCardClick(resource)
                      },
                      {
                        type: 'action',
                        text: 'Open in New Tab',
                        icon: 'tab',
                        action: () => openResource(resource.id, { target: 'tab', offline: false })
                      },
                      {
                        type: 'separator'
                      },
                      {
                        type: 'action',
                        kind: 'danger',
                        text: 'Delete',
                        icon: 'trash',
                        action: () => onDeleteResource(resource)
                      }
                    ]
                  })}
                />
              {/if}
            {/snippet}
          </ResourceLoader>
        {/each}
      </div>

      {#if pagination.hasMore && !searchQuery}
        <div class="load-more-trigger" use:attachLoadMore={loadMore}>
          {#if pagination.isLoadingMore}
            {@render loadingSnippet()}
          {/if}
        </div>
      {/if}
    {/if}
  {/if}
{/snippet}

{#if isCustomizingNotebook}
  <NotebookEditor bind:notebook={isCustomizingNotebook} />
{:else if isCustomizingNotebook === null}
  <NotebookEditor />
{/if}

{#if isNewNotebook}
  <NotebookEditor
    bind:notebook={isNewNotebook}
    mode="create"
    oncreate={() => {
      handlePinNotebook(isNewNotebook!.id)
      isNewNotebook = null
    }}
    oncancel={() => {
      handleCancelNewNotebook(isNewNotebook!)
      isNewNotebook = null
    }}
  />
{/if}

<div class="library-container">
  <header class="library-header">
    <h3 class="library-title">
      {notebookId ? 'Your Notebook' : 'Your Library'}
    </h3>
    <SearchInput bind:value={searchQuery} />
  </header>
  <div class="categories-scroll-container" bind:this={categoryScrollContainer}>
    <div class="categories-scroll-content">
      {#each categories as category}
        <div class="category-section">
          <div class="category-header">
            <button class="category-tab" onclick={() => toggleCategoryCollapse(category.id)}>
              <Icon name={category.icon.main} />
              <span>{category.label}</span>
              <Icon
                name={isCategoryCollapsed(category.id) ? 'chevron.down' : 'chevron.up'}
                style="margin-left: auto; font-size: 0.8rem; opacity: 0.5;"
              />
            </button>
            {#if !isCategoryCollapsed(category.id)}
              <Button
                size="sm"
                tooltip={getAddButtonTooltip(category.id)}
                onclick={getAddButtonAction(category.id)}
                class="category-add-btn"
              >
                <Icon name={category.icon.add} />
              </Button>
            {/if}
          </div>

          {#if !isCategoryCollapsed(category.id)}
            <div class={'category-content'}>
              {#if category.id === 'notebooks'}
                {#if notebooksList.length <= 0 && searchQuery.length > 0}
                  {@render noResultsSnippet('notebooks')}
                {/if}
                <div class="notebook-grid">
                  {#each notebooksList as notebook, i (notebook.id + i)}
                    <div
                      class="notebook-wrapper"
                      style="width: 100%;max-width: 11.25ch;"
                      style:--delay={100 + i * 10 + 'ms'}
                    >
                      <NotebookCover
                        {notebook}
                        height="17.25ch"
                        fontSize="0.85rem"
                        onclick={(e) => handleNotebookClick(notebook.id, e)}
                        canPin={notebook.id !== 'drafts'}
                        onpin={() => handlePinNotebook(notebook.id)}
                        onunpin={() => handleUnPinNotebook(notebook.id)}
                        {@attach contextMenu({
                          canOpen: notebook.id !== 'drafts',
                          items: [
                            !notebook.data?.pinned
                              ? {
                                  type: 'action',
                                  text: 'Add to Favorites',
                                  icon: 'heart',
                                  action: () => handlePinNotebook(notebook.id)
                                }
                              : {
                                  type: 'action',
                                  text: 'Remove from Favorites',
                                  icon: 'heart.off',
                                  action: () => handleUnPinNotebook(notebook.id)
                                },
                            {
                              type: 'action',
                              text: 'Customize',
                              icon: 'edit',
                              action: () => (isCustomizingNotebook = notebook)
                            },
                            {
                              type: 'action',
                              kind: 'danger',
                              text: 'Delete',
                              icon: 'trash',
                              action: () => handleDeleteNotebook(notebook)
                            }
                          ]
                        })}
                      />
                    </div>
                  {/each}
                </div>
              {:else if category.id === 'notes'}
                <ul>
                  <SurfLoader
                    pageSize={20}
                    {notebookId}
                    tags={[
                      SearchResourceTags.ResourceType(ResourceTypes.DOCUMENT_SPACE_NOTE, 'eq')
                    ]}
                    search={{
                      query: searchQuery,
                      tags: [
                        SearchResourceTags.ResourceType(ResourceTypes.DOCUMENT_SPACE_NOTE, 'eq')
                      ],
                      parameters: {
                        semanticSearch: false
                      }
                    }}
                  >
                    {#snippet children(loaderData)}
                      {@render notesList(loaderData)}
                    {/snippet}
                    {#snippet loading()}
                      {@render loadingSnippet()}
                    {/snippet}
                  </SurfLoader>
                </ul>
              {:else if category.id === 'sources'}
                <SurfLoader
                  pageSize={20}
                  {notebookId}
                  tags={[SearchResourceTags.ResourceType(ResourceTypes.DOCUMENT_SPACE_NOTE, 'ne')]}
                  search={{
                    query: searchQuery,
                    tags: [
                      SearchResourceTags.ResourceType(ResourceTypes.DOCUMENT_SPACE_NOTE, 'ne')
                    ],
                    parameters: {
                      semanticSearch: false
                    }
                  }}
                >
                  {#snippet children(loaderData)}
                    {@render sourcesList(loaderData)}
                  {/snippet}
                  {#snippet loading()}
                    {@render loadingSnippet()}
                  {/snippet}
                </SurfLoader>
              {:else if category.id === 'library'}
                <SurfLoader
                  pageSize={20}
                  {notebookId}
                  tags={[SearchResourceTags.ResourceType(ResourceTypes.LIBRARY_DOCUMENT, 'eq')]}
                  search={{
                    query: searchQuery,
                    tags: [SearchResourceTags.ResourceType(ResourceTypes.LIBRARY_DOCUMENT, 'eq')],
                    parameters: {
                      semanticSearch: false
                    }
                  }}
                >
                  {#snippet children(loaderData)}
                    {@render libraryList(loaderData)}
                  {/snippet}
                  {#snippet loading()}
                    {@render loadingSnippet()}
                  {/snippet}
                </SurfLoader>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<style lang="scss">
  .library-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding-right: 10px !important;
  }

  .library-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 1rem;
    margin-bottom: 1rem;
    gap: 0.75rem;

    :global(input) {
      transition: all 0.2s ease;
    }
  }

  .library-title-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem;
    background: none;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
    }

    :global([data-icon]) {
      transition: transform 0.2s ease;
    }
  }

  .library-title {
    font-size: 1.2rem;
    font-weight: 600;
    margin: 0;
  }

  .categories-scroll-container {
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    scrollbar-color: light-dark(rgba(0, 0, 0, 0.2), rgba(255, 255, 255, 0.2)) transparent;
    scroll-behavior: smooth;

    &::-webkit-scrollbar {
      height: 8px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background-color: light-dark(rgba(0, 0, 0, 0.2), rgba(255, 255, 255, 0.2));
      border-radius: 4px;
      transition: background-color 0.2s ease;
    }

    &::-webkit-scrollbar-thumb:hover {
      background-color: light-dark(rgba(0, 0, 0, 0.3), rgba(255, 255, 255, 0.3));
    }
  }

  .categories-scroll-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding-bottom: 1rem;
  }

  .category-section {
    flex-shrink: 0;
  }

  .category-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
    gap: 0.5rem;
  }

  .category-tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem;
    background: none;
    border: none;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 500;
    color: light-dark(rgba(0, 0, 0, 0.8), rgba(255, 255, 255, 0.8));
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
    }

    :global([data-icon]) {
      transition: transform 0.2s ease;
    }
  }

  :global(.category-add-btn[data-button-root]) {
    padding: 0.35rem 0.5rem;
    opacity: 0.6;
    flex-shrink: 0;

    &:hover {
      opacity: 1;
    }
  }

  .category-content {
    max-height: min(360px, 40vh);
    overflow-y: auto;
    transform-origin: top;
    scroll-behavior: smooth;
    scrollbar-width: thin;
    scrollbar-color: light-dark(rgba(0, 0, 0, 0.15), rgba(255, 255, 255, 0.15)) transparent;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background-color: light-dark(rgba(0, 0, 0, 0.15), rgba(255, 255, 255, 0.15));
      border-radius: 3px;
      transition: background-color 0.2s ease;
    }

    &::-webkit-scrollbar-thumb:hover {
      background-color: light-dark(rgba(0, 0, 0, 0.25), rgba(255, 255, 255, 0.25));
    }

    @media screen and (min-width: 1440px) {
      max-height: 50vh;
    }

    @media screen and (min-width: 1920px) {
      max-height: 60vh;
    }
  }

  .notebook-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11.3ch, 1fr));
    gap: 0.5rem;
  }

  .sources-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
    grid-auto-rows: 60px;
  }

  .library-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 1rem;
    padding: 0.5rem;
  }

  .load-more-trigger {
    text-align: center;
    width: 100%;
    margin-top: 1rem;
    padding: 0.5rem;
  }

  .loading-more {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    color: light-dark(rgba(0, 0, 0, 0.5), rgba(255, 255, 255, 0.5));
  }

  .empty {
    width: 100%;
    border: 1px dashed light-dark(rgba(0, 0, 0, 0.2), rgba(71, 85, 105, 0.4));
    padding: 0.75rem 0.75rem;
    border-radius: 10px;
    gap: 0.5rem;
    color: light-dark(rgba(0, 0, 0, 0.25), rgba(255, 255, 255, 0.3));
    text-align: center;
    text-wrap: pretty;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;

    h3 {
      color: light-dark(rgba(0, 0, 0, 0.75), rgba(255, 255, 255, 0.8));
    }

    p {
      font-size: var(--title-sm-fontSize);
      line-height: var(--title-sm-lineHeight);
      letter-spacing: 0.015em;
      font-weight: 400;
      color: light-dark(rgba(0, 0, 0, 0.5), rgba(255, 255, 255, 0.5));
      max-width: 60ch;
    }
  }
</style>
