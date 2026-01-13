import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

import {
  type UserSettings,
  WebContentsViewAction,
  WebContentsViewManagerActionType,
  WebContentsViewManagerActionPayloads,
  WebContentsViewActionPayloads,
  WebContentsViewActionType,
  WebContentsViewManagerAction,
  WebContentsViewManagerActionOutputs,
  WebContentsViewActionOutputs,
  type WebViewSendEvents,
  WebViewEventSendNames,
  WebContentsViewEvent,
  RendererType,
  type SettingsWindowTab
} from '@deta/types'
import {
  IPC_EVENTS_RENDERER,
  setupMessagePortClient,
  type ShowOpenDialog
} from '@deta/services/ipc'
import type { MessagePortCallbackClient } from '@deta/services/messagePort'

import { getUserConfig } from '../main/config'
import { initBackend } from './helpers/backend'
import { ipcRenderer } from 'electron'

import path from 'path'
import mime from 'mime-types'
import { promises as fsp } from 'fs'

const USER_DATA_PATH =
  process.argv.find((arg) => arg.startsWith('--userDataPath='))?.split('=')[1] ?? ''
const userConfig = getUserConfig(USER_DATA_PATH) // getConfig<UserConfig>(USER_DATA_PATH, 'user.json')

const PDFViewerEntryPoint =
  process.argv.find((arg) => arg.startsWith('--pdf-viewer-entry-point='))?.split('=')[1] || ''
const SettingsWindowEntrypoint =
  process.argv.find((arg) => arg.startsWith('--settings-window-entry-point='))?.split('=')[1] || ''

const messagePort = setupMessagePortClient()

const eventHandlers = {
  onOpenDevtools: (callback: () => void) => {
    return IPC_EVENTS_RENDERER.openDevTools.on((_) => {
      try {
        callback()
      } catch (error) {
        // noop
      }
    })
  },

  onUserConfigSettingsChange: (callback: (settings: UserSettings) => void) => {
    return IPC_EVENTS_RENDERER.userConfigSettingsChange.on((_, settings) => {
      try {
        userConfig.settings = settings
        callback(settings)
      } catch (error) {
        // noop
      }
    })
  },

  onWebContentsViewEvent: (callback: (event: WebContentsViewEvent) => void) => {
    return IPC_EVENTS_RENDERER.webContentsViewEvent.on((_, event) => {
      try {
        callback(event)
      } catch (error) {
        // noop
      }
    })
  },

  onToggleNotebookSidebar: (callback: (data: { open: boolean }) => void) => {
    return IPC_EVENTS_RENDERER.toggleNotebookSidebar.on((_, data) => {
      try {
        callback(data)
      } catch (error) {
        // noop
      }
    })
  },

  onMessagePort: (callback: MessagePortCallbackClient) => {
    messagePort.onMessage(callback)
  }
}

