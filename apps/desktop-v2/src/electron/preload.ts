import { contextBridge, ipcRenderer } from 'electron'

// v2 preload exposes ONLY UI-chrome concerns to the renderer — no `db`, no
// `secureStore.get`. Data + tokens live behind the BFF (the Next server), so the
// renderer never has an IPC path to them. The data surface is same-origin /api/*.
const electronAPI = {
  theme: {
    setTheme: (theme: 'light' | 'dark' | 'system') => ipcRenderer.send('set-theme', theme),
    onThemeChange: (callback: (theme: 'light' | 'dark') => void) => {
      const listener = (_event: unknown, theme: 'light' | 'dark') => callback(theme)
      ipcRenderer.on('theme-changed', listener)
      return () => ipcRenderer.removeListener('theme-changed', listener)
    },
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
