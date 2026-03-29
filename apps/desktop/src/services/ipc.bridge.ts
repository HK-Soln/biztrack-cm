'use client'

// Typed wrapper around window.electronAPI (exposed by preload.ts)
declare global {
  interface Window {
    electronAPI: {
      db: {
        query: (sql: string, params?: unknown[]) => Promise<unknown[]>
        run: (sql: string, params?: unknown[]) => Promise<{ changes: number }>
      }
      sync: {
        trigger: () => Promise<{ success: boolean; message: string }>
        onStatus: (callback: (status: string) => void) => void
      }
      network: {
        isOnline: () => Promise<boolean>
        onStatusChange: (callback: (online: boolean) => void) => void
      }
      print: {
        receipt: (data: unknown) => Promise<void>
      }
      app: {
        version: () => Promise<string>
      }
    }
  }
}

export const ipc = window.electronAPI
