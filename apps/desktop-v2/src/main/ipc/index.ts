import { BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { IPC } from '../../shared/ipc'
import type { SkeletonService } from '../services/skeleton.service'

/** Wire the renderer↔main IPC surface. Domain reads go through services (the BFF). */
export function registerIpc(skeleton: SkeletonService): void {
  ipcMain.handle(IPC.skeletonCheck, () => skeleton.getCheck())
  ipcMain.handle(IPC.skeletonHealth, () => skeleton.getHealth())

  ipcMain.on(IPC.themeSet, (_event, theme: 'light' | 'dark' | 'system') => {
    nativeTheme.themeSource = theme
  })

  nativeTheme.on('updated', () => {
    const value = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('theme:system', value))
  })
}
