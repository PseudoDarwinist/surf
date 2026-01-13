import { isMac } from '@deta/utils/system'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  session
} from 'electron'
import path from 'path'
import { setAdblockerState, getAdblockerState } from './adblocker'
import { getMainWindow, getWebContentsViews } from './mainWindow'
import { getUserConfig, updateUserConfig, updateUserConfigSettings } from './config'
import { handleDragStart } from './drag'
import {
  BrowserType,
  ElectronAppInfo,
  RightSidebarTab,
  SFFSResource,
  UserSettings
} from '@deta/types'
import { getPlatform, isPathSafe, isDefaultBrowser } from './utils'
import { writeFile } from 'fs/promises'
import { updateTabOrientationMenuItem } from './appMenu'
import { createSettingsWindow, getSettingsWindow } from './settingsWindow'

import { IPC_EVENTS_MAIN, NewWindowRequest } from '@deta/services/ipc'
import { exportResource, openResourceAsFile } from './downloadManager'
import { getAppMenu } from './appMenu'

import fs from 'fs/promises'
import tokenManager from './token'
import { updateCachedSpaces } from './spaces'
import { useLogScope } from '@deta/utils'
import { initClaudeAgentIPC } from './claudeAgent'

const log = useLogScope('IpcHandlers')

// let prompts: EditablePrompt[] = []