const api = {
  SettingsWindowEntrypoint: SettingsWindowEntrypoint,
  PDFViewerEntryPoint: PDFViewerEntryPoint,

  postMessageToView(payload: any) {
    messagePort.postMessage(payload)
  },

  getUserConfig: () => userConfig,

  restartApp: () => {
    IPC_EVENTS_RENDERER.restartApp.send()
  },

  startDrag: (resourceId: string, filePath: string, fileType: string) => {
    IPC_EVENTS_RENDERER.startDrag.send({ resourceId, filePath, fileType })
  },

  getUserConfigSettings: () => userConfig.settings,

  updateUserConfigSettings: async (settings: Partial<UserSettings>) => {
    IPC_EVENTS_RENDERER.updateUserConfigSettings.send(settings)
  },

  openURL: (url: string, active: boolean, scopeId?: string) => {
    IPC_EVENTS_RENDERER.openURL.send({ url, active, scopeId })
  },

  openSettings: (tab?: SettingsWindowTab) => {
    IPC_EVENTS_RENDERER.openSettings.send(tab)
  },

  openResourceLocally: (resourceId: string) => {
    IPC_EVENTS_RENDERER.openResourceLocally.send(resourceId)
  },

  exportResource: (resourceId: string) => {
    IPC_EVENTS_RENDERER.exportResource.send(resourceId)
  },

  fetchHTMLFromRemoteURL: async (url: string, _opts?: RequestInit) => {
    // Use IPC to fetch via main process (bypasses CORS restrictions)
    return ipcRenderer.invoke('fetch-html-from-url', url)
  },

  showOpenDialog: async (options: ShowOpenDialog['payload']) => {
    try {
      const filePaths = await IPC_EVENTS_RENDERER.showOpenDialog.invoke(options)
      if (!filePaths) return null

      const files = await Promise.all(
        filePaths.map(async (filePath) => {
          const fileBuffer = await fsp.readFile(filePath)
          const fileName = path.basename(filePath)
          const fileType = mime.lookup(fileName.toLowerCase()) || 'application/octet-stream'
          const file = new File([fileBuffer as BlobPart], fileName, {
            type: fileType
          })
          // Return structured object - custom File properties don't survive contextBridge serialization
          // So we return both the file and its full path explicitly
          return {
            file,
            path: filePath,
            name: fileName,
            type: fileType
          }
        })
      )

      console.log(
        '[Preload] showOpenDialog returning files with paths:',
        files.map((f) => f.path)
      )
      return files
    } catch (err) {
      console.error('Failed to import files: ', err)
      return null
    }
  },

  // Document conversion for My Library feature
  convertDocument: (filePath: string, options?: { useLLM?: boolean; forceOCR?: boolean }) => {
    return ipcRenderer.invoke('document:convert', filePath, options)
  },

  checkMarkerInstalled: () => {
    return ipcRenderer.invoke('document:check-marker')
  },

  onDocumentConvertProgress: (
    callback: (progress: { stage: string; progress: number; message?: string }) => void
  ) => {
    const handler = (_: any, progress: { stage: string; progress: number; message?: string }) =>
      callback(progress)
    ipcRenderer.on('document:convert-progress', handler)
    return () => ipcRenderer.removeListener('document:convert-progress', handler)
  },

  // Read a file as base64 (for importing extracted images into SFFS)
  readFileAsBase64: (filePath: string) => {
    return ipcRenderer.invoke('file:read-base64', filePath)
  },

  webContentsViewManagerAction: <T extends WebContentsViewManagerActionType>(
    type: T,
    ...args: WebContentsViewManagerActionPayloads[T] extends undefined
      ? []
      : [payload: WebContentsViewManagerActionPayloads[T]]
  ) => {
    const action = { type, payload: args[0] } as WebContentsViewManagerAction
    return IPC_EVENTS_RENDERER.webContentsViewManagerAction.invoke(action) as Promise<
      WebContentsViewManagerActionOutputs[T]
    >
  },

  webContentsViewAction: <T extends WebContentsViewActionType>(
    viewId: string,
    type: T,
    ...args: WebContentsViewActionPayloads[T] extends undefined
      ? []
      : [payload: WebContentsViewActionPayloads[T]]
  ) => {
    const action = { type, payload: args[0] } as WebContentsViewAction
    return IPC_EVENTS_RENDERER.webContentsViewAction.invoke({ viewId, action } as any) as Promise<
      WebContentsViewActionOutputs[T]
    >
  },

  // Claude Agent SDK API (uses local CLI authentication)
  claudeAgent: {
    isAuthenticated: () => ipcRenderer.invoke('claude-agent:is-authenticated'),
    getAccountInfo: () => ipcRenderer.invoke('claude-agent:get-account-info'),
    sendPrompt: (prompt: string, options?: any) =>
      ipcRenderer.invoke('claude-agent:send-prompt', prompt, options),
    interrupt: (requestId: string) => ipcRenderer.invoke('claude-agent:interrupt', requestId),
    summarize: (text: string) => ipcRenderer.invoke('claude-agent:summarize', text),
    explainDeep: (text: string, context?: string) =>
      ipcRenderer.invoke('claude-agent:explain-deep', text, context || ''),
    // Ask a question about an image (for ChapterPal-style Q&A with vision)
    askAboutImage: (imageUrl: string, question: string, context?: string) =>
      ipcRenderer.invoke('claude-agent:ask-about-image', imageUrl, question, context || ''),
    summarizeWithScreenshot: (
      bounds: { x: number; y: number; width: number; height: number },
      activeViewId: string
    ) => ipcRenderer.invoke('claude-agent:summarize-with-screenshot', bounds, activeViewId),

    // Streaming version - sends chunks as they arrive for real-time display
    summarizeWithScreenshotStream: (
      bounds: { x: number; y: number; width: number; height: number },
      activeViewId: string
    ) => ipcRenderer.invoke('claude-agent:summarize-with-screenshot-stream', bounds, activeViewId),

    // Stream event listeners for real-time text updates
    onStreamStart: (callback: (data: { screenshotUrl: string }) => void) => {
      const handler = (_: any, data: { screenshotUrl: string }) => callback(data)
      ipcRenderer.on('claude-stream-start', handler)
      return () => ipcRenderer.removeListener('claude-stream-start', handler)
    },
    onStreamChunk: (callback: (chunk: string) => void) => {
      const handler = (_: any, chunk: string) => callback(chunk)
      ipcRenderer.on('claude-stream-chunk', handler)
      return () => ipcRenderer.removeListener('claude-stream-chunk', handler)
    },
    onStreamComplete: (callback: (data: { content: string }) => void) => {
      const handler = (_: any, data: { content: string }) => callback(data)
      ipcRenderer.on('claude-stream-complete', handler)
      return () => ipcRenderer.removeListener('claude-stream-complete', handler)
    },
    onStreamError: (callback: (error: string) => void) => {
      const handler = (_: any, error: string) => callback(error)
      ipcRenderer.on('claude-stream-error', handler)
      return () => ipcRenderer.removeListener('claude-stream-error', handler)
    }
  },

  ...eventHandlers
}

