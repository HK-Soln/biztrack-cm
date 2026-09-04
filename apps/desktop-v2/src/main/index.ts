import { app, BrowserWindow, ipcMain, nativeTheme, session, shell } from 'electron'
import { join, resolve } from 'path'
import {
  DatabaseService,
  RealtimeClient,
  SecureStoreService,
  SyncService,
} from '@biztrack/electron-core'
import { IPC, type SyncStatus, type TitleBarOverlayColors } from '../shared/ipc'
import { config } from './config'
import { SkeletonService } from './services/skeleton.service'
import { registerIpc } from './ipc'
import { TokenStore } from './services/token-store'
import { LocalCache } from './services/local-cache'
import { createAuthHttp } from './services/auth-http'
import { AuthService } from './services/auth.service'
import { registerAuthIpc } from './ipc/auth.ipc'
import { PinService } from './services/pin.service'
import { registerPinIpc } from './ipc/pin.ipc'
import { registerSyncIpc } from './ipc/sync.ipc'
import { CategoriesService } from './services/categories.service'
import { registerCategoriesIpc } from './ipc/categories.ipc'
import { AttributesService } from './services/attributes.service'
import { registerAttributesIpc } from './ipc/attributes.ipc'
import { UnitsService } from './services/units.service'
import { registerUnitsIpc } from './ipc/units.ipc'
import { ChargesService } from './services/charges.service'
import { registerChargesIpc } from './ipc/charges.ipc'
import { BrandsService } from './services/brands.service'
import { registerBrandsIpc } from './ipc/brands.ipc'
import { ProductsService } from './services/products.service'
import { registerProductsIpc } from './ipc/products.ipc'
import { InventoryService } from './services/inventory.service'
import { SalesService } from './services/sales.service'
import { SavingsService } from './services/savings.service'
import { registerDepositsIpc } from './ipc/deposits.ipc'
import { CashSessionsService } from './services/cash-sessions.service'
import { registerCashSessionsIpc } from './ipc/cash-sessions.ipc'
import { CashMovementKind } from '@biztrack/types'
import { registerInventoryIpc } from './ipc/inventory.ipc'
import { registerSalesIpc } from './ipc/sales.ipc'
import { ContactsService } from './services/contacts.service'
import { registerContactsIpc } from './ipc/contacts.ipc'
import { DebtsService } from './services/debts.service'
import { registerDebtsIpc } from './ipc/debts.ipc'
import { OpeningBalancesService } from './services/opening-balances.service'
import { registerOpeningBalancesIpc } from './ipc/opening-balances.ipc'
import { ExpensesService, ExpenseCategoriesService } from './services/expenses.service'
import { registerExpensesIpc } from './ipc/expenses.ipc'
import { DocumentService } from './services/document.service'
import { RfqService } from './services/rfq.service'
import { registerRfqIpc } from './ipc/rfq.ipc'
import { PurchaseOrderService } from './services/purchase-order.service'
import { registerPurchaseOrderIpc } from './ipc/purchase-order.ipc'
import { registerDocumentsIpc } from './ipc/documents.ipc'
import { UploadService } from './services/upload.service'
import { registerUploadsIpc } from './ipc/uploads.ipc'
import { OnlineService } from './services/online.service'
import { registerOnlineIpc } from './ipc/online.ipc'
import { registerCredentialsIpc } from './ipc/credentials.ipc'
import { registerPaymentsIpc } from './ipc/payments.ipc'
import { BusinessService } from './services/business.service'
import { registerBusinessIpc } from './ipc/business.ipc'
import { PlansService } from './services/plans.service'
import { registerPlansIpc } from './ipc/plans.ipc'
import { RolesService } from './services/roles.service'
import { registerRolesIpc } from './ipc/roles.ipc'
import { TeamService } from './services/team.service'
import { registerTeamIpc } from './ipc/team.ipc'
import { NotificationsService } from './services/notifications.service'
import { registerNotificationsIpc } from './ipc/notifications.ipc'
import { NotificationSettingsService } from './services/notification-settings.service'
import { registerNotificationSettingsIpc } from './ipc/notification-settings.ipc'
import { FiscalService } from './services/fiscal.service'
import { registerFiscalIpc } from './ipc/fiscal.ipc'
import { AuditService } from './services/audit.service'
import { registerAuditIpc } from './ipc/audit.ipc'

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
  if (config.dbPathOverride) return config.dbPathOverride
  return app.isPackaged
    ? join(app.getPath('userData'), 'biztrack.db')
    : join(app.getAppPath(), 'biztrack-v2-dev.db')
}