export function setupIpc(backendRootPath: string) {
  setupIpcHandlers(backendRootPath)
  initClaudeAgentIPC() // Initialize Claude Agent SDK IPC handlers

  // IPC handler for fetching HTML without CORS restrictions (runs in main process)
  ipcMain.handle('fetch-html-from-url', async (_event, url: string) => {
    try {
      log.debug('Fetching HTML from URL (main process):', url)
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`)
      }

      return await response.text()
    } catch (error) {
      log.error('Failed to fetch HTML from URL:', error)
      throw error
    }
  })

  // IPC handler for showing image context menu (for surf:// protocol images)
  ipcMain.on(
    'show-image-context-menu',
    async (event, { imageUrl, x, y }: { imageUrl: string; x: number; y: number }) => {
      if (!validateIPCSender(event)) return

      const fetchImage = async (url: string): Promise<Electron.NativeImage | null> => {
        try {
          const response = await net.fetch(url)
          if (!response.ok) return null
          const buffer = Buffer.from(await response.arrayBuffer())
          return nativeImage.createFromBuffer(buffer)
        } catch (err) {
          log.error('Failed to fetch image for context menu:', err)
          return null
        }
      }

      const menu = Menu.buildFromTemplate([
        {
          label: 'Copy Image',
          click: async () => {
            const image = await fetchImage(imageUrl)
            if (image) {
              clipboard.writeImage(image)
            }
          }
        },
        {
          label: 'Save Image As...',
          click: async () => {
            const image = await fetchImage(imageUrl)
            if (!image) return

            // Extract resource ID from URL for default filename
            const urlParts = imageUrl.split('/')
            const resourceId = urlParts[urlParts.length - 1]?.split('?')[0] || 'image'

            const { filePath } = await dialog.showSaveDialog({
              defaultPath: `${resourceId}.png`,
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
        },
        {
          label: 'Copy Image Address',
          click: () => {
            clipboard.writeText(imageUrl)
          }
        }
      ])

      menu.popup({ x, y })
    }
  )

  // IPC handler for copying image to system clipboard (for Cmd+C to work with external apps)
  ipcMain.on('copy-image-to-clipboard', async (event, imageUrl: string) => {
    if (!validateIPCSender(event)) return

    try {
      const response = await net.fetch(imageUrl)
      if (!response.ok) {
        log.error('Failed to fetch image for clipboard:', response.status)
        return
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      const image = nativeImage.createFromBuffer(buffer)
      clipboard.writeImage(image)
      log.debug('Image copied to clipboard:', imageUrl)
    } catch (err) {
      log.error('Failed to copy image to clipboard:', err)
    }
  })
}

// Make sure the sender is one of the main windows (main, settings, setup) to prevent spoofing of messages from other windows (very unlikely but still recommended)
export const validateIPCSender = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => {
  const validIDs: number[] = []
  const mainWindow = getMainWindow()
  const settingsWindow = getSettingsWindow()

  if (!mainWindow) {
    log.warn('Main window not found')
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    validIDs.push(mainWindow.webContents.id)
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    validIDs.push(settingsWindow.webContents.id)
  }

  if (
    event.senderFrame?.url.startsWith('surf://surf/resource/') ||
    event.senderFrame?.url.startsWith('surf://surf/notebook')
  ) {
    validIDs.push(event.sender.id)
  }

  if (!validIDs.includes(event.sender.id)) {
    log.warn('Invalid sender:', event.senderFrame?.url)
    return false
  }

  return true
}

function setupIpcHandlers(backendRootPath: string) {
  IPC_EVENTS_MAIN.tokenCreate.handle(async (event, data) => {
    if (!validateIPCSender(event)) return null
    return tokenManager.create(data)
  })

  IPC_EVENTS_MAIN.webviewReadResourceData.handle(async (_, { token, resourceId }) => {
    if (!tokenManager.verify(token, resourceId)) return null
    tokenManager.revoke(token)

    let fileHandle: fs.FileHandle | null = null

    try {
      const base_path = path.join(app.getPath('userData'), 'sffs_backend', 'resources')
      const resource_path = path.join(base_path, resourceId)
      if (!isPathSafe(base_path, resource_path)) return null
      fileHandle = await fs.open(resource_path, 'r')

      const stats = await fileHandle.stat()
      const buffer = Buffer.alloc(stats.size)
      await fileHandle.read(buffer, 0, stats.size, 0)

      return buffer
    } catch (error) {
      log.log('failed to read resource file', error)
      return null
    } finally {
      if (fileHandle) {
        await fileHandle.close().catch(() => {})
      }
    }
  })

  IPC_EVENTS_MAIN.showAppMenuPopup.on((event, _) => {
    if (!validateIPCSender(event)) return
    getAppMenu()?.popup()
  })

  IPC_EVENTS_MAIN.setAdblockerState.on(async (event, { partition, state }) => {
    if (!validateIPCSender(event)) return

    setAdblockerState(partition, state)
  })

  IPC_EVENTS_MAIN.getAdblockerState.handle(async (event, partition) => {
    if (!validateIPCSender(event)) return null

    return getAdblockerState(partition)
  })

  IPC_EVENTS_MAIN.captureWebContents.handle(async (event) => {
    if (!validateIPCSender(event)) return null

    const window = getMainWindow()
    if (!window) return null

    const PADDING = 40
    const rect = window.getContentBounds()
    const image = await window.webContents.capturePage({
      ...rect,
      x: 0,
      y: PADDING
    })
    return image.toDataURL()
  })

  IPC_EVENTS_MAIN.showOpenDialog.handle(async (event, options) => {
    if (!validateIPCSender(event)) return null

    const window = getMainWindow()
    if (!window) return null

    const result = await dialog.showOpenDialog(window, options)
    if (result.canceled) return null
    return result.filePaths
  })

  IPC_EVENTS_MAIN.restartApp.on((event) => {
    if (!validateIPCSender(event)) return

    app.relaunch()
    app.exit()
  })

  IPC_EVENTS_MAIN.updateTrafficLights.on((event, visible) => {
    if (!validateIPCSender(event)) return

    if (isMac()) {
      const window = getMainWindow()
      window?.setWindowButtonVisibility(visible)
    }
  })

  IPC_EVENTS_MAIN.controlWindow.on((event, action) => {
    if (!validateIPCSender(event)) return

    const window = getMainWindow()
    if (!window) return

    if (action === 'minimize') {
      window.minimize()
    } else if (action === 'toggle-maximize') {
      window.isMaximized() ? window.unmaximize() : window.maximize()
    } else if (action === 'close') {
      window.close()
    } else {
      log.error('Invalid action', action)
    }
  })

  IPC_EVENTS_MAIN.openSettings.on((event, tab) => {
    if (!validateIPCSender(event)) return

    createSettingsWindow(tab)
  })

  IPC_EVENTS_MAIN.screenshotPage.handle(async (event, rect) => {
    if (!validateIPCSender(event)) return null

    const window = getMainWindow()
    if (!window) return null

    const image = await window.webContents.capturePage(rect)
    return image.toDataURL()
  })

  IPC_EVENTS_MAIN.getUserConfig.handle(async (event) => {
    if (!validateIPCSender(event)) return null

    return getUserConfig()
  })

  IPC_EVENTS_MAIN.startDrag.on(async (event, { resourceId, filePath, fileType }) => {
    if (!validateIPCSender(event)) return

    log.debug('Start drag', resourceId, filePath, fileType)
    const sender = event.sender
    await handleDragStart(sender, resourceId, filePath, fileType)
  })

  IPC_EVENTS_MAIN.updateUserConfigSettings.on(async (event, settings) => {
    if (!validateIPCSender(event)) return

    const updatedSettings = updateUserConfigSettings(settings)

    // Update menu items if tab orientation changed
    if (settings.tabs_orientation) {
      updateTabOrientationMenuItem()
    }

    // notify other windows of the change
    ipcSenders.userConfigSettingsChange(updatedSettings)
  })

  IPC_EVENTS_MAIN.updateUserConfig.on(async (event, config) => {
    if (!validateIPCSender(event)) return

    updateUserConfig(config)
  })

  IPC_EVENTS_MAIN.updateInitializedTabs.on(async (event, value) => {
    if (!validateIPCSender(event)) return

    updateUserConfig({ initialized_tabs: value })
  })

  IPC_EVENTS_MAIN.getAppInfo.handle(async (event) => {
    if (!validateIPCSender(event)) return null

    return {
      version: process.env.APP_VERSION ?? app.getVersion(),
      platform: getPlatform()
    } as ElectronAppInfo
  })

  IPC_EVENTS_MAIN.interceptRequestHeaders.handle((event, { urls, partition }) => {
    if (!validateIPCSender(event)) return null

    const filter = {
      urls: urls
    }

    const webRequest = session.fromPartition(partition).webRequest

    const cleanup = () => webRequest.onBeforeSendHeaders(null)

    return new Promise((resolve, reject) => {
      let timeout

      webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        log.debug('Request intercepted:', details)

        callback({})
        cleanup()
        clearTimeout(timeout)
        resolve({ url: details.url, headers: details.requestHeaders })
      })

      timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Request interception timed out'))
      }, 20000)
    })
  })

  IPC_EVENTS_MAIN.isDefaultBrowser.handle((event) => {
    if (!validateIPCSender(event)) return null

    return isDefaultBrowser()
  })

  IPC_EVENTS_MAIN.setPrompts.on((event, prompts) => {
    if (!validateIPCSender(event)) return

    const window = getSettingsWindow()
    if (!window) {
      log.error('Settings window not found')
      return
    }

    IPC_EVENTS_MAIN.setPrompts.sendToWebContents(window.webContents, prompts)
  })

  IPC_EVENTS_MAIN.requestPrompts.on((event) => {
    if (!validateIPCSender(event)) return

    ipcSenders.getPrompts()
  })

  IPC_EVENTS_MAIN.resetPrompt.on((event, id) => {
    if (!validateIPCSender(event)) return

    ipcSenders.resetPrompt(id)
  })

  IPC_EVENTS_MAIN.openURL.on((event, { url, active, scopeId }) => {
    if (!validateIPCSender(event)) return
    ipcSenders.openURL(url, active, scopeId)
  })

  IPC_EVENTS_MAIN.openInvitePage.on((event) => {
    if (!validateIPCSender(event)) return
    ipcSenders.openInvitePage()
  })

  IPC_EVENTS_MAIN.updatePrompt.on((event, { id, content }) => {
    if (!validateIPCSender(event)) return

    ipcSenders.updatePrompt(id, content)
  })

  IPC_EVENTS_MAIN.openResourceLocally.on((event, resourceId: string) => {
    if (!validateIPCSender(event)) return

    try {
      const basePath = path.join(backendRootPath, 'resources')
      openResourceAsFile(resourceId, basePath)
    } catch (error) {
      log.error('Error opening resource file:', error)
    }
  })

  IPC_EVENTS_MAIN.exportResource.on((event, resourceId: string) => {
    if (!validateIPCSender(event)) return

    try {
      const basePath = path.join(backendRootPath, 'resources')
      exportResource(resourceId, basePath)
    } catch (error) {
      log.error('Error opening resource file:', error)
    }
  })

  IPC_EVENTS_MAIN.resetBackgroundImage.on((event) => {
    if (!validateIPCSender(event)) return

    ipcSenders.resetBackgroundImage()
  })

  IPC_EVENTS_MAIN.updateSpacesList.on((event, data) => {
    if (!validateIPCSender(event)) return

    updateCachedSpaces(data)
  })

  IPC_EVENTS_MAIN.updateViewBounds.on((event, { viewId, bounds }) => {
    if (!validateIPCSender(event)) return

    ipcSenders.updateViewBounds(viewId, bounds)
  })

  IPC_EVENTS_MAIN.focusMainRenderer.on((_) => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return []
    }
    window.webContents.focus()
    return true
  })

  // Document conversion IPC handlers for My Library feature
  ipcMain.handle(
    'document:convert',
    async (event, filePath: string, options?: { useLLM?: boolean; forceOCR?: boolean }) => {
      if (!validateIPCSender(event)) return null

      const { getDocumentConverter } = await import('./documentConverter')
      const converter = getDocumentConverter()

      return converter.convert(filePath, options, (progress) => {
        event.sender.send('document:convert-progress', progress)
      })
    }
  )

  ipcMain.handle('document:check-marker', async (event) => {
    console.log('[IPC] document:check-marker called from:', event.senderFrame?.url)

    if (!validateIPCSender(event)) {
      console.log('[IPC] document:check-marker - sender validation failed!')
      return null
    }

    console.log('[IPC] document:check-marker - calling converter.checkMarkerInstalled()')
    const { getDocumentConverter } = await import('./documentConverter')
    const converter = getDocumentConverter()

    const result = await converter.checkMarkerInstalled()
    console.log('[IPC] document:check-marker result:', result)
    return result
  })

  // Read a file as base64 - used for importing extracted images into SFFS
  ipcMain.handle('file:read-base64', async (event, filePath: string) => {
    if (!validateIPCSender(event)) return null

    try {
      // Security: only allow reading from temp/userData directories
      const userData = app.getPath('userData')
      const temp = app.getPath('temp')

      if (
        !filePath.startsWith(userData) &&
        !filePath.startsWith(temp) &&
        !filePath.startsWith('/var/folders')
      ) {
        console.warn('[IPC] file:read-base64 - path not allowed:', filePath)
        return null
      }

      const buffer = await fs.readFile(filePath)
      return buffer.toString('base64')
    } catch (error) {
      console.error('[IPC] file:read-base64 error:', error)
      return null
    }
  })
}

export const ipcSenders = {
  openCheatSheet: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.openCheatSheet.sendToWebContents(window.webContents)
  },

  openChangelog: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.openChangelog.sendToWebContents(window.webContents)
  },

  openInvitePage: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.openInvitePage.sendToWebContents(window.webContents)
  },

  openFeedbackPage: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.openFeedbackPage.sendToWebContents(window.webContents)
  },

  openWelcomePage: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.openWelcomePage.sendToWebContents(window.webContents)
  },

  openShortcutsPage: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.openShortcutsPage.sendToWebContents(window.webContents)
  },

  openImporter: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.openImporter.sendToWebContents(window.webContents)
  },

  browserFocusChanged: (state: 'focused' | 'unfocused') => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.browserFocusChange.sendToWebContents(window.webContents, { state })
  },

  adBlockChanged: (partition: string, state: boolean) => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.adBlockerStateChange.sendToWebContents(window.webContents, { partition, state })
  },

  getPrompts: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.requestPrompts.sendToWebContents(window.webContents)
  },

  resetPrompt: (id: string) => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.resetPrompt.sendToWebContents(window.webContents, id)
  },

  updatePrompt: (id: string, content: string) => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.updatePrompt.sendToWebContents(window.webContents, { id, content })
  },

  toggleSidebar: (visible?: boolean) => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.toggleSidebar.sendToWebContents(window.webContents, visible)
  },

  toggleTabsPosition: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.toggleTabsPosition.sendToWebContents(window.webContents)
  },

  toggleTheme: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.toggleTheme.sendToWebContents(window.webContents)
  },

  copyActiveTabURL: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.copyActiveTabUrl.sendToWebContents(window.webContents)
  },

  createNewTab: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.createNewTab.sendToWebContents(window.webContents)
  },

  closeActiveTab: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.closeActiveTab.sendToWebContents(window.webContents)
  },

  openOasis: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.openOasis.sendToWebContents(window.webContents)
  },

  startScreenshotPicker: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.startScreenshotPicker.sendToWebContents(window.webContents)
  },

  extensionModeChange: (mode: 'horizontal' | 'vertical') => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.extensionModeChange.sendToWebContents(window.webContents, mode)
  },

  openHistory: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.openHistory.sendToWebContents(window.webContents)
  },

  toggleRightSidebar: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.toggleRightSidebar.sendToWebContents(window.webContents)
  },

  toggleRightSidebarTab: (tab: RightSidebarTab) => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.toggleRightSidebarTab.sendToWebContents(window.webContents, tab)
  },

  reloadActiveTab: (force = false) => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.reloadActiveTab.sendToWebContents(window.webContents, force)
  },

  openDevTools: () => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.openDevTools.sendToWebContents(window.webContents)
  },

  openURL: (url: string, active: boolean, scopeId?: string) => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.openURL.sendToWebContents(window.webContents, { url, active, scopeId })
  },

  newWindowRequest: (details: NewWindowRequest) => {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.newWindowRequest.sendToWebContents(window.webContents, {
      url: details.url,
      disposition: details.disposition,
      webContentsId: details.webContentsId
    })
  },

  userConfigSettingsChange(settings: UserSettings) {
    // const window = getMainWindow()
    // if (!window) {
    //   log.error('Main window not found')
    //   return
    // }

    // notify all windows
    const webContentViews = getWebContentsViews()
    const windows = [getMainWindow(), getSettingsWindow(), ...webContentViews]
    windows.forEach((window) => {
      if (
        !window ||
        (window instanceof BrowserWindow ? window.isDestroyed() : window.webContents.isDestroyed())
      )
        return

      IPC_EVENTS_MAIN.userConfigSettingsChange.sendToWebContents(window.webContents, settings)
    })
  },

  resetBackgroundImage() {
    const mainWindow = getMainWindow()
    if (!mainWindow) return
    IPC_EVENTS_MAIN.resetBackgroundImage.sendToWebContents(mainWindow.webContents)
  },

  importedFiles(files: string[]) {
    const mainWindow = getMainWindow()
    if (!mainWindow) return
    IPC_EVENTS_MAIN.importedFiles.sendToWebContents(mainWindow.webContents, files)
  },

  importBrowserHistory(type: BrowserType) {
    const mainWindow = getMainWindow()
    if (!mainWindow) return
    IPC_EVENTS_MAIN.importBrowserHistory.sendToWebContents(mainWindow.webContents, type)
  },

  importBrowserBookmarks(type: BrowserType) {
    const mainWindow = getMainWindow()
    if (!mainWindow) return
    IPC_EVENTS_MAIN.importBrowserBookmarks.sendToWebContents(mainWindow.webContents, type)
  },

  saveLink(url: string, spaceId?: string) {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.saveLink.sendToWebContents(window.webContents, { url, spaceId })
  },

  updateViewBounds(viewId: string, bounds: Electron.Rectangle) {
    const window = getMainWindow()
    if (!window) {
      log.error('Main window not found')
      return
    }

    IPC_EVENTS_MAIN.updateViewBounds.sendToWebContents(window.webContents, { viewId, bounds })
  },

  showContextualChat(data: { selectedText: string; pageTitle: string; pageUrl: string }) {
    log.log('[ContextualChat] showContextualChat called with data:', data)
    const window = getMainWindow()
    if (!window) {
      log.error('[ContextualChat] Main window not found')
      return
    }

    log.log('[ContextualChat] Sending IPC to renderer...')
    IPC_EVENTS_MAIN.showContextualChat.sendToWebContents(window.webContents, data)
    log.log('[ContextualChat] IPC sent successfully')
  }
}
