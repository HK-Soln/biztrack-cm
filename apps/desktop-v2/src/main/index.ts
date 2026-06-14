import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { DatabaseService } from '@biztrack/electron-core'
import { SkeletonService } from './services/skeleton.service'
import { registerIpc } from './ipc'

function resolveDbPath(): string {
  if (process.env.DESKTOP_DB_PATH) return process.env.DESKTOP_DB_PATH
  return app.isPackaged
    ? join(app.getPath('userData'), 'biztrack.db')
    : join(app.getAppPath(), 'biztrack-v2-dev.db')
}

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: '#16467A',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 14, y: 28 } } : { titleBarOverlay: true }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // electron-vite sets ELECTRON_RENDERER_URL in dev; prod loads the built file.
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    win.loadURL(rendererUrl)
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('cm.biztrack.desktop.v2')

  // Electron main owns the SQLite connection (the trusted store). Migrations run
  // once here, before any IPC handler can read.
  const db = new DatabaseService({ path: resolveDbPath(), migrate: true })
  const skeleton = new SkeletonService(db)
  skeleton.ensureSeed()

  registerIpc(skeleton)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
