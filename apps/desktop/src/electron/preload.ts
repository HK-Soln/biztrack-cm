import { contextBridge, ipcRenderer } from 'electron'

// Expose safe APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations
  db: {
    query: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:query', sql, params),
    run: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:run', sql, params),
  },
  // Sync
  sync: {
    trigger: () => ipcRenderer.invoke('sync:trigger'),
    onStatus: (callback: (status: string) => void) => {
      ipcRenderer.on('sync:status', (_event, status) => callback(status))
    },
  },
  // Network
  network: {
    isOnline: () => ipcRenderer.invoke('network:isOnline'),
    onStatusChange: (callback: (online: boolean) => void) => {
      ipcRenderer.on('network:change', (_event, online) => callback(online))
    },
  },
  // Print
  print: {
    receipt: (data: unknown) => ipcRenderer.invoke('print:receipt', data),
  },
  // App info
  app: {
    version: () => ipcRenderer.invoke('app:version'),
  },
})
