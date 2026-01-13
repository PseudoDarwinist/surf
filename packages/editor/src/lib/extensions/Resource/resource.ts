import { mergeAttributes, Node } from '@tiptap/core'
import ResourceComp from './Resource.svelte'
import type { ComponentType, SvelteComponent } from 'svelte'
import { createClassComponent } from 'svelte/legacy'

export interface ResourceOptions {
  /**
   * The HTML attributes for a resource node.
   * @default {}
   * @example { class: 'foo' }
   */
  HTMLAttributes: Record<string, any>

  component: ComponentType<SvelteComponent>

  preview: boolean
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resource: {
      /**
       * Toggle a resource node
       * @example editor.commands.toggleResource()
       */
      setResource: () => ReturnType
    }
  }
}

/**
 * This extension allows you to create resource nodes
 */
export const Resource = Node.create<ResourceOptions>({
  name: 'resource',

  priority: 1000,

  addOptions() {
    return {
      HTMLAttributes: {},
      component: ResourceComp,
      preview: false
    }
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('id'),
        renderHTML: (attributes) => {
          if (!attributes.id) {
            return {}
          }

          return {
            id: attributes.id
          }
        }
      },
      type: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-type'),
        renderHTML: (attributes) => {
          if (!attributes.type) {
            return {}
          }

          return {
            'data-type': attributes.type
          }
        }
      },
      expanded: {
        default: undefined,
        parseHTML: (element) => element.getAttribute('data-expanded') === 'true',
        renderHTML: (attributes) => {
          return {
            'data-expanded': attributes.expanded ? 'true' : undefined
          }
        }
      }
    }
  },

  group: 'block',
  inline: false,
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'resource' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['resource', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
  },

  addNodeView() {
    return ({ node, editor }) => {
      const container = document.createElement('resource')
      const isImage = node.attrs.type?.startsWith('image/')

      // Set the HTML attributes
      Object.entries(node.attrs).forEach(([key, value]) => {
        container.setAttribute(`data-${key}`, `${value}`)
      })

      // Add class for image resources - default is full-width block display
      // Side-by-side layout (48% width) is only applied when explicitly set via drag-drop
      if (isImage) {
        container.classList.add('image-resource')
        // Default: full width, block display
        container.style.display = 'block'
        container.style.maxWidth = '100%'
        container.style.margin = '0.25rem auto'
        container.style.boxSizing = 'border-box'
      }

      const component = createClassComponent({
        component: this.options.component,
        target: container,
        props: {
          id: node.attrs.id,
          type: node.attrs.type,
          preview: this.options.preview,
          expanded: node.attrs.expanded,
          isEditable: editor.isEditable
        }
      })

      return {
        dom: container,
        destroy: () => {
          component.$destroy()
        }
      }
    }
  },

  addCommands() {
    return {
      setResource:
        () =>
        ({ commands }) => {
          return commands.setNode(this.name)
        }
    }
  }
})
