import {
  type JSONContent,
  generateHTML,
  generateJSON,
  generateText,
  Editor,
  type Range,
  Extension,
  wrappingInputRule
} from '@tiptap/core'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import ListKeymap from '@tiptap/extension-list-keymap'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'
import { Mathematics } from '@tiptap/extension-mathematics'
import Blockquote from '@tiptap/extension-blockquote'
import Details from '@tiptap/extension-details'
import DetailsContent from '@tiptap/extension-details-content'
import DetailsSummary from '@tiptap/extension-details-summary'
import Table from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { all, createLowlight } from 'lowlight'

import { DragHandle } from './extensions/DragHandle/DragHandleExtension'
import { SlashExtension, SlashSuggestion, type SlashCommandPayload } from './extensions/Slash/index'
import hashtagSuggestion from './extensions/Hashtag/suggestion'
import Hashtag from './extensions/Hashtag/index'
import Mention, { type MentionAction } from './extensions/Mention/index'
import mentionSuggestion, { type MentionItemsFetcher } from './extensions/Mention/suggestion'
import { type CaretPosition } from './extensions/CaretIndicator'
import Loading from './extensions/Loading'
import Thinking from './extensions/Thinking'
import TrailingNode from './extensions/TrailingNode'
import AIOutput from './extensions/AIOutput'
import type { MentionItem } from './types'
import Button from './extensions/Button'
import Resource from './extensions/Resource'
import type { ComponentType, SvelteComponent } from 'svelte'
import { conditionalArrayItem } from '@deta/utils'
import type { SlashItemsFetcher } from './extensions/Slash/suggestion'
import { Citation } from './extensions/Citation/citation'
import { Surflet } from './extensions/Surflet/surflet'
import { WebSearch } from './extensions/WebSearch/websearch'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import Link from './extensions/Link'
import type { LinkClickHandler } from './extensions/Link/helpers/clickHandler'
import { detailsInputRule } from './utilities/inputRules/details'
import AIPrompt from './extensions/AIPrompt'
import AIGeneration from './extensions/AIGeneration'
import { TitleNode } from './extensions/TitleNode'
import Youtube from './extensions/Youtube'
import LinkPreview from './extensions/LinkPreview'

export type ExtensionOptions = {
  placeholder?: string
  disableHashtag?: boolean
  enhanceCodeBlock?: boolean
  parseMentions?: boolean
  readOnlyMentions?: boolean
  mentionClick?: (item: MentionItem, action: MentionAction) => void
  mentionInsert?: (item: MentionItem) => void
  buttonClick?: (action: string) => void
  resourceComponent?: ComponentType<SvelteComponent>
  resourceComponentPreview?: boolean
  citationComponent?: ComponentType<SvelteComponent>
  citationClick?: (e: CustomEvent<any>) => void
  showDragHandle?: boolean
  showSlashMenu?: boolean
  onSlashCommand?: (payload: SlashCommandPayload) => void
  slashItems?: SlashItemsFetcher
  mentionItems?: MentionItemsFetcher
  enableCaretIndicator?: boolean
  onCaretPositionUpdate?: (position: CaretPosition) => void
  onFloatyInputStateChange?: (state: 'inline' | 'floaty' | 'bottom') => void
  onFirstLineStateChanged?: (isFirstLine: boolean) => void
  onLastLineVisibilityChanged?: (visible: boolean) => void
  surfletComponent?: ComponentType<SvelteComponent>
  webSearchComponent?: ComponentType<SvelteComponent>
  onWebSearchCompleted?: (results: any, query: string) => void
  onLinkClick?: LinkClickHandler
  // Title node options
  enableTitleNode?: boolean
  titlePlaceholder?: string
  initialTitle?: string
  titleLoading?: boolean
  onTitleChange?: (title: string) => void
  // Link preview option
  enableLinkPreview?: boolean
}

const lowlight = createLowlight(all)

// match the > char followed by a space
const detailsRegex = /^\s*>\s$/

// match the | char followed by a space
const blockquoteRegex = /^\s*\|\s$/

