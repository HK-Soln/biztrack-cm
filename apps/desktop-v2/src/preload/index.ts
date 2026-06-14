import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type BridgeApi } from '../shared/ipc'

// The ONLY surface the renderer can touch. No db, no tokens — just typed,
// high-level domain calls that resolve in the main-process services (the BFF).
const api: BridgeApi = {
  skeleton: {
    getCheck: () => ipcRenderer.invoke(IPC.skeletonCheck),
    getHealth: () => ipcRenderer.invoke(IPC.skeletonHealth),
  },
  theme: {
    set: (theme) => ipcRenderer.send(IPC.themeSet, theme),
  },
  window: {
    setTitleBarOverlay: (colors) => ipcRenderer.send(IPC.titlebarSetOverlay, colors),
  },
}

contextBridge.exposeInMainWorld('api', api)
