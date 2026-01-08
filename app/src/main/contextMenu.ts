import contextMenu from 'electron-context-menu'
import { ipcSenders } from './ipcHandlers'
import { getCachedSpaces } from './spaces'
import { clipboard, dialog, nativeImage, net, type MenuItemConstructorOptions } from 'electron'
import { SpaceBasicData } from '@deta/services/ipc'
import { conditionalArrayItem } from '@deta/utils/data'
import { writeFile } from 'fs/promises'
import path from 'path'

// Helper to fetch image from surf:// protocol and return as NativeImage
const fetchSurfImage = async (url: string): Promise<Electron.NativeImage | null> => {
  try {
    const response = await net.fetch(url)
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    return nativeImage.createFromBuffer(buffer)
  } catch (err) {
    console.error('Failed to fetch surf image:', err)
    return null
  }
}

// Helper to copy image to clipboard
const copyImageToClipboard = async (url: string) => {
  const image = await fetchSurfImage(url)
  if (image) {
    clipboard.writeImage(image)
  }
}

// Helper to save image to file
const saveImageToFile = async (url: string, defaultName: string = 'image.png') => {
  const image = await fetchSurfImage(url)
  if (!image) return

  const { filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
  })

  if (filePath) {
    const ext = path.extname(filePath).toLowerCase()
    let buffer: Buffer
    if (ext === '.jpg' || ext === '.jpeg') {
      buffer = image.toJPEG(90)
    } else {
      buffer = image.toPNG()
    }
    await writeFile(filePath, buffer)
  }
}

const createSpaceAction = (space: SpaceBasicData, handler: () => void) => {
  return {
    label: space.name,
    click: handler
  } as Electron.MenuItemConstructorOptions
}

const createSpaceActions = (
  pinnedSpaces: SpaceBasicData[],
  unpinnedSpaces: SpaceBasicData[],
  handler: (space: SpaceBasicData) => void
) => {
  return [
    ...pinnedSpaces.map((space) => createSpaceAction(space, () => handler(space))),
    ...conditionalArrayItem<Electron.MenuItemConstructorOptions>(pinnedSpaces.length > 0, {
      type: 'separator'
    }),
    {
      label: 'More Contexts',
      submenu: unpinnedSpaces.map((space) => createSpaceAction(space, () => handler(space)))
    }
  ]
}

export function setupContextMenu(window: Electron.WebContents, options: contextMenu.Options = {}) {
  const defaultOpts: contextMenu.Options = {
    showSearchWithGoogle: false,
    showSaveImage: true,
    showSaveVideo: true,
    showCopyImage: true,
    showCopyImageAddress: true,
    showCopyLink: false,
    showCopyVideoAddress: true,
    showInspectElement: true,
    prepend: (defaultActions, parameters) => {
      const spaces = getCachedSpaces()

      let saveToSpaceItems: MenuItemConstructorOptions[] = []

      const pinnedSpaces = spaces.filter((space) => space.pinned)
      const unpinnedSpaces = spaces.filter((space) => !space.pinned && !space.linked)

      if (pinnedSpaces.length > 0) {
        saveToSpaceItems = createSpaceActions(pinnedSpaces, unpinnedSpaces, (space) => {
          ipcSenders.saveLink(parameters.linkURL, space.id)
        })
      } else {
        saveToSpaceItems = spaces.map((space) =>
          createSpaceAction(space, () => {
            ipcSenders.saveLink(parameters.linkURL, space.id)
          })
        )
      }

      // Check if we're right-clicking on a surf:// image
      // Note: mediaType might not be 'image' for custom protocols, so also check srcURL directly
      const isSurfImage =
        parameters.srcURL?.startsWith('surf://') &&
        (parameters.mediaType === 'image' || parameters.srcURL.includes('/resource/'))

      // Debug logging
      console.log('[ContextMenu] parameters:', {
        mediaType: parameters.mediaType,
        srcURL: parameters.srcURL,
        isSurfImage
      })

      return [
        // Custom handlers for surf:// images (since electron-context-menu doesn't handle custom protocols well)
        {
          label: 'Copy Image',
          visible: isSurfImage,
          click: () => {
            copyImageToClipboard(parameters.srcURL)
          }
        },
        {
          label: 'Save Image As...',
          visible: isSurfImage,
          click: () => {
            // Extract filename from URL if possible
            const urlParts = parameters.srcURL.split('/')
            const resourceId = urlParts[urlParts.length - 1]?.split('?')[0] || 'image'
            saveImageToFile(parameters.srcURL, `${resourceId}.png`)
          }
        },
        {
          label: 'Copy Image Address',
          visible: isSurfImage,
          click: () => {
            clipboard.writeText(parameters.srcURL)
          }
        },
        ...conditionalArrayItem<MenuItemConstructorOptions>(isSurfImage, { type: 'separator' }),
        {
          label: 'Open in New Tab',
          visible: parameters.linkURL.length > 0,
          click: () => {
            ipcSenders.openURL(parameters.linkURL, false)
          }
        },
        {
          label: 'Open in Sidebar',
          visible: parameters.linkURL.length > 0,
          click: () => {
            const webContentsId = window.id

            ipcSenders.newWindowRequest({
              url: parameters.linkURL,
              disposition: 'new-window',
              webContentsId: webContentsId
            })
          }
        },
        defaultActions.separator(),
        {
          label: 'Save Link',
          visible: parameters.linkURL.length > 0,
          click: () => {
            ipcSenders.saveLink(parameters.linkURL)
          }
        },
        {
          label: 'Save Link to Notebook',
          visible: parameters.linkURL.length > 0,
          submenu: saveToSpaceItems
        },
        defaultActions.copyLink({}),
        defaultActions.separator(),
        {
          label: 'Search Google for “{selection}”',
          visible: parameters.selectionText.trim().length > 0,
          click: () => {
            ipcSenders.openURL(
              `https://google.com/search?q=${encodeURIComponent(parameters.selectionText)}`,
              true
            )
          }
        },
        {
          label: 'Search Perplexity for "{selection}"',
          visible: parameters.selectionText.trim().length > 0,
          click: () => {
            ipcSenders.openURL(
              `https://www.perplexity.ai/?q=${encodeURIComponent(parameters.selectionText)}`,
              true
            )
          }
        },
        defaultActions.separator(),
        {
          label: 'Ask Surf about "{selection}"',
          visible: parameters.selectionText.trim().length > 0,
          click: () => {
            console.log('[ContextualChat] Context menu item clicked')
            console.log('[ContextualChat] selectionText:', parameters.selectionText)
            console.log('[ContextualChat] titleText:', parameters.titleText)
            console.log('[ContextualChat] pageURL:', parameters.pageURL)
            ipcSenders.showContextualChat({
              selectedText: parameters.selectionText,
              pageTitle: parameters.titleText || '',
              pageUrl: parameters.pageURL || ''
            })
          }
        }
      ]
    }
  }

  const opts = Object.assign(defaultOpts, { window }, options)
  return contextMenu(opts)
}

export function attachContextMenu(window: Electron.WebContents) {
  return setupContextMenu(window)
}
