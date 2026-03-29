import { ipcMain, BrowserWindow } from 'electron'
import { SyncService } from '../services/sync.service'

export function registerSyncIpc(syncService: SyncService) {
  ipcMain.handle('sync:trigger', async () => {
    return syncService.sync()
  })

  // Allow sync service to push status updates to all renderer windows
  syncService.on('status', (status: string) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('sync:status', status)
    })
  })
}
