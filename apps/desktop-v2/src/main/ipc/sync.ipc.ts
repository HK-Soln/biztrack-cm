import { ipcMain } from 'electron'
import type { SyncService } from '@biztrack/electron-core'
import { IPC } from '../../shared/ipc'

export function registerSyncIpc(sync: SyncService): void {
  ipcMain.handle(IPC.syncTrigger, () => sync.sync())
  ipcMain.handle(IPC.syncRetry, () => sync.retryFailed())
  ipcMain.handle(IPC.syncGetStatus, () => sync.getStatus())
}