export const createEditorExtensions = (opts?: ExtensionOptions) => [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3]
    },
    dropcursor: {
      color: 'var(--accent)',
      width: 2
    },
    codeBlock: false,
    blockquote: false
  }),
  ...conditionalArrayItem(
    !!opts?.enableTitleNode,
    TitleNode.configure({
      placeholder: opts?.titlePlaceholder || 'Untitled',
      initialTitle: opts?.initialTitle || '',
      onTitleChange: opts?.onTitleChange,
      isLoading: opts?.titleLoading || false
    })
  ),
  Mathematics.configure({
    regex: /\$\$([^$]+)\$\$|\$(?!\s)([^$\n]+)(?<!\s)\$/gi
  }),
  Underline,
  Link.configure({
    onClick: opts?.onLinkClick,
    protocols: ['surf'],
    HTMLAttributes: {
      target: '_blank'
    }
  }),
  CodeBlockLowlight.configure({
    lowlight
  }),
  Blockquote.extend({
    addInputRules() {
      return [
        wrappingInputRule({
          find: blockquoteRegex,
          type: this.type
        })
      ]
    }
  }),
  Details.configure({
    persist: true,
    HTMLAttributes: {
      class: 'details'
    }
  }).extend({
    addInputRules() {
      return [
        detailsInputRule({
          find: detailsRegex,
          type: this.type
        })
      ]
    }
  }),
  DetailsSummary,
  DetailsContent,
  Table.configure({
    resizable: true
  }),
  TableRow,
  TableHeader,
  TableCell,
  // TableAddRowColumn,
  Button.configure({
    onClick: opts?.buttonClick
  }),
  // UseAsDefaultBrowser,
  // OpenStuff,
  Placeholder.configure({
    placeholder: ({ node }) => {
      if (node.type.name === 'detailsSummary') {
        return 'Toggle'
      }

      if (node.type.name === 'titleNode') {
        return opts?.titlePlaceholder || 'Untitled'
      }

      return opts?.placeholder ?? "Write or type '/' for options…"
    }
  }),
  ...conditionalArrayItem(
    !opts?.disableHashtag,
    Hashtag.configure({
      suggestion: hashtagSuggestion
    })
  ),
  ...conditionalArrayItem(
    !!opts?.parseMentions,
    Mention.configure({
      HTMLAttributes: {
        class: 'mention'
      },
      suggestion: {
        ...mentionSuggestion,
        items: opts?.mentionItems
      },
      renderText({ options, node }) {
        return `${options.suggestion.char}${node.attrs.label ?? node.attrs.id}`
      },
      onClick: opts?.mentionClick,
      onInsert: opts?.mentionInsert,
      readOnly: opts?.readOnlyMentions
    })
  ),
  ...conditionalArrayItem(
    !!opts?.resourceComponent,
    Resource.configure({
      component: opts?.resourceComponent,
      preview: opts?.resourceComponentPreview
    })
  ),
  ...conditionalArrayItem(
    !!opts?.citationComponent,
    Citation.configure({
      component: opts?.citationComponent,
      onClick: opts?.citationClick
    })
  ),
  ...conditionalArrayItem(
    !!opts?.surfletComponent,
    Surflet.configure({
      component: opts?.surfletComponent
    })
  ),
  ...conditionalArrayItem(
    !!opts?.webSearchComponent,
    WebSearch.configure({
      component: opts?.webSearchComponent,
      onWebSearchCompleted: opts?.onWebSearchCompleted,
      onLinkClick: opts?.onLinkClick
    })
  ),
  ...conditionalArrayItem(!!opts?.showDragHandle, DragHandle),
  ...conditionalArrayItem(
    !!opts?.showSlashMenu,
    SlashExtension.configure({
      suggestion: {
        ...SlashSuggestion,
        command: ({
          props,
          editor,
          range
        }: {
          editor: Editor
          range: Range
          props: SlashCommandPayload
        }) => {
          const { item, query } = props
          if (item.command) {
            item.command(item, editor, {
              from: range.from,
              to: range.to + query.length
            })
          } else if (opts?.onSlashCommand) {
            editor
              .chain()
              .deleteRange({ from: range.from, to: range.to + query.length })
              .focus()
              .run()
            opts.onSlashCommand({ range, item, query })
          } else {
            console.error('No command found for slash item', props)
          }
        },
        items: opts?.slashItems
      }
    })
  ),
  TaskItem,
  TaskList.configure({
    HTMLAttributes: {
      class: 'extension-task-list'
    }
  }),
  ListKeymap,
  Loading,
  Thinking,
  TrailingNode,
  AIOutput,
  AIPrompt,
  AIGeneration,
  Image,
  ...conditionalArrayItem(!!opts?.enableLinkPreview, LinkPreview),
  Youtube.configure({
    controls: true,
    nocookie: true,
    allowFullscreen: true,
    autoplay: false,
    modestBranding: true
  }),
  Extension.create<{ pluginKey?: PluginKey }>({
    name: 'paste-handler',

    addProseMirrorPlugins() {
      const plugin = new Plugin({
        key: this.options.pluginKey,

        props: {
          handleDOMEvents: {
            paste(view, e) {
              const clipboardDataItems = Array.from(e.clipboardData?.items || [])
              const hasFiles = clipboardDataItems.some((item) => item.kind === 'file')

              // Check for HTML with images
              const htmlData = e.clipboardData?.getData('text/html')
              const hasHtmlImages = htmlData && htmlData.includes('<img')

              if (hasFiles || hasHtmlImages) {
                // Extract files immediately before clipboard data is cleared
                const files: File[] = []
                for (const item of clipboardDataItems) {
                  if (item.kind === 'file') {
                    const file = item.getAsFile()
                    if (file) {
                      files.push(file)
                    }
                  }
                }

                // Dispatch custom event with the files and HTML data
                if (files.length > 0 || hasHtmlImages) {
                  const customEvent = new CustomEvent('editor-file-paste', {
                    detail: { files, htmlData },
                    bubbles: true,
                    cancelable: true
                  })
                  view.dom.dispatchEvent(customEvent)

                  // Prevent default paste behavior
                  e.preventDefault()
                  return true
                }
              }
              return false
            }
          }
        }
      })

      return [plugin]
    }
  }),
  // Image drop handler - enables dropping images beside other images for side-by-side layout
  Extension.create<{ pluginKey?: PluginKey }>({
    name: 'image-drop-handler',

    addProseMirrorPlugins() {
      const plugin = new Plugin({
        key: new PluginKey('image-drop-handler'),

        props: {
          handleDrop(view, event, slice, moved) {
            // Only handle moved content (not new drops from outside)
            if (!moved || !slice) return false

            const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY })
            if (!dropPos) return false

            // Check if we're dropping an image resource
            let droppedImageNode = null
            for (let i = 0; i < slice.content.childCount; i++) {
              const node = slice.content.child(i)
              if (node.type.name === 'resource' && node.attrs.type?.startsWith('image/')) {
                droppedImageNode = node
                break
              }
            }

            if (!droppedImageNode) return false

            // Find the element under the cursor using DOM
            const target = event.target as HTMLElement
            const targetResource = target.closest('resource[data-type^="image/"]') as HTMLElement

            if (!targetResource) return false

            // Get the position of the target resource in the document
            const targetPos = view.posAtDOM(targetResource, 0)
            if (targetPos < 0) return false

            // Determine if we should insert before or after based on mouse position
            const rect = targetResource.getBoundingClientRect()
            const insertAfter = event.clientX > rect.left + rect.width / 2

            // Find the target node and calculate insert position
            const targetNode = view.state.doc.nodeAt(targetPos)
            if (!targetNode) return false

            // Calculate insertion position
            const insertPos = insertAfter ? targetPos + targetNode.nodeSize : targetPos

            // Find the original position of the dragged node by its ID
            const draggedNodeId = droppedImageNode.attrs.id
            let originalNodePos = -1
            let originalNodeSize = 0

            view.state.doc.descendants((node, pos) => {
              if (node.type.name === 'resource' && node.attrs.id === draggedNodeId) {
                originalNodePos = pos
                originalNodeSize = node.nodeSize
                return false // Stop searching
              }
              return true
            })

            if (originalNodePos < 0) return false

            // Get the target image ID from the DOM element
            const targetImageId = targetResource.getAttribute('data-id')

            // Don't do anything if dropping on the same image we're dragging
            if (targetImageId === draggedNodeId) return false

            // Check if this would be a no-op (image already at target position)
            const wouldBeNoOp =
              (!insertAfter && originalNodePos + originalNodeSize === targetPos) ||
              (insertAfter && originalNodePos === targetPos + targetNode.nodeSize)

            if (wouldBeNoOp) return false

            // Create transaction to move the image
            let tr = view.state.tr

            if (insertPos < originalNodePos) {
              // Inserting BEFORE the original position
              tr = tr.insert(insertPos, slice.content)
              const adjustedDeletePos = originalNodePos + slice.content.size
              tr = tr.delete(adjustedDeletePos, adjustedDeletePos + originalNodeSize)
            } else {
              // Inserting AFTER the original position
              tr = tr.delete(originalNodePos, originalNodePos + originalNodeSize)
              const adjustedInsertPos = insertPos - originalNodeSize
              tr = tr.insert(adjustedInsertPos, slice.content)
            }

            view.dispatch(tr)

            // After the transaction, apply side-by-side styling to both images
            // Use requestAnimationFrame to ensure DOM is updated after ProseMirror re-renders
            requestAnimationFrame(() => {
              // Find both images by their IDs and apply side-by-side styling
              const droppedElement = view.dom.querySelector(
                `resource[data-id="${draggedNodeId}"]`
              ) as HTMLElement
              const targetElement = view.dom.querySelector(
                `resource[data-id="${targetImageId}"]`
              ) as HTMLElement

              if (droppedElement) {
                droppedElement.style.display = 'inline-block'
                droppedElement.style.verticalAlign = 'top'
                droppedElement.style.maxWidth = '48%'
                droppedElement.style.margin = '0.25rem'
                droppedElement.classList.add('side-by-side')
              }

              if (targetElement) {
                targetElement.style.display = 'inline-block'
                targetElement.style.verticalAlign = 'top'
                targetElement.style.maxWidth = '48%'
                targetElement.style.margin = '0.25rem'
                targetElement.classList.add('side-by-side')
              }
            })

            return true
          },

          handleDOMEvents: {
            // Handle copy event to copy image to system clipboard for external apps
            copy(view, event) {
              // Check if a resource node is selected
              const { selection } = view.state
              const node =
                selection.$anchor.parent.type.name === 'resource'
                  ? selection.$anchor.parent
                  : view.state.doc.nodeAt(selection.from)

              if (node?.type.name === 'resource' && node.attrs.type?.startsWith('image/')) {
                // Get the image URL
                const imageId = node.attrs.id
                const imageUrl = `surf://surf/resource/${imageId}`

                // Call the preload API to copy image to clipboard
                if (typeof window !== 'undefined' && 'api' in window) {
                  // @ts-ignore
                  window.api.copyImageToClipboard?.(imageUrl)
                }

                // Allow default copy to also happen (so internal paste still works)
                return false
              }
              return false
            },
            dragover(view, event) {
              const target = event.target as HTMLElement

              // Find the closest resource element that is an image
              const imageResource = target.closest('resource[data-type^="image/"]') as HTMLElement

              // Remove previous drop indicators from all image resources (clear inline styles)
              view.dom.querySelectorAll('resource[data-type^="image/"]').forEach((el: Element) => {
                const htmlEl = el as HTMLElement
                htmlEl.style.borderLeft = ''
                htmlEl.style.borderRight = ''
              })

              if (imageResource) {
                const rect = imageResource.getBoundingClientRect()
                const isRightSide = event.clientX > rect.left + rect.width / 2

                // Apply inline styles directly - this bypasses any CSS issues
                if (isRightSide) {
                  imageResource.style.borderRight = '4px solid #3b82f6'
                } else {
                  imageResource.style.borderLeft = '4px solid #3b82f6'
                }
              }

              return false
            },
            dragleave(view, event) {
              const target = event.target as HTMLElement
              const imageResource = target.closest('resource[data-type^="image/"]') as HTMLElement
              if (imageResource) {
                imageResource.style.borderLeft = ''
                imageResource.style.borderRight = ''
              }
              return false
            },
            drop(view) {
              // Clean up drop indicators
              view.dom.querySelectorAll('resource[data-type^="image/"]').forEach((el: Element) => {
                const htmlEl = el as HTMLElement
                htmlEl.style.borderLeft = ''
                htmlEl.style.borderRight = ''
              })
              return false
            }
          }
        }
      })

      return [plugin]
    }
  })
]

const extensions = createEditorExtensions()

export const getEditorContentHTML = (content: JSONContent) => {
  return generateHTML(content, extensions)
}

export const getEditorContentJSON = (content: string) => {
  return generateJSON(content, extensions)
}

export const getEditorContentText = (content: string) => {
  const json = generateJSON(content, extensions)
  return generateText(json, extensions)
}

export type * from '@tiptap/core'
