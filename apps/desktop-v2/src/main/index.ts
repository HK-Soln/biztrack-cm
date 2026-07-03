import { app, BrowserWindow, ipcMain, nativeTheme, session, shell } from 'electron'
import { join } from 'path'
import { DatabaseService, RealtimeClient, SecureStoreService, SyncService } from '@biztrack/electron-core'
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

  // Realtime in-app notifications: one Socket.IO connection to the app-wide realtime
  // gateway, authenticated with the ACCESS token → the gateway auto-joins the user room.
  // Pushes arrive on the `notification` event and are forwarded to the renderer.
  const realtime = new RealtimeClient({
    apiBaseUrl: API_BASE_URL,
    getAccessToken: () => tokenStore.getTokens()?.accessToken ?? null,
    onNotification: (payload) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.notificationEvent, payload)
    },
  })
  realtime.start()
  app.on('before-quit', () => realtime.stop())

  const notifications = new NotificationsService(authHttp)
  registerNotificationsIpc(notifications, realtime)

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
  )
  registerDepositsIpc(savings)
  const sales = new SalesService(
    db,
    () => authService.getSession().businessId,
    () => void sync.sync(),
    () => authService.getSession().user?.id ?? null,
    () => authService.getSession().user?.name ?? null,
    debts,
    savings,
    audit,
  )
  registerSalesIpc(sales, savings, documents, authHttp)

  // File uploads: renderer hands bytes to main, which POSTs them to the API storage
  // service with the phase2 token (tokens never reach the renderer).
  registerUploadsIpc(new UploadService(authHttp))

  // Online store/orders: API-only, proxied through main (tokens never reach the renderer).
  registerOnlineIpc(new OnlineService(authHttp))

  // Business profile (Settings → General): server-owned, proxied through main.
  registerBusinessIpc(
    new BusinessService(
      authHttp,
      () => authService.getSession().businessId,
      () => authService.getSession().user?.id ?? null,
      localCache,
    ),
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
