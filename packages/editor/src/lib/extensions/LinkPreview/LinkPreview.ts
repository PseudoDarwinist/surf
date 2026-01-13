import { mergeAttributes, Node } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import LinkPreviewComponent from './LinkPreview.svelte'
import { fetchLinkMetadata } from './fetchLinkMetadata'
import { createClassComponent } from 'svelte/legacy'

export interface LinkPreviewOptions {
  /**
   * HTML attributes to apply to link preview nodes
   * @default {}
   */
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    linkPreview: {
      /**
       * Insert a link preview node
       * @param url The URL to create a preview for
       */
      setLinkPreview: (url: string) => ReturnType
    }
  }
}

// Regex to match standalone URLs
const URL_REGEX = /^(https?:\/\/[^\s<]+[^<.,:;"')\]\s])$/

/**
 * Checks if a string is a valid URL
 */
function isValidUrl(string: string): boolean {
  try {
    new URL(string)
    return true
  } catch {
    return false
  }
}

/**
 * Standalone function to fetch metadata and update a LinkPreview node
 */
function fetchAndUpdateLinkPreviewMetadata(editor: any, url: string, nodeName: string) {
  fetchLinkMetadata(url)
    .then((metadata) => {
      if (metadata && editor) {
        const { doc, tr } = editor.state
        let nodePos: number | null = null

        doc.descendants((node: any, pos: number) => {
          if (node.type.name === nodeName && node.attrs.url === url && node.attrs.loading) {
            nodePos = pos
            return false
          }
          return true
        })

        if (nodePos !== null) {
          const transaction = tr.setNodeMarkup(nodePos, undefined, {
            url,
            title: metadata.title,
            description: metadata.description,
            image: metadata.image,
            icon: metadata.icon,
            provider: metadata.provider,
            loading: false,
            error: false
          })
          editor.view.dispatch(transaction)
        }
      }
    })
    .catch(() => {
      if (editor) {
        const { doc, tr } = editor.state
        let nodePos: number | null = null

        doc.descendants((node: any, pos: number) => {
          if (node.type.name === nodeName && node.attrs.url === url && node.attrs.loading) {
            nodePos = pos
            return false
          }
          return true
        })

        if (nodePos !== null) {
          const transaction = tr.setNodeMarkup(nodePos, undefined, {
            url,
            loading: false,
            error: true
          })
          editor.view.dispatch(transaction)
        }
      }
    })
}

/**
 * LinkPreview extension for TipTap.
 * Renders rich preview cards for URLs pasted on their own line.
 */
export const LinkPreview = Node.create<LinkPreviewOptions>({
  name: 'linkPreview',

  priority: 1001, // Higher than Link extension (1000)

  addOptions() {
    return {
      HTMLAttributes: {}
    }
  },

  addAttributes() {
    return {
      url: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-url'),
        renderHTML: (attributes) => ({
          'data-url': attributes.url
        })
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-title'),
        renderHTML: (attributes) => ({
          'data-title': attributes.title
        })
      },
      description: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-description'),
        renderHTML: (attributes) => ({
          'data-description': attributes.description
        })
      },
      image: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-image'),
        renderHTML: (attributes) => ({
          'data-image': attributes.image
        })
      },
      icon: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-icon'),
        renderHTML: (attributes) => ({
          'data-icon': attributes.icon
        })
      },
      provider: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-provider'),
        renderHTML: (attributes) => ({
          'data-provider': attributes.provider
        })
      },
      loading: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-loading') === 'true',
        renderHTML: (attributes) => ({
          'data-loading': attributes.loading ? 'true' : 'false'
        })
      },
      error: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-error') === 'true',
        renderHTML: (attributes) => ({
          'data-error': attributes.error ? 'true' : 'false'
        })
      }
    }
  },

  group: 'block',
  inline: false,
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'div[data-link-preview]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-link-preview': ''
      })
    ]
  },

  addCommands() {
    return {
      setLinkPreview:
        (url: string) =>
        ({ commands, editor }) => {
          if (!isValidUrl(url)) {
            return false
          }

          // Insert the node with loading state
          const result = commands.insertContent({
            type: this.name,
            attrs: {
              url,
              loading: true,
              error: false
            }
          })

          // Fetch metadata asynchronously
          fetchAndUpdateLinkPreviewMetadata(editor, url, this.name)

          return result
        }
    }
  },

  addProseMirrorPlugins() {
    const extensionThis = this

    return [
      new Plugin({
        key: new PluginKey('linkPreviewPaste'),
        props: {
          handlePaste(view, event) {
            const clipboardData = event.clipboardData
            if (!clipboardData) return false

            const text = clipboardData.getData('text/plain').trim()

            // Only handle standalone URL pastes
            if (!URL_REGEX.test(text) || !isValidUrl(text)) {
              return false
            }

            // Check if pasting at the start of an empty paragraph or empty line
            const { state } = view
            const { selection } = state
            const { $from } = selection

            // Get the current node
            const currentNode = $from.parent

            // Only create preview if:
            // 1. Current node is empty OR
            // 2. Selection is at start of node and node content equals/is about to be replaced
            const isEmptyParagraph = currentNode.isTextblock && currentNode.textContent.length === 0
            const isAtStartOfNode = $from.parentOffset === 0

            if (!isEmptyParagraph && !isAtStartOfNode) {
              // Not a standalone paste, let Link extension handle it
              return false
            }

            // Prevent default paste behavior
            event.preventDefault()

            // Insert LinkPreview node
            const linkPreviewType = state.schema.nodes.linkPreview
            if (!linkPreviewType) {
              console.error('LinkPreview node type not found in schema')
              return false
            }

            const node = linkPreviewType.create({
              url: text,
              loading: true,
              error: false
            })

            // Replace the current empty paragraph with the LinkPreview node
            const tr = state.tr.replaceSelectionWith(node)
            view.dispatch(tr)

            // Fetch metadata using the standalone function
            const editor = extensionThis.editor
            fetchAndUpdateLinkPreviewMetadata(editor, text, extensionThis.name)

            return true
          }
        }
      })
    ]
  },

  addNodeView() {
    return ({ node, editor }) => {
      const container = document.createElement('div')
      container.setAttribute('data-link-preview', '')
      container.setAttribute('data-url', node.attrs.url || '')
      container.contentEditable = 'false'

      const component = createClassComponent({
        component: LinkPreviewComponent,
        target: container,
        props: {
          url: node.attrs.url,
          title: node.attrs.title,
          description: node.attrs.description,
          image: node.attrs.image,
          icon: node.attrs.icon,
          provider: node.attrs.provider,
          loading: node.attrs.loading,
          error: node.attrs.error
        }
      })

      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type.name !== this.name) {
            return false
          }

          // Update component props
          component.$set({
            url: updatedNode.attrs.url,
            title: updatedNode.attrs.title,
            description: updatedNode.attrs.description,
            image: updatedNode.attrs.image,
            icon: updatedNode.attrs.icon,
            provider: updatedNode.attrs.provider,
            loading: updatedNode.attrs.loading,
            error: updatedNode.attrs.error
          })

          return true
        },
        destroy: () => {
          component.$destroy()
        }
      }
    }
  }
})