// DevTools shortcut keys we swallow in production: F12 and the Ctrl/Cmd(+Shift/+Alt)+I/J/C family.
function isDevToolsShortcut(input: Electron.Input): boolean {
  const key = input.key?.toLowerCase()
  if (key === 'f12') return true
  const combo = input.control || input.meta
  return combo && (input.shift || input.alt) && (key === 'i' || key === 'j' || key === 'c')
}

// ── Deep links (biztrack:// custom protocol → native-app handoff, N7) ───────────────
const DEEP_LINK_SCHEME = 'biztrack'

// Single-instance lock: required for the custom protocol on Windows/Linux, where the URL
// arrives on the SECOND instance's argv. The secondary instance quits immediately; the
// primary focuses its window and routes the link (see `second-instance` below).
const isPrimaryInstance = app.requestSingleInstanceLock()
if (!isPrimaryInstance) {
  app.quit()
}

// Register as the OS handler for biztrack:// links. In dev the launcher is `electron` + our
// entry script, so those must be passed explicitly; packaged builds register the exe.
const devEntryScript = process.argv[1]
if (process.defaultApp && devEntryScript) {
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [resolve(devEntryScript)])
} else {
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME)
}

/** Normalise a biztrack:// URL to an in-app route path ('/contacts/123?tab=x'), or null. */
function deeplinkToPath(url: string | undefined): string | null {
  if (!url || !url.toLowerCase().startsWith(`${DEEP_LINK_SCHEME}://`)) return null
  const rest = url.slice(`${DEEP_LINK_SCHEME}://`.length).replace(/^\/+/, '')
  return `/${rest}`
}

// A link can arrive before the window/renderer exists (cold start, or macOS open-url before
// ready) — buffer it and flush once the window is up.
let pendingDeeplink: string | null = null

function deliverDeeplink(path: string | null): void {
  if (!path) return
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) {
    pendingDeeplink = path
    return
  }
  if (win.isMinimized()) win.restore()
  win.focus()
  win.webContents.send(IPC.deeplinkNavigate, path)
}

// macOS delivers protocol links via open-url; it can fire before `ready`, so it's buffered.
app.on('open-url', (event, url) => {
  event.preventDefault()
  deliverDeeplink(deeplinkToPath(url))
})