const { sffs, resources } = initBackend({ num_worker_threads: 4, num_processor_threads: 4 })

IPC_EVENTS_RENDERER.setSurfBackendHealth.on((_, state) => {
  // @ts-ignore
  sffs.js__backend_set_surf_backend_health(state)
})

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('RENDERER_TYPE', RendererType.WebContentsView)
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('preloadEvents', eventHandlers)
    contextBridge.exposeInMainWorld('backend', {
      sffs,
      resources
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.RENDERER_TYPE = RendererType.WebContentsView
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.backend = { sffs, resources }
  // @ts-ignore (define in dts)
  window.preloadEvents = eventHandlers
}

export type API = typeof api
export type PreloadEventHandlers = typeof eventHandlers

function sendPageEvent<T extends keyof WebViewSendEvents>(
  name: T,
  data?: WebViewSendEvents[T]
): void {
  console.debug('Sending page event', name, data)
  ipcRenderer.send('webview-page-event', name, data)
  ipcRenderer.sendToHost('webview-page-event', name, data)
}

window.addEventListener('DOMContentLoaded', async (_) => {
  window.addEventListener('keyup', (event: KeyboardEvent) => {
    // Ignore synthetic events that are not user generated
    if (!event.isTrusted) return
    sendPageEvent(WebViewEventSendNames.KeyUp, { key: event.key })
  })

  window.addEventListener('keydown', async (event: KeyboardEvent) => {
    // Ignore synthetic events that are not user generated
    if (!event.isTrusted) return

    sendPageEvent(WebViewEventSendNames.KeyDown, {
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey
    })
  })
})

window.addEventListener('click', (event: MouseEvent) => {
  sendPageEvent(WebViewEventSendNames.MouseClick, {
    button: event.button,
    clientX: event.clientX,
    clientY: event.clientY
  })
})
