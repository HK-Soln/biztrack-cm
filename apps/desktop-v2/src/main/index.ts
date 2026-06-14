import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { DatabaseService } from '@biztrack/electron-core'
import { IPC, type TitleBarOverlayColors } from '../shared/ipc'
import { SkeletonService } from './services/skeleton.service'
import { registerIpc } from './ipc'

const TITLEBAR_HEIGHT = 64

// The renderer reports the resolved top-bar colours (palette + mode aware) so the
// native window controls (− □ ×) blend with the header. Fallbacks are the Deep Ink
// Blue defaults used before the renderer reports in.
let overlayColors: TitleBarOverlayColors | null = null

function getTitleBarOverlayOptions() {
  const isDark = nativeTheme.shouldUseDarkColors
  return {
    color: overlayColors?.color ?? (isDark ? '#161D2B' : '#FFFFFF'),
    symbolColor: overlayColors?.symbolColor ?? (isDark ? '#FFFFFF' : '#1A1A1A'),
    height: TITLEBAR_HEIGHT,
  }
}

function applyOverlayToAllWindows() {
  if (process.platform === 'darwin') return
  for (const w of BrowserWindow.getAllWindows()) w.setTitleBarOverlay(getTitleBarOverlayOptions())
}

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
    ...(isMac
      ? { trafficLightPosition: { x: 14, y: 22 } }
      : { titleBarOverlay: getTitleBarOverlayOptions() }),
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

  // Renderer pushes the resolved header colours so the native controls blend.
  ipcMain.on(IPC.titlebarSetOverlay, (_event, colors: TitleBarOverlayColors) => {
    if (!colors?.color || !colors?.symbolColor) return
    overlayColors = colors
    applyOverlayToAllWindows()
  })

  // Keep controls correct when the OS theme flips while in `system` mode.
  nativeTheme.on('updated', applyOverlayToAllWindows)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