// Windows/Linux: the URL is on the second instance's argv; the primary focuses + routes it.
app.on('second-instance', (_event, argv) => {
  const url = argv.find((arg) => arg.toLowerCase().startsWith(`${DEEP_LINK_SCHEME}://`))
  deliverDeeplink(deeplinkToPath(url))
})

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  // In production the renderer is trusted, packaged UI — DevTools stay fully locked so the
  // SQLite-backed BFF and tokens in main can't be inspected/tampered with from a shipped build.
  const devToolsAllowed = config.nodeEnv !== 'production'
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: '#16467A',
    show: false,
    // Window/taskbar icon. Packaged builds use the electron-builder-embedded exe
    // (Windows) / bundle (macOS) icon; this covers the dev run on Windows/Linux.
    ...(!isMac && !app.isPackaged ? { icon: join(app.getAppPath(), 'assets', 'icon.png') } : {}),
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
      // The primary lock: with devTools disabled Chromium won't open them at all — every
      // path (shortcuts, menu, context menu, programmatic openDevTools) is a no-op.
      devTools: devToolsAllowed,
    },
  })

  win.once('ready-to-show', () => win.show())

  // Defense-in-depth on top of `devTools: false`: swallow the shortcut keystrokes before
  // Chromium sees them, and slam the panel shut if it ever manages to open.
  if (!devToolsAllowed) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && isDevToolsShortcut(input)) event.preventDefault()
    })
    win.webContents.on('devtools-opened', () => win.webContents.closeDevTools())
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // electron-vite sets ELECTRON_RENDERER_URL in dev; prod loads the built file.
  const rendererUrl = config.rendererDevUrl
  if (rendererUrl) {
    win.loadURL(rendererUrl)
    if (devToolsAllowed) win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // A secondary instance (opened by an OS protocol link) has already forwarded its URL to
  // the primary via `second-instance` and is quitting — do no setup here.
  if (!isPrimaryInstance) return
  if (process.platform === 'win32') app.setAppUserModelId('cm.biztrack.desktop.v2')

  // Barcode/QR scanning uses the device camera (getUserMedia). Grant the camera
  // permission for our own renderer; deny anything else. The OS still gates the
  // first physical camera access.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })

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
  const authHttp = createAuthHttp(tokenStore, () => authService?.onTokensCleared())
  const authService = new AuthService(authHttp, tokenStore, localCache)
  registerAuthIpc(authService)

  // Offline-first sync engine: drains the outbox + pulls catalog changes into local
  // SQLite. Auth is the device sync token (issued at select-business); the cursor is
  // persisted in the encrypted store. Renderer only ever sees SyncStatus.
  const sync = new SyncService({
    db,
    apiBaseUrl: config.apiBaseUrl,
    getSyncToken: () => tokenStore.getSyncCredential(),
    getDeviceId: () => tokenStore.ensureDeviceId(),
    getCursor: () => secureStore.get(SYNC_CURSOR_KEY),
    setCursor: (cursor) => secureStore.set(SYNC_CURSOR_KEY, cursor),
    onStatus: (status: SyncStatus) => {
      // Persist the last successful sync time — the freshness reference for the
      // offline manager-PIN stale-device rule (survives restarts).
      if (status.lastSyncedAt) tokenStore.setLastSyncAt(status.lastSyncedAt)
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.syncStatusEvent, status)
    },
  })
  sync.start()
  registerSyncIpc(sync)
  app.on('before-quit', () => sync.stop())

  // Realtime in-app notifications: one Socket.IO connection to the app-wide realtime
  // gateway, authenticated with the ACCESS token → the gateway auto-joins the user room.
  // Pushes arrive on the `notification` event and are forwarded to the renderer.
  const realtime = new RealtimeClient({
    apiBaseUrl: config.apiBaseUrl,
    getAccessToken: () => tokenStore.getTokens()?.accessToken ?? null,
    onNotification: (payload) => {
      for (const w of BrowserWindow.getAllWindows())
        w.webContents.send(IPC.notificationEvent, payload)
    },
  })
  realtime.start()
  app.on('before-quit', () => realtime.stop())

  const notifications = new NotificationsService(authHttp)
  registerNotificationsIpc(notifications, realtime)
  registerNotificationSettingsIpc(new NotificationSettingsService(authHttp))
  registerFiscalIpc(new FiscalService(authHttp))

  // Append-only local audit trail: every mutating service action records who/what/when.
  // Actor + device are snapshotted from the active session at write time.
  const audit = new AuditService(db, () => {
    const session = authService.getSession()
    return {
      businessId: session.businessId,
      actorId: session.user?.id ?? null,
      actorName: session.user?.name ?? null,
      actorRole: session.user?.role ?? null,
      deviceId: tokenStore.ensureDeviceId(),
    }
  })
  registerAuditIpc(audit)

  // BIZ-2.9: detect a device wall-clock change (back-dating is a fraud vector — it forges
  // when a sale/void happened). Compare the wall clock against a monotonic timer each tick;
  // a divergence beyond the tolerance means the clock jumped. Emits DEVICE_TIME_CHANGED
  // (dropped when no business is active).
  {
    const CHECK_MS = 30_000
    const TOLERANCE_MS = 5_000
    let lastWall = Date.now()
    let lastMono = performance.now()
    const timer = setInterval(() => {
      const wallDelta = Date.now() - lastWall
      const monoDelta = performance.now() - lastMono
      const driftMs = Math.round(wallDelta - monoDelta)
      lastWall = Date.now()
      lastMono = performance.now()
      if (Math.abs(driftMs) > TOLERANCE_MS) {
        audit.log({
          action: 'DEVICE_TIME_CHANGED',
          entityType: 'device',
          entityId: tokenStore.ensureDeviceId(),
          changes: { before: null, after: { driftMs } },
        })
      }
    }, CHECK_MS)
    timer.unref()
  }

  // Offline manager-PIN: set/rotate (online) + verify for step-up (offline). Hash
  // lives on the local membership (pulled from the server); business/user scope
  // comes from the active session, never the renderer. Failed attempts are audited.
  const pin = new PinService(
    authHttp,
    db,
    () => {
      const session = authService.getSession()
      return {
        businessId: session.businessId,
        userId: session.user?.id ?? tokenStore.getLastUserId(),
      }
    },
    () => tokenStore.getLastSyncAt(),
    audit,
  )
  registerPinIpc(pin)

  // Categories: offline-first reads from local SQLite; writes go local + outbox and
  // nudge a sync. Business scope comes from the active session, never the renderer.
  const categories = new CategoriesService(
    db,
    () => authService.getSession().businessId,
    () => void sync.sync(),
    audit,
  )
  registerCategoriesIpc(categories)

  // Attributes (variant dimensions): same offline-first pattern — local reads, local
  // write + outbox push, business scope from the session.
  const attributes = new AttributesService(
    db,
    () => authService.getSession().businessId,
    () => void sync.sync(),
    audit,
  )
  registerAttributesIpc(attributes)

  // Units of measure: offline-first reads (system + business units), local write +
  // outbox push. System units are read-only (guarded in the service).
  const units = new UnitsService(
    db,
    () => authService.getSession().businessId,
    () => void sync.sync(),
    audit,
  )
  registerUnitsIpc(units)

  // Charge types: read-only catalog (system + business) for the receive/settle flow.
  const charges = new ChargesService(db, () => authService.getSession().businessId)
  registerChargesIpc(charges)

  // Brands & Models: offline-first; brands link categories M2M and own models.
  const brands = new BrandsService(
    db,
    () => authService.getSession().businessId,
    () => void sync.sync(),
    audit,
  )
  registerBrandsIpc(brands)

  // Products: offline-first catalog (brand→category, no stock yet — Inventory owns it).
  const products = new ProductsService(
    db,
    () => authService.getSession().businessId,
    () => void sync.sync(),
    audit,
  )
  registerProductsIpc(products)

  // Contacts (customers & suppliers): offline-first; suppliers back the PO/RFQ flow,
  // customers back sales/debts. Local write + outbox (entity `contacts`).
  const contacts = new ContactsService(
    db,
    () => authService.getSession().businessId,
    () => void sync.sync(),
    audit,
  )
  registerContactsIpc(contacts)

  // Debts & supplier payables: offline-first. Credit restocks/sales create source
  // debts; payments reduce them. Local write + outbox (entity `debts`, payments nested).
  const debts = new DebtsService(
    db,
    () => authService.getSession().businessId,
    () => void sync.sync(),
    () => authService.getSession().user?.id ?? null,
    audit,
    // Cash debt payments feed the open shift's drawer (BIZ-2.3). `cashSessions` is created
    // below; this closure only runs at payment time, by which point it is initialised.
    (input) => void cashSessions.recordAutoMovement(input),
  )
  registerDebtsIpc(debts)

  // Opening balances (balance brought forward) — offline-first; local write + outbox
  // (entity `openingBalances` → server `opening_balance`), mirrors the API entity.
  const openingBalances = new OpeningBalancesService(
    db,
    () => authService.getSession().businessId,
    () => void sync.sync(),
    () => authService.getSession().user?.id ?? null,
    audit,
    debts,
  )
  registerOpeningBalancesIpc(openingBalances)

  // Expenses + expense categories: offline-first; local write + outbox
  // (entities `expenses` → `expense`, `expenseCategories` → `expense_category`).
  const expenses = new ExpensesService(
    db,
    () => authService.getSession().businessId,
    () => void sync.sync(),
    () => authService.getSession().user?.id ?? null,
    audit,
    (input) =>
      void cashSessions.recordAutoMovement({
        kind: CashMovementKind.EXPENSE,
        amount: input.amount,
        referenceType: 'expense',
        referenceId: input.referenceId,
      }),
  )
  const expenseCategories = new ExpenseCategoriesService(
    db,
    () => authService.getSession().businessId,
    () => void sync.sync(),
    audit,
  )
  registerExpensesIpc(expenses, expenseCategories)

  // Procurement documents: renders RFQ/PO PDFs (offscreen Chromium) + opens the
  // WhatsApp/email composer. Shared by RFQ + PO.
  const documents = new DocumentService()

  // RFQ (request for quotation): offline-first; suppliers are contacts, items are
  // products/variants. Local write + outbox (entity `rfqs`); send = PDF + share.
  const rfqs = new RfqService(
    db,
    () => authService.getSession().businessId,
    () => void sync.sync(),
    () => authService.getSession().user?.id ?? null,
    audit,
  )
  registerRfqIpc(rfqs, documents)

  // Purchase Orders: created from scratch or a chosen RFQ quote; sent as a PDF + share.
  // Restock will later receive against a PO (Slice 5).
  const purchaseOrders = new PurchaseOrderService(
    db,
    () => authService.getSession().businessId,
    () => void sync.sync(),
    () => authService.getSession().user?.id ?? null,
    rfqs,
    audit,
  )
  registerPurchaseOrderIpc(purchaseOrders, documents)

  // Document send (online → API render+dispatch) + download (local PDF render → save).
  registerDocumentsIpc(rfqs, purchaseOrders, documents, authHttp)

  // Inventory: adjust/threshold/movements + restock (goods receipt). Restock reuses
  // products (serial receipts), debts (credit→payable), and purchase orders (receive
  // against a PO), so it's constructed after them.
  const inventory = new InventoryService(
    db,
    () => authService.getSession().businessId,
    () => void sync.sync(),
    products,
    debts,
    purchaseOrders,
    audit,
  )
  registerInventoryIpc(inventory)

  // Sales (POS checkout): offline-first; decrements stock, marks serials sold, raises a
  // receivable on credit, and enqueues the full SaleSyncPayload. Built after products +
  // debts (credit→receivable) which it depends on.
  const savings = new SavingsService(
    db,
    () => authService.getSession().businessId,
    () => void sync.sync(),
    () => authService.getSession().user?.id ?? null,
    audit,
    (input) =>
      void cashSessions.recordAutoMovement({
        kind: input.kind,
        amount: input.amount,
        referenceType: 'deposit',
        referenceId: input.referenceId,
      }),
  )
  registerDepositsIpc(savings)

  // Cash sessions (till shifts): offline-first; open/transition + read. Local write +
  // outbox (entity `cashSessions` → server `cash_session`). BIZ-2.1 foundation.
  const cashSessions = new CashSessionsService(
    db,
    () => authService.getSession().businessId,
    () => authService.getSession().user?.id ?? null,
    () => tokenStore.ensureDeviceId(),
    () => void sync.sync(),
    audit,
  )
  registerCashSessionsIpc(cashSessions)

  const sales = new SalesService(
    db,
    () => authService.getSession().businessId,
    () => void sync.sync(),
    () => authService.getSession().user?.id ?? null,
    () => authService.getSession().user?.name ?? null,
    debts,
    savings,
    audit,
    () => cashSessions.getCurrent()?.id ?? null,
  )
  registerSalesIpc(sales, savings, documents, authHttp)

  // File uploads: renderer hands bytes to main, which POSTs them to the API storage
  // service with the phase2 token (tokens never reach the renderer).
  registerUploadsIpc(new UploadService(authHttp))

  // Online store/orders: API-only, proxied through main (tokens never reach the renderer).
  registerOnlineIpc(new OnlineService(authHttp))

  // Authorization cards (BIZ-3.3): owner-only, server-owned, proxied through main.
  registerCredentialsIpc(authHttp)

  // Payment provider registry (Spec 07): owner-only, server-owned, proxied through main.
  registerPaymentsIpc(authHttp)

  // Business profile (Settings → General): server-owned, proxied through main.
  registerBusinessIpc(
    new BusinessService(
      authHttp,
      () => authService.getSession().businessId,
      () => authService.getSession().user?.id ?? null,
      localCache,
    ),
    // Keep the live session's allowed step-up methods (+ name/currency) fresh so the cards toggle
    // and the manager step-up modal reflect a Settings save immediately, not after a re-login.
    (profile) => authService.applyBusinessProfile(profile),
  )

  // Plans / subscription (Settings → Subscription): API-only, proxied through main.
  registerPlansIpc(new PlansService(authHttp))

  // Organization → Roles & Team: server-owned, online-only, proxied through main.
  registerRolesIpc(new RolesService(authHttp))
  registerTeamIpc(new TeamService(authHttp))

  // Renderer pushes the resolved header colours so the native controls blend.
  ipcMain.on(IPC.titlebarSetOverlay, (_event, colors: TitleBarOverlayColors) => {
    if (!colors?.symbolColor) return
    overlayColors = colors
    applyOverlayToAllWindows()
  })

  // Keep controls correct when the OS theme flips while in `system` mode.
  nativeTheme.on('updated', applyOverlayToAllWindows)

  createWindow()

  // Cold start: a protocol link may be in argv (Windows) or buffered from an early macOS
  // open-url. Deliver once the renderer's router + deeplink listener have mounted.
  const coldUrl = process.argv.find((arg) => arg.toLowerCase().startsWith(`${DEEP_LINK_SCHEME}://`))
  const initialDeeplink = deeplinkToPath(coldUrl) ?? pendingDeeplink
  pendingDeeplink = null
  if (initialDeeplink) {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.once('did-finish-load', () => {
      setTimeout(() => deliverDeeplink(initialDeeplink), 400)
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
