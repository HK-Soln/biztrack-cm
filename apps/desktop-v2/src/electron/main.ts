import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join } from 'path'
import { startNextServer, type NextServerHandle } from './next-server'

const forceProd =
  process.env.DESKTOP_FORCE_PRODUCTION === '1' || process.env.NODE_ENV === 'production'
const isDev = !app.isPackaged && !forceProd

let nextServer: NextServerHandle | null = null

function getSystemTheme(): 'light' | 'dark' {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

function resolveDbPath(): string {
  return app.isPackaged
    ? join(app.getPath('userData'), 'biztrack.db')
    : join(__dirname, '../../biztrack-v2-dev.db')
}

function createWindow() {
  const isMac = process.platform === 'darwin'

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: '#16467A',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 14, y: 28 } } : { titleBarOverlay: true }),
    show: false,
  })

  win.setMenu(null)

  if (isDev) {
    const rendererUrl = process.env.DESKTOP_RENDERER_URL
    if (!rendererUrl) {
      throw new Error('DESKTOP_RENDERER_URL is not set for the Electron renderer (dev).')
    }
    win.loadURL(rendererUrl)
    win.webContents.openDevTools()
  } else {
    if (!nextServer) {
      throw new Error('Next server is not running for the production desktop app.')
    }
    win.loadURL(nextServer.url)
  }

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('theme-changed', getSystemTheme())
  })

  win.once('ready-to-show', () => win.show())
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('cm.biztrack.desktop.v2')
  }

  if (!isDev) {
    // Production: boot the Next standalone server in-process, then load it.
    const nextDir = process.env.DESKTOP_NEXT_DIR ?? join(__dirname, '../..')
    nextServer = await startNextServer(nextDir, resolveDbPath())
  }

  // The renderer is allowed to drive the OS-level theme source + native titlebar.
  ipcMain.on('set-theme', (_event, theme: 'light' | 'dark' | 'system') => {
    nativeTheme.themeSource = theme
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('theme-changed', getSystemTheme()))
  })

  nativeTheme.on('updated', () => {
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('theme-changed', getSystemTheme()))
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  await nextServer?.close()
})
