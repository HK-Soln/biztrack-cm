import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { DatabaseService, SecureStoreService, SyncService } from '@biztrack/electron-core'
import { IPC, type SyncStatus, type TitleBarOverlayColors } from '../shared/ipc'
import { API_BASE_URL } from './config'
import { SkeletonService } from './services/skeleton.service'
import { registerIpc } from './ipc'
import { TokenStore } from './services/token-store'
import { LocalCache } from './services/local-cache'
import { createAuthHttp } from './services/auth-http'
import { AuthService } from './services/auth.service'
import { registerAuthIpc } from './ipc/auth.ipc'
import { registerSyncIpc } from './ipc/sync.ipc'
import { CategoriesService } from './services/categories.service'
import { registerCategoriesIpc } from './ipc/categories.ipc'
import { UploadService } from './services/upload.service'
import { registerUploadsIpc } from './ipc/uploads.ipc'

const SYNC_CURSOR_KEY = 'sync.cursor'

const TITLEBAR_HEIGHT = 64

// The caption-button band uses a TRANSPARENT background so the real header pixels
// show through — it matches any palette / light-dark with zero colour computation.
// Only the symbol (− □ ×) colour needs syncing for contrast; the renderer reports
// the resolved --foreground, with an OS-theme fallback before it reports in.
const TRANSPARENT = '#00000000'
let overlayColors: TitleBarOverlayColors | null = null

function getTitleBarOverlayOptions() {
  const isDark = nativeTheme.shouldUseDarkColors
  return {
    color: TRANSPARENT,
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

  // Auth BFF: tokens + offline cache live in main; renderer sees only session status.
  const secureStore = new SecureStoreService()
  const tokenStore = new TokenStore(secureStore)
  const localCache = new LocalCache(db)
  let authService: AuthService
  const authHttp = createAuthHttp(tokenStore, () => authService?.onTokensCleared())
  authService = new AuthService(authHttp, tokenStore, localCache)
  registerAuthIpc(authService)

  // Offline-first sync engine: drains the outbox + pulls catalog changes into local
  // SQLite. Auth is the device sync token (issued at select-business); the cursor is
  // persisted in the encrypted store. Renderer only ever sees SyncStatus.
  const sync = new SyncService({
    db,
    apiBaseUrl: API_BASE_URL,
    getSyncToken: () => tokenStore.getSyncCredential(),
    getDeviceId: () => tokenStore.ensureDeviceId(),
    getCursor: () => secureStore.get(SYNC_CURSOR_KEY),
    setCursor: (cursor) => secureStore.set(SYNC_CURSOR_KEY, cursor),
    onStatus: (status: SyncStatus) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.syncStatusEvent, status)
    },
  })
  sync.start()
  registerSyncIpc(sync)
  app.on('before-quit', () => sync.stop())

  // Categories: offline-first reads from local SQLite; writes go local + outbox and
  // nudge a sync. Business scope comes from the active session, never the renderer.
  const categories = new CategoriesService(
    db,
    () => authService.getSession().businessId,
    () => void sync.sync(),
  )
  registerCategoriesIpc(categories)

  // File uploads: renderer hands bytes to main, which POSTs them to the API storage
  // service with the phase2 token (tokens never reach the renderer).
  registerUploadsIpc(new UploadService(authHttp))

  // Renderer pushes the resolved header colours so the native controls blend.
  ipcMain.on(IPC.titlebarSetOverlay, (_event, colors: TitleBarOverlayColors) => {
    if (!colors?.symbolColor) return
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
