import { spawn, execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import * as os from 'os'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse')

export interface ConversionProgress {
  stage: 'queued' | 'extracting' | 'converting' | 'complete' | 'error'
  progress: number // 0-100
  message?: string
  method?: 'unpdf' | 'marker' | 'markitdown' // Which converter is being used
}

export interface ImageInfo {
  path: string
  page?: number
  index?: number
  alt?: string
  caption?: string
  figureNumber?: string
  type?: 'figure' | 'page_render' | 'inline'
  bbox?: {
    x: number
    y: number
    width: number
    height: number
  }
  source?: string
}

export interface ConversionResult {
  markdown: string
  metadata: {
    title?: string
    author?: string
    pageCount?: number
    figureCaptions?: Record<string, string> // Figure number -> caption text
  }
  images: Array<string | ImageInfo>
  method: 'unpdf' | 'marker' | 'markitdown' | 'docling' // Which converter was used
}

export interface ConversionOptions {
  /** Force OCR processing via Marker (for scanned documents) */
  forceOCR?: boolean
  /** Use LLM enhancement in Marker (slower but higher quality) */
  useLLM?: boolean
  /** Minimum characters per page to consider PDF as text-based (default: 100) */
  minCharsPerPage?: number
  /** Use VLM pipeline for enhanced equation/math recognition (default: true) */
  useVLM?: boolean
}

/**
 * Enterprise-grade document conversion service
 *
 * Primary: unpdf (instant, powered by Mozilla PDF.js)
 * Fallback: Marker (ML-based OCR for scanned documents)
 *
 * Strategy:
 * 1. Try fast extraction with unpdf first
 * 2. Analyze extracted text quality (chars per page)
 * 3. If insufficient text detected, fall back to Marker OCR
 */
export class DocumentConversionService {
  private outputDir: string
  private markerAvailable: boolean | null = null
  private markerPath: string | null = null
  private markitdownAvailable: boolean | null = null
  private markitdownScriptPath: string
  private doclingAvailable: boolean | null = null
  private doclingScriptPath: string

  /** Minimum characters per page to consider extraction successful */
  private static readonly DEFAULT_MIN_CHARS_PER_PAGE = 100

  constructor() {
    this.outputDir = path.join(app.getPath('userData'), 'marker_output')
    fs.mkdirSync(this.outputDir, { recursive: true })

    // Script paths - check multiple locations for development and production
    // In development: scripts are in app/scripts/
    // In production: scripts should be in Resources/app/scripts/ or similar
    const possibleScriptDirs = [
      // Development: relative to src/main (compiled to out/main)
      path.join(__dirname, '..', '..', 'scripts'),
      // Development: direct path from project root
      path.join(app.getAppPath(), 'scripts'),
      // Production: inside the app bundle
      path.join(app.getAppPath(), '..', 'scripts'),
      // Alternative: next to the executable
      path.join(path.dirname(app.getPath('exe')), 'scripts')
    ]

    // Find the scripts directory that actually exists
    let scriptsDir = possibleScriptDirs[0] // Default
    for (const dir of possibleScriptDirs) {
      if (fs.existsSync(dir)) {
        scriptsDir = dir
        console.log('[DocumentConverter] Found scripts directory at:', dir)
        break
      }
    }

    this.markitdownScriptPath = path.join(scriptsDir, 'markitdown_converter.py')
    this.doclingScriptPath = path.join(scriptsDir, 'docling_converter.py')

    console.log('[DocumentConverter] MarkItDown script path:', this.markitdownScriptPath)
    console.log('[DocumentConverter] Docling script path:', this.doclingScriptPath)
  }

  /**
   * Find the marker_single executable in common locations
   */
  private findMarkerExecutable(): string | null {
    const homeDir = os.homedir()
    const possiblePaths = [
      // macOS Python Framework paths
      '/Library/Frameworks/Python.framework/Versions/3.12/bin/marker_single',
      '/Library/Frameworks/Python.framework/Versions/3.11/bin/marker_single',
      '/Library/Frameworks/Python.framework/Versions/3.10/bin/marker_single',
      // Homebrew Python
      '/opt/homebrew/bin/marker_single',
      '/usr/local/bin/marker_single',
      // User local bin
      path.join(homeDir, '.local', 'bin', 'marker_single'),
      // pyenv
      path.join(homeDir, '.pyenv', 'shims', 'marker_single'),
      // conda/miniconda
      path.join(homeDir, 'miniconda3', 'bin', 'marker_single'),
      path.join(homeDir, 'anaconda3', 'bin', 'marker_single'),
      // Linux paths
      '/usr/bin/marker_single'
    ]

    for (const markerPath of possiblePaths) {
      if (fs.existsSync(markerPath)) {
        console.log('[DocumentConverter] Found marker_single at:', markerPath)
        return markerPath
      }
    }

    // Try 'which' command
    try {
      const result = execSync('which marker_single', { encoding: 'utf-8' }).trim()
      if (result && fs.existsSync(result)) {
        console.log('[DocumentConverter] Found marker_single via which:', result)
        return result
      }
    } catch {
      // which command failed
    }

    // Try login shell
    try {
      const shell = process.env.SHELL || '/bin/bash'
      const result = execSync(`${shell} -l -c 'which marker_single'`, { encoding: 'utf-8' }).trim()
      if (result && fs.existsSync(result)) {
        console.log('[DocumentConverter] Found marker_single via login shell:', result)
        return result
      }
    } catch {
      // Shell command failed
    }

    console.log('[DocumentConverter] marker_single not found in any known location')
    return null
  }

  /**
   * Check if Marker is installed and available
   */
  async checkMarkerInstalled(): Promise<{
    installed: boolean
    installCommand?: string
    path?: string
  }> {
    if (this.markerAvailable === true && this.markerPath !== null) {
      return { installed: true, path: this.markerPath }
    }

    this.markerAvailable = null
    this.markerPath = null
    this.markerPath = this.findMarkerExecutable()

    if (!this.markerPath) {
      this.markerAvailable = false
      return {
        installed: false,
        installCommand: 'pip install marker-pdf'
      }
    }

    try {
      fs.accessSync(this.markerPath, fs.constants.X_OK)
      this.markerAvailable = true
      return { installed: true, path: this.markerPath }
    } catch {
      this.markerAvailable = false
      this.markerPath = null
      return {
        installed: false,
        installCommand: 'pip install marker-pdf'
      }
    }
  }

  /**
   * Check if MarkItDown is installed and available
   */
  async checkMarkItDownInstalled(): Promise<{ installed: boolean; installCommand?: string }> {
    if (this.markitdownAvailable !== null) {
      return { installed: this.markitdownAvailable }
    }

    try {
      // Check if the Python script exists
      if (!fs.existsSync(this.markitdownScriptPath)) {
        console.log(
          '[DocumentConverter] MarkItDown script not found at:',
          this.markitdownScriptPath
        )
        this.markitdownAvailable = false
        return { installed: false, installCommand: "pip install 'markitdown[all]'" }
      }

      // Check if markitdown module is available in Python
      const result = execSync('python3 -c "from markitdown import MarkItDown; print(\'ok\')"', {
        encoding: 'utf-8',
        timeout: 10000
      }).trim()

      if (result === 'ok') {
        this.markitdownAvailable = true
        console.log('[DocumentConverter] MarkItDown is available')
        return { installed: true }
      }

      this.markitdownAvailable = false
      return { installed: false, installCommand: "pip install 'markitdown[all]'" }
    } catch (error: any) {
      console.log('[DocumentConverter] MarkItDown not available:', error.message)
      this.markitdownAvailable = false
      return { installed: false, installCommand: "pip install 'markitdown[all]'" }
    }
  }

  /**
   * Check if Docling is installed and available
   * Docling provides superior AI-powered document conversion with image extraction
   */
  async checkDoclingInstalled(): Promise<{ installed: boolean; installCommand?: string }> {
    if (this.doclingAvailable !== null) {
      return { installed: this.doclingAvailable }
    }

    try {
      // Check if the Python script exists
      if (!fs.existsSync(this.doclingScriptPath)) {
        console.log('[DocumentConverter] Docling script not found at:', this.doclingScriptPath)
        this.doclingAvailable = false
        return { installed: false, installCommand: 'pip install docling' }
      }

      // Check if docling module is available in Python
      const result = execSync(
        'python3 -c "from docling.document_converter import DocumentConverter; print(\'ok\')"',
        { encoding: 'utf-8', timeout: 15000 }
      ).trim()

      if (result === 'ok') {
        this.doclingAvailable = true
        console.log('[DocumentConverter] Docling is available')
        return { installed: true }
      }

      this.doclingAvailable = false
      return { installed: false, installCommand: 'pip install docling' }
    } catch (error: any) {
      console.log('[DocumentConverter] Docling not available:', error.message)
      this.doclingAvailable = false
      return { installed: false, installCommand: 'pip install docling' }
    }
  }

  /**
   * Primary conversion method - tries Docling first (best quality), then MarkItDown, then pdf-parse, falls back to OCR
   *
   * Conversion priority:
   * 1. Docling (AI-powered, best image extraction with coordinates)
   * 2. MarkItDown (Microsoft library, decent quality)
   * 3. pdf-parse (fast, text-only, no images)
   * 4. Marker (OCR fallback for scanned documents)
   */
  async convert(
    filePath: string,
    options: ConversionOptions = {},
    onProgress?: (progress: ConversionProgress) => void
  ): Promise<ConversionResult> {
    const ext = path.extname(filePath).toLowerCase()

    // Try Docling first - best quality with AI-powered image extraction
    const doclingCheck = await this.checkDoclingInstalled()
    if (doclingCheck.installed) {
      try {
        console.log('[DocumentConverter] Trying Docling (AI-powered) for:', ext)
        return await this.convertWithDocling(filePath, options, onProgress)
      } catch (error: any) {
        console.log('[DocumentConverter] Docling failed, trying next method:', error.message)
        // Fall through to MarkItDown
      }
    }

    // Try MarkItDown second for all document types (PDF, EPUB, DOCX, PPTX)
    const markitdownCheck = await this.checkMarkItDownInstalled()
    if (markitdownCheck.installed) {
      try {
        console.log('[DocumentConverter] Trying MarkItDown for:', ext)
        return await this.convertWithMarkItDown(filePath, options, onProgress)
      } catch (error: any) {
        console.log('[DocumentConverter] MarkItDown failed, falling back:', error.message)
        // Fall through to other methods
      }
    }

    // For non-PDF documents without Docling/MarkItDown, use Marker
    if (ext !== '.pdf') {
      console.log('[DocumentConverter] Non-PDF document, using Marker:', ext)
      return this.convertWithMarker(filePath, options, onProgress)
    }

    // If OCR is explicitly requested, use Marker
    if (options.forceOCR) {
      console.log('[DocumentConverter] Force OCR requested, using Marker')
      return this.convertWithMarker(filePath, options, onProgress)
    }

    // Try fast extraction with pdf-parse first
    onProgress?.({
      stage: 'extracting',
      progress: 10,
      message: 'Analyzing document...',
      method: 'unpdf'
    })

    try {
      const result = await this.convertWithPdfParse(filePath, options, onProgress)

      // Validate extraction quality
      const minCharsPerPage =
        options.minCharsPerPage ?? DocumentConversionService.DEFAULT_MIN_CHARS_PER_PAGE
      const charsPerPage = result.markdown.length / Math.max(1, result.metadata.pageCount || 1)

      console.log(
        `[DocumentConverter] pdf-parse extraction: ${result.markdown.length} chars, ${result.metadata.pageCount} pages, ${Math.round(charsPerPage)} chars/page`
      )

      if (charsPerPage >= minCharsPerPage) {
        // Good extraction - use pdf-parse result
        console.log('[DocumentConverter] Text extraction successful, using pdf-parse result')
        onProgress?.({
          stage: 'complete',
          progress: 100,
          message: 'Conversion complete',
          method: 'unpdf'
        })
        return result
      }

      // Insufficient text - likely a scanned document
      console.log(
        `[DocumentConverter] Low text density (${Math.round(charsPerPage)} chars/page), falling back to Marker OCR`
      )
      onProgress?.({
        stage: 'extracting',
        progress: 20,
        message: 'Scanned document detected, starting OCR...',
        method: 'marker'
      })

      return this.convertWithMarker(filePath, options, onProgress)
    } catch (error) {
      console.error('[DocumentConverter] pdf-parse extraction failed:', error)

      // Fall back to Marker on any error
      console.log('[DocumentConverter] Falling back to Marker due to error')
      onProgress?.({
        stage: 'extracting',
        progress: 20,
        message: 'Falling back to OCR processing...',
        method: 'marker'
      })

      return this.convertWithMarker(filePath, options, onProgress)
    }
  }

  /**
   * Convert document using Docling (IBM's AI-powered library)
   * Best quality conversion with:
   * - Granite-Docling-258M VLM for enhanced equation recognition
   * - DocLayNet for layout understanding
   * - TableFormer for table detection
   * - Image extraction with bounding box coordinates
   * - Figure-caption associations
   */
  private async convertWithDocling(
    filePath: string,
    options: ConversionOptions,
    onProgress?: (progress: ConversionProgress) => void
  ): Promise<ConversionResult> {
    // VLM is disabled by default (too slow on CPU, requires CUDA GPU)
    // Equations are rendered as images instead for fast, accurate display
    const useVLM = options.useVLM === true

    console.log(
      '[DocumentConverter] Starting Docling conversion:',
      filePath,
      useVLM ? '(VLM mode)' : '(standard mode)'
    )

    onProgress?.({
      stage: 'extracting',
      progress: 10,
      message: useVLM
        ? 'Converting with Docling VLM (enhanced equation recognition)...'
        : 'Converting with Docling (AI-powered)...',
      method: 'markitdown' // Use markitdown for UI since 'docling' not in type yet
    })

    // Create output directory for extracted images
    const imageOutputDir = path.join(this.outputDir, 'docling_images', Date.now().toString())
    fs.mkdirSync(imageOutputDir, { recursive: true })

    return new Promise((resolve, reject) => {
      const args = [
        this.doclingScriptPath,
        filePath,
        '--output-dir',
        imageOutputDir,
        '--fallback', // Enable fallback to MarkItDown if Docling fails internally
        '--verbose'
      ]

      // Add VLM flag for enhanced equation recognition
      if (useVLM) {
        args.push('--vlm')
      }

      const pythonProcess = spawn('python3', args)
      let stdout = ''
      let stderr = ''

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString()
        console.log('[DocumentConverter] Docling:', data.toString().trim())
      })

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout)

            if (result.error) {
              reject(new Error(`Docling error: ${result.error}`))
              return
            }

            onProgress?.({
              stage: 'complete',
              progress: 100,
              message: 'AI-powered conversion complete',
              method: 'markitdown'
            })

            // Get images with rich metadata
            const images: ImageInfo[] = (result.images || []).map((img: any) => ({
              path: img.path,
              page: img.page,
              index: img.index,
              alt: img.alt || img.caption || `Figure ${img.index + 1}`,
              caption: img.caption,
              figureNumber: img.figureNumber,
              type: img.type || 'figure',
              bbox: img.bbox
            }))

            console.log(
              `[DocumentConverter] Docling extracted ${images.length} images, ${Object.keys(result.figureCaptions || {}).length} captions`
            )

            resolve({
              markdown: result.markdown,
              metadata: {
                title: result.title,
                pageCount: result.pageCount,
                figureCaptions: result.figureCaptions || {}
              },
              images,
              method: 'docling'
            })
          } catch (parseError: any) {
            reject(new Error(`Failed to parse Docling output: ${parseError.message}`))
          }
        } else {
          let errorMsg = `Docling exited with code ${code}`
          if (stderr) {
            // Try to extract useful error from stderr
            const lines = stderr.trim().split('\n')
            const errorLine = lines.find((l) => l.includes('Error') || l.includes('error'))
            if (errorLine) {
              errorMsg = errorLine
            }
          }
          reject(new Error(errorMsg))
        }
      })

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start Docling: ${error.message}`))
      })
    })
  }

  /**
   * Convert document using MarkItDown (Microsoft's Python library)
   * Supports PDF, EPUB, DOCX, PPTX, and many other formats
   * Also extracts embedded images from PDFs using pdfminer.six
   */
  private async convertWithMarkItDown(
    filePath: string,
    _options: ConversionOptions,
    onProgress?: (progress: ConversionProgress) => void
  ): Promise<ConversionResult> {
    console.log('[DocumentConverter] Starting MarkItDown conversion:', filePath)

    onProgress?.({
      stage: 'extracting',
      progress: 10,
      message: 'Converting with MarkItDown...',
      method: 'markitdown'
    })

    // Create output directory for extracted images
    const imageOutputDir = path.join(this.outputDir, 'markitdown_images', Date.now().toString())
    fs.mkdirSync(imageOutputDir, { recursive: true })

    return new Promise((resolve, reject) => {
      const args = [this.markitdownScriptPath, filePath, '--output-dir', imageOutputDir]

      const pythonProcess = spawn('python3', args)
      let stdout = ''
      let stderr = ''

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString()
        // Log stderr for debugging but don't treat as error yet
        console.log('[DocumentConverter] MarkItDown stderr:', data.toString())
      })

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout)

            if (result.error) {
              reject(new Error(`MarkItDown error: ${result.error}`))
              return
            }

            onProgress?.({
              stage: 'complete',
              progress: 100,
              message: 'Conversion complete',
              method: 'markitdown'
            })

            // Estimate page count from markdown length
            const estimatedPages = Math.max(1, Math.ceil(result.markdown.length / 3000))

            // Log extracted images and captions
            const images = result.images || []
            const figureCaptions = result.figureCaptions || {}
            console.log(
              `[DocumentConverter] Extracted ${images.length} images, ${Object.keys(figureCaptions).length} figure captions`
            )

            resolve({
              markdown: result.markdown,
              metadata: {
                title: result.title,
                pageCount: estimatedPages,
                figureCaptions // Pass along for chapter processing
              },
              images,
              method: 'markitdown'
            })
          } catch (parseError: any) {
            reject(new Error(`Failed to parse MarkItDown output: ${parseError.message}`))
          }
        } else {
          // Check if there's an error in stderr
          let errorMsg = `MarkItDown exited with code ${code}`
          if (stderr) {
            // Try to extract JSON error from stderr
            try {
              const errorJson = JSON.parse(stderr.trim().split('\n').pop() || '{}')
              if (errorJson.error) {
                errorMsg = errorJson.error
              }
            } catch {
              errorMsg = stderr || errorMsg
            }
          }
          reject(new Error(errorMsg))
        }
      })

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start MarkItDown: ${error.message}`))
      })
    })
  }

  /**
   * Fast text extraction using pdf-parse (Mozilla PDF.js wrapper for Node.js)
   * Instant for text-based PDFs
   */
  private async convertWithPdfParse(
    filePath: string,
    _options: ConversionOptions,
    onProgress?: (progress: ConversionProgress) => void
  ): Promise<ConversionResult> {
    console.log('[DocumentConverter] Starting pdf-parse extraction:', filePath)

    onProgress?.({
      stage: 'extracting',
      progress: 30,
      message: 'Reading PDF...',
      method: 'unpdf'
    })

    // Read file buffer
    const buffer = fs.readFileSync(filePath)

    // Create parser and load document
    const parser = new PDFParse({ data: buffer })
    await parser.load()

    onProgress?.({
      stage: 'converting',
      progress: 50,
      message: 'Extracting text...',
      method: 'unpdf'
    })

    // Get document info and text
    const info = await parser.getInfo()
    const textResult = await parser.getText()
    const text = textResult.text // getText() returns { pages, text, total }

    onProgress?.({
      stage: 'converting',
      progress: 80,
      message: 'Formatting content...',
      method: 'unpdf'
    })

    // Convert to markdown format
    const markdown = this.textToMarkdownFromString(text, filePath)

    // Extract metadata from pdf-parse info
    const title =
      info.info?.Title ||
      this.extractTitleFromMarkdown(markdown) ||
      path.basename(filePath, path.extname(filePath))
    const author = info.info?.Author
    const pageCount = info.total

    console.log(
      `[DocumentConverter] pdf-parse extraction complete: ${text.length} chars, ${pageCount} pages`
    )

    return {
      markdown,
      metadata: {
        title,
        author,
        pageCount
      },
      images: [], // pdf-parse doesn't extract images
      method: 'unpdf' // Keep as 'unpdf' for UI consistency
    }
  }

  /**
   * Convert extracted text string to clean markdown with chapter detection
   */
  private textToMarkdownFromString(text: string, filePath: string): string {
    const filename = path.basename(filePath, path.extname(filePath))

    // 1. Remove page markers (-- X of Y --)
    let cleaned = text.replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '\n')

    // 2. Detect and format chapter headings

    // Pattern: Numbered sections like "1.0 Introduction" or "2.1 Overview"
    cleaned = cleaned.replace(/^(\d+\.[\d.]*)\s+([A-Z][^\n]{3,80})$/gm, '\n\n## $1 $2\n\n')

    // Pattern: "Chapter X" or "CHAPTER X" followed by optional title
    cleaned = cleaned.replace(/^(Chapter\s+\d+[:\s]*[^\n]*)$/gim, '\n\n## $1\n\n')

    // Pattern: ALL CAPS lines that look like section headers (5-60 chars, not just acronyms)
    cleaned = cleaned.replace(/^([A-Z][A-Z\s]{4,60})$/gm, (match) => {
      const trimmed = match.trim()
      // Skip if it's mostly numbers or punctuation
      if (/^\d/.test(trimmed) || trimmed.length < 5) return match
      // Skip if it looks like an acronym (all caps, no spaces, short)
      if (!/\s/.test(trimmed) && trimmed.length < 15) return match
      return `\n\n## ${trimmed}\n\n`
    })

    // Pattern: Lines starting with Roman numerals (I., II., III., IV., etc.)
    cleaned = cleaned.replace(
      /^((?:I{1,3}|IV|VI{0,3}|IX|X{1,3})\.)\s+([A-Z][^\n]{3,80})$/gm,
      '\n\n## $1 $2\n\n'
    )

    // 3. Format paragraphs properly
    cleaned = this.formatParagraphs(cleaned)

    // 4. Clean up excessive whitespace
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n').trim()

    // Add document title as H1
    return `# ${filename}\n\n${cleaned}`
  }

  /**
   * Format paragraphs - join broken lines and add proper spacing
   */
  private formatParagraphs(text: string): string {
    return (
      text
        // Normalize whitespace within lines
        .replace(/[ \t]+/g, ' ')
        // Join lines broken mid-sentence (lowercase/comma followed by newline + lowercase)
        .replace(/([a-z,])\n([a-z])/gi, '$1 $2')
        // Add double newlines after sentences that end paragraphs
        .replace(/([.!?])\n([A-Z])/g, '$1\n\n$2')
        // Remove excessive newlines
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    )
  }

  /**
   * Extract title from markdown content
   */
  private extractTitleFromMarkdown(markdown: string): string | undefined {
    const titleMatch = markdown.match(/^#\s+(.+)$/m)
    return titleMatch?.[1]
  }

  /**
   * ML-powered OCR conversion using Marker
   * Use for scanned documents or when text extraction fails
   */
  private async convertWithMarker(
    filePath: string,
    options: ConversionOptions,
    onProgress?: (progress: ConversionProgress) => void
  ): Promise<ConversionResult> {
    const { installed, path: markerExePath } = await this.checkMarkerInstalled()

    if (!installed || !markerExePath) {
      throw new Error(
        'This document requires OCR processing but Marker is not installed.\n' +
          'Install with: pip install marker-pdf\n\n' +
          'Alternatively, try a different PDF that contains selectable text.'
      )
    }

    onProgress?.({
      stage: 'queued',
      progress: 0,
      message: 'Starting OCR processing (this may take a while)...',
      method: 'marker'
    })

    const timestamp = Date.now()
    const outputSubdir = path.join(this.outputDir, timestamp.toString())
    fs.mkdirSync(outputSubdir, { recursive: true })

    return new Promise((resolve, reject) => {
      const args = [filePath, '--output_format', 'markdown', '--output_dir', outputSubdir]

      if (options.useLLM === true) {
        args.push('--use_llm')
      }
      if (options.forceOCR) {
        args.push('--force_ocr')
      }

      console.log('[DocumentConverter] Running Marker:', markerExePath, args.join(' '))

      const markerProcess = spawn(markerExePath, args)

      let stdout = ''
      let stderr = ''
      let lastProgress = 25

      markerProcess.stdout.on('data', (data) => {
        stdout += data.toString()
        const output = data.toString()
        console.log('[DocumentConverter] Marker stdout:', output)

        // Parse progress from Marker output
        const progressMatch = output.match(/(\d+)\/(\d+)/)
        if (progressMatch) {
          const current = parseInt(progressMatch[1])
          const total = parseInt(progressMatch[2])
          const progress = Math.round(25 + (current / total) * 60)
          if (progress > lastProgress) {
            lastProgress = progress
            onProgress?.({
              stage: 'converting',
              progress,
              message: `Processing page ${current}/${total}...`,
              method: 'marker'
            })
          }
        }
      })

      markerProcess.stderr.on('data', (data) => {
        stderr += data.toString()
        console.log('[DocumentConverter] Marker stderr:', data.toString())
      })

      markerProcess.on('close', (code) => {
        if (code !== 0) {
          onProgress?.({ stage: 'error', progress: 0, message: stderr, method: 'marker' })
          reject(new Error(`Marker conversion failed with code ${code}: ${stderr}`))
          return
        }

        onProgress?.({
          stage: 'converting',
          progress: 90,
          message: 'Finalizing...',
          method: 'marker'
        })

        try {
          const result = this.parseMarkerOutput(outputSubdir, filePath)
          onProgress?.({
            stage: 'complete',
            progress: 100,
            message: 'OCR conversion complete',
            method: 'marker'
          })
          resolve(result)
        } catch (error) {
          onProgress?.({ stage: 'error', progress: 0, message: String(error), method: 'marker' })
          reject(error)
        }
      })

      markerProcess.on('error', (error) => {
        onProgress?.({ stage: 'error', progress: 0, message: error.message, method: 'marker' })
        reject(new Error(`Failed to start Marker: ${error.message}`))
      })
    })
  }

  /**
   * Parse Marker output directory to get markdown and images
   */
  private parseMarkerOutput(outputSubdir: string, originalPath: string): ConversionResult {
    const items = fs.readdirSync(outputSubdir)
    console.log('[DocumentConverter] Marker output contents:', items)

    let markdownPath: string | null = null
    let imageDir: string | null = null

    // Check subdirectories first (Marker's default behavior)
    for (const item of items) {
      const itemPath = path.join(outputSubdir, item)
      const stat = fs.statSync(itemPath)
      if (stat.isDirectory()) {
        const subItems = fs.readdirSync(itemPath)
        const mdFile = subItems.find((f) => f.endsWith('.md'))
        if (mdFile) {
          markdownPath = path.join(itemPath, mdFile)
          const subImageDir = path.join(itemPath, 'images')
          if (fs.existsSync(subImageDir)) {
            imageDir = subImageDir
          }
          break
        }
      }
    }

    // Fallback: check root directory
    if (!markdownPath) {
      const mdFile = items.find((f) => f.endsWith('.md'))
      if (mdFile) {
        markdownPath = path.join(outputSubdir, mdFile)
        const directImageDir = path.join(outputSubdir, 'images')
        if (fs.existsSync(directImageDir)) {
          imageDir = directImageDir
        }
      }
    }

    if (!markdownPath) {
      throw new Error('No markdown output found from Marker')
    }

    const markdown = fs.readFileSync(markdownPath, 'utf-8')
    const images = imageDir ? fs.readdirSync(imageDir).map((f) => path.join(imageDir!, f)) : []

    const metadata = this.extractMetadataFromMarkdown(markdown, originalPath)

    return {
      markdown,
      metadata,
      images,
      method: 'marker'
    }
  }

  /**
   * Extract metadata from converted markdown
   */
  private extractMetadataFromMarkdown(
    markdown: string,
    originalPath: string
  ): ConversionResult['metadata'] {
    const titleMatch = markdown.match(/^#\s+(.+)$/m)
    const title = titleMatch?.[1] || path.basename(originalPath, path.extname(originalPath))

    const authorPatterns = [/^(?:by|author:?)\s+(.+)$/im, /^(?:written by)\s+(.+)$/im]
    let author: string | undefined
    for (const pattern of authorPatterns) {
      const match = markdown.match(pattern)
      if (match) {
        author = match[1].trim()
        break
      }
    }

    const pageCount = Math.max(1, Math.ceil(markdown.length / 3000))

    return { title, author, pageCount }
  }

  /**
   * Clean up old conversion outputs
   */
  async cleanup(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    const now = Date.now()
    const dirs = fs.readdirSync(this.outputDir)

    for (const dir of dirs) {
      const dirPath = path.join(this.outputDir, dir)
      const stat = fs.statSync(dirPath)

      if (stat.isDirectory() && now - stat.mtimeMs > olderThanMs) {
        fs.rmSync(dirPath, { recursive: true, force: true })
        console.log('[DocumentConverter] Cleaned up:', dirPath)
      }
    }
  }
}

// Singleton instance
let documentConverterInstance: DocumentConversionService | null = null

export function getDocumentConverter(): DocumentConversionService {
  if (!documentConverterInstance) {
    documentConverterInstance = new DocumentConversionService()
  }
  return documentConverterInstance
}
