// Single source of truth for the renderer↔main IPC contract. Imported by main
// (handlers), preload (bridge), and renderer (typed window.api). NO data or token
// channels are exposed beyond these typed, high-level domain calls.

export const IPC = {
  skeletonCheck: 'skeleton:check',
  skeletonHealth: 'skeleton:health',
  themeSet: 'theme:set',
  titlebarSetOverlay: 'titlebar:set-overlay',
  authGetSession: 'auth:get-session',
  authLogin: 'auth:login',
  authRequestLogin: 'auth:request-login',
  authLoginOtp: 'auth:login-otp',
  authRequestPasswordReset: 'auth:request-password-reset',
  authResetPassword: 'auth:reset-password',
  authVerifyPhone: 'auth:verify-phone',
  authVerifyEmail: 'auth:verify-email',
  authResendOtp: 'auth:resend-otp',
  authRegister: 'auth:register',
  authInvitePreview: 'auth:invite-preview',
  authAcceptInvite: 'auth:accept-invite',
  authRejectInvite: 'auth:reject-invite',
  authSetupBusiness: 'auth:setup-business',
  authListPlans: 'auth:list-plans',
  authSelectPlan: 'auth:select-plan',
  authSelectBusiness: 'auth:select-business',
  authListBusinesses: 'auth:list-businesses',
  authOfflineLogin: 'auth:offline-login',
  authLogout: 'auth:logout',
  pinSet: 'pin:set',
  pinVerify: 'pin:verify',
  pinVerifyCard: 'pin:verify-card',
  pinCanManage: 'pin:can-manage',
  credentialsList: 'credentials:list',
  credentialsIssueCard: 'credentials:issue-card',
  credentialsRevoke: 'credentials:revoke',
  syncTrigger: 'sync:trigger',
  syncFull: 'sync:full',
  syncRetry: 'sync:retry',
  syncGetStatus: 'sync:get-status',
  syncStatusEvent: 'sync:status-event',
  categoriesList: 'categories:list',
  categoriesListAll: 'categories:list-all',
  categoriesSelectable: 'categories:list-selectable',
  categoriesParentOptions: 'categories:list-parent-options',
  categoriesCreate: 'categories:create',
  categoriesUpdate: 'categories:update',
  categoriesDelete: 'categories:delete',
  attributesListGroups: 'attributes:list-groups',
  attributesListAllGroups: 'attributes:list-all-groups',
  attributesCreateGroup: 'attributes:create-group',
  attributesUpdateGroup: 'attributes:update-group',
  attributesDeleteGroup: 'attributes:delete-group',
  attributesAddOption: 'attributes:add-option',
  attributesUpdateOption: 'attributes:update-option',
  attributesDeleteOption: 'attributes:delete-option',
  attributesListCategoryLinks: 'attributes:list-category-links',
  attributesSetCategoryLinks: 'attributes:set-category-links',
  unitsList: 'units:list',
  unitsCreate: 'units:create',
  unitsUpdate: 'units:update',
  unitsDelete: 'units:delete',
  brandsList: 'brands:list',
  brandsCreate: 'brands:create',
  brandsUpdate: 'brands:update',
  brandsDelete: 'brands:delete',
  brandsGet: 'brands:get',
  brandsAddModel: 'brands:add-model',
  brandsUpdateModel: 'brands:update-model',
  brandsDeleteModel: 'brands:delete-model',
  productsList: 'products:list',
  productsListAll: 'products:list-all',
  productsListSellable: 'products:list-sellable',
  productsGet: 'products:get',
  productsCreate: 'products:create',
  productsUpdate: 'products:update',
  productsDelete: 'products:delete',
  productsStats: 'products:stats',
  productsListImages: 'products:list-images',
  productsSetImages: 'products:set-images',
  productsListVariants: 'products:list-variants',
  productsListVariantsPage: 'products:list-variants-page',
  productsSetVariants: 'products:set-variants',
  productsAddVariant: 'products:add-variant',
  productsUpdateVariant: 'products:update-variant',
  productsRemoveVariant: 'products:remove-variant',
  productsListSerialUnits: 'products:list-serial-units',
  productsListSerialUnitsPage: 'products:list-serial-units-page',
  productsListInStockSerials: 'products:list-in-stock-serials',
  productsResolveScan: 'products:resolve-scan',
  productsSetSerialUnits: 'products:set-serial-units',
  productsAddSerialUnits: 'products:add-serial-units',
  productsRetireSerialUnit: 'products:retire-serial-unit',
  productsUpdateSerialNumber: 'products:update-serial-number',
  productsUpdateSerialUnit: 'products:update-serial-unit',
  productsListMovements: 'products:list-movements',
  inventoryList: 'inventory:list',
  inventoryStats: 'inventory:stats',
  inventoryReorderSuggestions: 'inventory:reorder-suggestions',
  inventoryRestock: 'inventory:restock',
  inventoryAdjust: 'inventory:adjust',
  inventorySetThreshold: 'inventory:set-threshold',
  inventoryListMovements: 'inventory:list-movements',
  inventoryListAllMovements: 'inventory:list-all-movements',
  inventoryTurnover: 'inventory:turnover',
  inventoryDeadStock: 'inventory:dead-stock',
  inventorySupplierTrend: 'inventory:supplier-trend',
  contactsList: 'contacts:list',
  contactsSummary: 'contacts:summary',
  contactsListAllSuppliers: 'contacts:list-all-suppliers',
  contactsListAllCustomers: 'contacts:list-all-customers',
  contactsGet: 'contacts:get',
  contactsCreate: 'contacts:create',
  contactsUpdate: 'contacts:update',
  contactsDelete: 'contacts:delete',
  debtsListByContact: 'debts:list-by-contact',
  debtsStatement: 'debts:statement',
  debtsRecordPayment: 'debts:record-payment',
  debtsUpdateDueDate: 'debts:update-due-date',
  debtsOffset: 'debts:offset',
  debtsAgeing: 'debts:ageing',
  openingBalancesUpsert: 'opening-balances:upsert',
  openingBalancesListForContact: 'opening-balances:list-for-contact',
  expensesList: 'expenses:list',
  expensesGet: 'expenses:get',
  expensesSummary: 'expenses:summary',
  expensesTrend: 'expenses:trend',
  expensesCreate: 'expenses:create',
  expensesUpdate: 'expenses:update',
  expensesSetStatus: 'expenses:set-status',
  expensesRemove: 'expenses:remove',
  expenseCategoriesListAll: 'expense-categories:list-all',
  expenseCategoriesCreate: 'expense-categories:create',
  depositsList: 'deposits:list',
  depositsGet: 'deposits:get',
  depositsStatement: 'deposits:statement',
  depositsSummary: 'deposits:summary',
  depositsCreate: 'deposits:create',
  depositsAddPayment: 'deposits:add-payment',
  depositsClose: 'deposits:close',
  depositsReceiptHtml: 'deposits:receipt-html',
  depositsReportHtml: 'deposits:report-html',
  cashSessionsList: 'cash-sessions:list',
  cashSessionsGet: 'cash-sessions:get',
  cashSessionsCurrent: 'cash-sessions:current',
  cashSessionsOpen: 'cash-sessions:open',
  cashSessionsTransition: 'cash-sessions:transition',
  cashSessionsExpectedCash: 'cash-sessions:expected-cash',
  cashSessionsRecordMovement: 'cash-sessions:record-movement',
  cashSessionsListMovements: 'cash-sessions:list-movements',
  cashSessionsClose: 'cash-sessions:close',
  cashSessionsRoleTracksDrawer: 'cash-sessions:role-tracks-drawer',
  cashSessionsStaleOpen: 'cash-sessions:stale-open',
  cashSessionsRecover: 'cash-sessions:recover',
  cashSessionsSetVarianceReason: 'cash-sessions:set-variance-reason',
  cashSessionsVarianceHistory: 'cash-sessions:variance-history',
  cashSessionsShiftReport: 'cash-sessions:shift-report',
  cashSessionsDailyReport: 'cash-sessions:daily-report',
  onlineStoreGet: 'online:store-get',
  onlineStoreCreate: 'online:store-create',
  onlineStoreUpdate: 'online:store-update',
  onlineStorePublish: 'online:store-publish',
  onlineOrdersList: 'online:orders-list',
  onlineOrderGet: 'online:order-get',
  onlineOrderUpdateStatus: 'online:order-update-status',
  onlineSlugCheck: 'online:slug-check',
  onlineProductsList: 'online:products-list',
  onlineProductSetPublished: 'online:product-set-published',
  onlineOrderUpdatePayment: 'online:order-update-payment',
  onlinePublicationsList: 'online:publications-list',
  onlinePublicationRestore: 'online:publication-restore',
  businessGetProfile: 'business:get-profile',
  businessUpdate: 'business:update',
  notificationSettingsGet: 'notification-settings:get',
  notificationSettingsTimezones: 'notification-settings:timezones',
  notificationSettingsLookup: 'notification-settings:lookup',
  notificationSettingsUpdateMatrix: 'notification-settings:update-matrix',
  notificationSettingsUpdateQuietHours: 'notification-settings:update-quiet-hours',
  notificationSettingsAddRecipient: 'notification-settings:add-recipient',
  notificationSettingsUpdateRecipient: 'notification-settings:update-recipient',
  notificationSettingsUpdateRecipientSubs: 'notification-settings:update-recipient-subs',
  notificationSettingsRemoveRecipient: 'notification-settings:remove-recipient',
  fiscalCalendar: 'fiscal:calendar',
  fiscalAdjustments: 'fiscal:adjustments',
  fiscalClosePeriod: 'fiscal:close-period',
  fiscalLockPeriod: 'fiscal:lock-period',
  plansList: 'plans:list',
  plansSubscription: 'plans:subscription',
  plansQuotaUsage: 'plans:quota-usage',
  plansUpgrade: 'plans:upgrade',
  plansCancel: 'plans:cancel',
  rolesList: 'roles:list',
  rolesPermissions: 'roles:permissions',
  rolesGet: 'roles:get',
  rolesCreate: 'roles:create',
  rolesUpdate: 'roles:update',
  rolesRemove: 'roles:remove',
  rolesSetPermissions: 'roles:set-permissions',
  teamListMembers: 'team:list-members',
  teamUpdateMemberRole: 'team:update-member-role',
  teamRemoveMember: 'team:remove-member',
  teamSetMemberStatus: 'team:set-member-status',
  teamListInvites: 'team:list-invites',
  teamSendInvite: 'team:send-invite',
  teamResendInvite: 'team:resend-invite',
  teamCancelInvite: 'team:cancel-invite',
  // In-app notification feed + realtime
  notificationsList: 'notifications:list',
  notificationsUnreadCount: 'notifications:unread-count',
  notificationsMarkRead: 'notifications:mark-read',
  notificationsMarkAllRead: 'notifications:mark-all-read',
  notificationsConnect: 'notifications:connect',
  notificationEvent: 'notifications:event',
  deeplinkNavigate: 'deeplink:navigate',
  // Invitee-side invitations (existing-user pending memberships)
  invitationsList: 'invitations:list',
  invitationsAccept: 'invitations:accept',
  invitationsReject: 'invitations:reject',
  rfqList: 'rfq:list',
  rfqGet: 'rfq:get',
  rfqCreate: 'rfq:create',
  rfqRecordQuote: 'rfq:record-quote',
  rfqBuildDocument: 'rfq:build-document',
  rfqSend: 'rfq:send',
  poList: 'po:list',
  poGet: 'po:get',
  poCreate: 'po:create',
  poCreateFromRfq: 'po:create-from-rfq',
  poBuildDocument: 'po:build-document',
  poSend: 'po:send',
  poCancel: 'po:cancel',
  documentsSend: 'documents:send',
  documentsDownload: 'documents:download',
  documentsDownloadHtml: 'documents:download-html',
  documentsShareHtml: 'documents:share-html',
  auditList: 'audit:list',
  auditSaleLineRemoved: 'audit:sale-line-removed',
  uploadsFile: 'uploads:file',
  chargesListActive: 'charges:list-active',
  salesCreate: 'sales:create',
  salesMyDiscountLimits: 'sales:my-discount-limits',
  salesBelowCostCheck: 'sales:below-cost-check',
  salesList: 'sales:list',
  salesListAll: 'sales:list-all',
  salesSummary: 'sales:summary',
  salesDailySeries: 'sales:daily-series',
  salesCashierRoster: 'sales:cashier-roster',
  salesByProduct: 'sales:by-product',
  salesByPayment: 'sales:by-payment-method',
  salesRefunds: 'sales:refunds',
  salesGrossProfit: 'sales:gross-profit',
  salesDiscountSummary: 'sales:discount-summary',
  salesDiscountsByCashier: 'sales:discounts-by-cashier',
  salesDiscountsByProduct: 'sales:discounts-by-product',
  salesFlaggedDiscounts: 'sales:flagged-discounts',
  salesGet: 'sales:get',
  salesVoid: 'sales:void',
  salesRefund: 'sales:refund',
  salesSendReceipt: 'sales:send-receipt',
  salesPrintReceipt: 'sales:print-receipt',
  salesReceiptHtml: 'sales:receipt-html',
  salesDownloadReceipt: 'sales:download-receipt',
  savingsGetForCustomer: 'savings:get-for-customer',
} as const

// ---- Pagination -----------------------------------------------------------
// Re-exported from @biztrack/types so the desktop list contract matches the API
// (default limit 20, max 100). Local list methods accept a ListQuery and return a
// PaginatedResult; `listAll*` variants (for form pickers) return the full set.
export type { ListQuery, PaginatedResult } from '@biztrack/types'
export type { ChargeType } from '@biztrack/types'
import type { RoleDiscountLimits } from '@biztrack/utils'
export type { RoleDiscountLimits }
export type { DailySalesRow, CashierPerformanceRow } from '@biztrack/types'
export type {
  SalesByProductRow,
  SalesByPaymentRow,
  RefundReasonRow,
  RefundCashierRow,
} from '@biztrack/types'
export type { InventoryTurnoverRow, DeadStockRow, SupplierPriceRow } from '@biztrack/types'
// Cash-session types re-exported canonically so the renderer (dataClient interface, cloud
// adapter) can consume them from the one @shared/ipc hub.
export type {
  CashSession,
  CashMovement,
  CashSessionExpectedCash,
  CashShiftReportData,
  CashDailyReportData,
  CashVarianceHistory,
  CashReportKind,
  CloseCashSessionInput,
  SetCashVarianceReasonInput,
  RecordCashMovementInput,
  CashVarianceHistoryQuery,
  CashDailyReportQuery,
} from '@biztrack/types'
export type {
  DiscountSummary,
  DiscountByCashierRow,
  DiscountByProductRow,
  FlaggedDiscountRow,
} from '@biztrack/types'
import type { ListQuery as ListQueryT, PaginatedResult as PaginatedT } from '@biztrack/types'
import type { DailySalesRow, CashierPerformanceRow } from '@biztrack/types'
import type {
  DiscountSummary,
  DiscountByCashierRow,
  DiscountByProductRow,
  FlaggedDiscountRow,
} from '@biztrack/types'
import type {
  SalesByProductRow,
  SalesByPaymentRow,
  RefundReasonRow,
  RefundCashierRow,
} from '@biztrack/types'
import type { InventoryTurnoverRow, DeadStockRow, SupplierPriceRow } from '@biztrack/types'
import type { ChargeType as ChargeTypeT } from '@biztrack/types'
import type { PaymentMethod as PaymentMethodT } from '@biztrack/types'
import type { BusinessProfileTier } from '@biztrack/types'
import type { RefundSaleInput } from '@biztrack/types'
export type { RefundSaleInput } from '@biztrack/types'
import type {
  MemberAuthCredential as MemberAuthCredentialT,
  IssueCardRequest as IssueCardRequestT,
  IssueCardResponse as IssueCardResponseT,
} from '@biztrack/types'
export type { MemberAuthCredential, IssueCardRequest, IssueCardResponse } from '@biztrack/types'

/** Per-entity list query: the base ListQuery plus optional entity filters. */
export interface CategoryListQuery extends ListQueryT {
  parentId?: string | null
  isActive?: boolean
  /** Filter by hierarchy level (1=L1 … 3=L3). */
  depth?: number
}
/**
 * Categories a product can target: terminal/leaf categories (no active children),
 * at any depth. Optionally scoped to a brand — each linked category is expanded to
 * the leaves in its subtree. Eligibility is computed in the service, never the client.
 */
export interface CategorySelectableQuery {
  brandId?: string
  search?: string
}
/**
 * Categories eligible to be a parent (depth < 3, no products attached, no variant
 * options attached), excluding a given category and its descendants. Service-computed.
 */
export interface CategoryParentOptionsQuery {
  excludeId?: string
  search?: string
}
export interface BrandListQuery extends ListQueryT {
  categoryId?: string
}
export interface UnitListQuery extends ListQueryT {
  type?: string
}
export type AttributeGroupListQuery = ListQueryT
/** Derived stock state, computed from current stock vs the reorder/low threshold. */
export type StockStatus = 'all' | 'in' | 'low' | 'out'

export interface ProductListQuery extends ListQueryT {
  categoryId?: string
  brandId?: string
  isActive?: boolean
  stockStatus?: StockStatus
}

/** Serial-units page query — base list query optionally scoped to one variant. */
export interface SerialUnitsPageQuery extends ListQueryT {
  variantId?: string
}

/** Catalog KPI roll-up for the products list header (computed from local SQLite). */
export interface ProductStats {
  totalSkus: number
  categories: number
  catalogValueCost: number
  retailValue: number
  blendedMarginPct: number
  lowStock: number
  outOfStock: number
}

// ---- Audit trail ----------------------------------------------------------
// Single source of truth — the shared union (reconciled with the desktop's older narrow one
// in BIZ-2.9). Includes CREATE/UPDATE/DELETE/VOID/PIN_FAILED/PIN_LOCKED plus the new domain
// events (SHIFT_*, CASH_MOVEMENT, DISCOUNT_APPLIED, …).
export type { AuditAction } from '@biztrack/types'

/** One append-only audit row (who changed what, when). */
export interface LocalAuditLog {
  id: string
  action: AuditActionT
  entityType: string
  entityId: string
  entityLabel: string | null
  actorId?: string | null
  actorName: string | null
  actorRole: string | null
  changes: { before: unknown; after: unknown } | null
  /** Money impact in whole XAF, or null (BIZ-2.7). */
  amount?: number | null
  /** Monotonic per-device event counter (BIZ-2.9). */
  sequence?: number | null
  createdAt: string
  /** Device clock reading (BIZ-2.7). */
  deviceTime?: string | null
  /** Server-stamped ingest time; null until the row reaches the server (BIZ-2.7). */
  serverTime?: string | null
}

export interface AuditListQuery extends ListQueryT {
  entityType?: string
  entityId?: string
  action?: AuditActionT
  /** Filter to one actor (cashier) by user id — BIZ-2.11. */
  actorId?: string
  /** ISO lower/upper bounds on created_at (the caller computes the local-day window) — BIZ-2.11. */
  dateFrom?: string
  dateTo?: string
}

/** A held-cart line rung then removed before checkout (BIZ-2.9, local-only audit). */
export interface SaleLineRemovedInput {
  productId: string
  productName: string
  quantity: number
  /** Whole-XAF unit price at the time it was in the cart. */
  unitPrice: number
}

// ---- Contacts (customers & suppliers) -------------------------------------
// Request/query shapes are the shared @biztrack/types contracts so desktop ↔ API
// stay aligned. ContactType is a runtime enum — import it from '@biztrack/types'
// directly in components that need its values.
export type {
  ContactType,
  CreateContactRequest,
  UpdateContactRequest,
  ContactsQuery,
  ContactsSummary,
} from '@biztrack/types'
export { IdDocumentType } from '@biztrack/types'
import type {
  ContactType as ContactTypeT,
  IdDocumentType as IdDocumentTypeT,
  CreateContactRequest,
  UpdateContactRequest,
  ContactsQuery,
  ContactsSummary,
} from '@biztrack/types'

/** A contact (customer/supplier) as stored locally. */
export interface LocalContact {
  id: string
  type: ContactTypeT
  name: string
  phone: string | null
  phoneAlt: string | null
  email: string | null
  address: string | null
  notes: string | null
  idType: IdDocumentTypeT | null
  idNumber: string | null
  idIssueDate: string | null
  idExpiryDate: string | null
  idDocuments: string[]
  selfieUrl: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/** A contact row enriched with outstanding balances (computed from local debts). */
export interface LocalContactListItem extends LocalContact {
  totalReceivable: number
  totalPayable: number
  openDebts: number
  /** Created date of the oldest still-open debt (for the age-of-debt indicator). */
  oldestUnpaidAt: string | null
}

// ---- Debts & payments ------------------------------------------------------
export type {
  DebtsQuery,
  RecordDebtPaymentRequest,
  ContactStatement,
  ContactStatementEntry,
  DebtDirection,
  AgeingReport,
} from '@biztrack/types'
import type {
  DebtsQuery,
  RecordDebtPaymentRequest,
  ContactStatement,
  DebtDirection,
  DebtSource,
  DebtStatus,
  AgeingReport,
} from '@biztrack/types'

/** A debt (receivable/payable) as stored locally, with computed paid/outstanding. */
export interface LocalDebt {
  id: string
  contactId: string
  direction: DebtDirection
  sourceType: DebtSource
  sourceReference: string
  originalAmount: number
  paidAmount: number
  outstandingAmount: number
  status: DebtStatus
  dueDate: string | null
  notes: string | null
  createdAt: string
  settledAt: string | null
}

// ---- RFQ (request for quotation) ------------------------------------------
export type {
  CreateRfqRequest,
  RfqsQuery,
  RecordRfqQuoteRequest,
  RfqDocument,
  RfqSendChannel,
} from '@biztrack/types'
import type {
  CreateRfqRequest,
  RfqsQuery,
  RecordRfqQuoteRequest,
  RfqDocument,
  RfqSendChannel,
  RfqStatus,
  RfqSupplierStatus,
} from '@biztrack/types'

export interface LocalRfqItem {
  id: string
  productId: string
  variantId: string | null
  description: string
  quantity: number
}

export interface LocalRfqSupplier {
  id: string
  supplierId: string
  supplierName: string | null
  status: RfqSupplierStatus
  quotedTotal: number | null
  quoteNotes: string | null
  quoteFileUrl: string | null
  respondedAt: string | null
}

export interface LocalRfq {
  id: string
  number: string
  title: string | null
  messageBody: string | null
  status: RfqStatus
  currency: string
  createdAt: string
  updatedAt: string
}

export interface LocalRfqListItem extends LocalRfq {
  itemCount: number
  supplierCount: number
  quoteCount: number
}

export interface LocalRfqDetail extends LocalRfq {
  items: LocalRfqItem[]
  suppliers: LocalRfqSupplier[]
}

// ---- Purchase orders ------------------------------------------------------
export type {
  CreatePurchaseOrderRequest,
  UpdatePurchaseOrderRequest,
  PurchaseOrdersQuery,
  SendPurchaseOrderRequest,
  PurchaseOrderSendChannel,
  PurchaseOrderDocument,
  ConvertRfqToPoRequest,
} from '@biztrack/types'
import type {
  CreatePurchaseOrderRequest,
  PurchaseOrdersQuery,
  PurchaseOrderSendChannel,
  PurchaseOrderDocument,
  ConvertRfqToPoRequest,
  PurchaseOrderStatus,
} from '@biztrack/types'

export interface LocalPurchaseOrderItem {
  id: string
  productId: string
  variantId: string | null
  description: string
  quantity: number
  unitPrice: number
  receivedQuantity: number
}

export interface LocalPurchaseOrder {
  id: string
  number: string
  rfqId: string | null
  supplierId: string
  supplierName: string | null
  title: string | null
  messageBody: string | null
  status: PurchaseOrderStatus
  currency: string
  expectedDate: string | null
  totalAmount: number
  sentAt: string | null
  createdAt: string
  updatedAt: string
}

export interface LocalPurchaseOrderListItem extends LocalPurchaseOrder {
  itemCount: number
  /** Fraction (0..1) of ordered quantity received so far. */
  receivedRatio: number
}

export interface LocalPurchaseOrderDetail extends LocalPurchaseOrder {
  items: LocalPurchaseOrderItem[]
}

// ---- Document send / download (RFQ + PO share) ----------------------------
export type { DocumentRecipient, DocumentSendChannel } from '@biztrack/types'
import type { DocumentRecipient, DocumentSendChannel } from '@biztrack/types'

export type DocumentKind = 'rfq' | 'po'

export interface DocumentSendInput {
  kind: DocumentKind
  id: string
  /** Required for RFQ (the supplier copy); ignored for PO. */
  supplierId?: string | null
  channel: DocumentSendChannel
  /** Override recipient when the contact has no stored email/phone. */
  recipient?: DocumentRecipient
}

export interface DocumentDownloadInput {
  kind: DocumentKind
  id: string
  supplierId?: string | null
}

/** Share an app-generated (trusted) HTML document via the WhatsApp/email composer. */
export interface ShareHtmlPdfInput {
  /** HTML to render + attach as a PDF. Omit to send a plain text/email message. */
  html?: string | null
  message: string
  /** File name (without extension) for the rendered PDF. */
  filename?: string | null
  channel: DocumentSendChannel
  phone?: string | null
  email?: string | null
  subject?: string
}

export interface DocumentDownloadResult {
  saved: boolean
  path?: string
}

// ---- Auth (Feature 1) -----------------------------------------------------
// The renderer only ever sees SESSION STATUS — never tokens. Tokens live in the
// Electron main process (secure-store); the cloud build gets the same shape from
// the API. Canonical definitions live in @biztrack/types — imported for local use + re-exported.
import type { AuthPhase, SessionUser, SessionStatus } from '@biztrack/types'
export type { AuthPhase, SessionUser, SessionStatus }

export interface AuthContextInfo {
  maskedPhone?: string
  maskedEmail?: string
  /** Unmasked phone/email to submit to verify-phone/verify-email when resuming a pending step. */
  verifyContact?: string
  otpExpiresIn?: number
  attemptsLeft?: number
}

/** Result of an auth-flow step: what to do next + the refreshed session. */
export interface AuthFlowResult {
  ok: boolean
  nextStep: string | null
  session: SessionStatus
  context: AuthContextInfo | null
  error: string | null
}

// Public invite preview (GET /invites/:token) used by the accept-invite page.
export type { InvitePreviewResponse } from '@biztrack/types'
import type { InvitePreviewResponse as InvitePreviewResponseT } from '@biztrack/types'
export type InvitePreviewResult =
  | { ok: true; preview: InvitePreviewResponseT }
  | { ok: false; error: string }

export interface BusinessOption {
  id: string
  name: string
  role: string | null
  /** Business lifecycle: 'ONBOARDING' | 'PLAN_PENDING' | 'ACTIVE' (or null if unknown).
   * A non-owner can only enter an ACTIVE business. */
  status: string | null
  /** Cached alongside the option so the offline session has the right currency/vocabulary. */
  currency?: string | null
  profile?: string | null
}

export type OtpChannel = 'SMS' | 'WHATSAPP' | 'EMAIL'

export type BillingCycle = 'MONTHLY' | 'ANNUAL'

export interface PlanQuotas {
  products: number | null
  contacts: number | null
  categories: number | null
  users: number | null
}

export interface PlanSummary {
  name: string
  displayName: string
  /** Monthly price (XAF). */
  priceXAF: number
  /** Annual price (XAF) — typically 10× monthly (two months free). */
  priceAnnualXAF: number
  trialDays: number
  quotas: PlanQuotas
  /** Full Resource codes granted by this plan. */
  resources: string[]
  /** Resource codes this plan adds over the one it inherits from. */
  additionalResources: string[]
  /** The plan this one builds on (for "Everything in X, plus…"), or null. */
  inheritsFrom: string | null
}

export interface PlanList {
  plans: PlanSummary[]
  currentPlan: string | null
}

export interface RegisterPayload {
  name: string
  phone: string
  email?: string
  password: string
  businessName?: string
  language?: string
  preferredPhoneChannel?: 'SMS' | 'WHATSAPP'
  inviteToken?: string
}

/** Business setup (onboarding) payload → POST /businesses/setup. Fiscal fields are
 * stored but not yet used by any tax logic. */
export interface BusinessSetupPayload {
  name: string
  type?: string
  description?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  country?: string
  niu?: string
  rccm?: string
  vatRegistered?: boolean
  defaultVatRate?: number
  fiscalRegime?: string
  /** Month (1–12) the fiscal year begins in; default 1 (January, OHADA). (BIZ-5.2) */
  fiscalYearStartMonth?: number
  /** Business size profile (MICRO | SMALL | SME) — BIZ-5.7. */
  profile?: BusinessProfileTier
}

/** A product category as stored locally (mirrors the synced server record). */
export interface LocalCategory {
  id: string
  name: string
  slug: string | null
  description: string | null
  color: string | null
  icon: string | null
  imageUrl: string | null
  sortOrder: number
  parentId: string | null
  depth: number
  isActive: boolean
  showOnline: boolean
  /** Default unit of measure pre-filled when creating a product in this category. */
  defaultUnitOfMeasureId: string | null
}

/** Fields the user supplies when creating/editing a category. */
export interface CategoryInput {
  name: string
  description?: string | null
  color?: string | null
  icon?: string | null
  imageUrl?: string | null
  parentId?: string | null
  sortOrder?: number
  isActive?: boolean
  showOnline?: boolean
  /** Default unit of measure pre-filled when creating a product in this category. */
  defaultUnitOfMeasureId?: string | null
}

// ---- Attributes (variant dimensions) --------------------------------------
export type AttributeDisplayType = 'CHIPS' | 'SWATCHES' | 'DROPDOWN'

/** An attribute option (e.g. "Black", "128GB") as stored locally. */
export interface LocalAttributeOption {
  id: string
  groupId: string
  value: string
  colorHex: string | null
  sortOrder: number
  isActive: boolean
}

/** An attribute group (e.g. Color, Storage) with its options. */
export interface LocalAttributeGroup {
  id: string
  name: string
  displayType: AttributeDisplayType
  sortOrder: number
  isActive: boolean
  /** How many (non-deleted) categories this group is attached to. */
  categoryCount: number
  options: LocalAttributeOption[]
}

/** A category↔group link, enriched with the group + its options for display. */
export interface LocalCategoryAttributeGroup {
  id: string
  categoryId: string
  attributeGroupId: string
  isRequired: boolean
  sortOrder: number
  name: string
  displayType: AttributeDisplayType
  options: Array<{ id: string; value: string; colorHex: string | null }>
}

export interface AttributeGroupInput {
  name: string
  displayType?: AttributeDisplayType
  sortOrder?: number
  isActive?: boolean
}

export interface AttributeOptionInput {
  value: string
  colorHex?: string | null
  sortOrder?: number
  isActive?: boolean
}

/** One desired category↔group attachment (used by the bulk set-links call). */
export interface CategoryAttributeLinkInput {
  attributeGroupId: string
  isRequired?: boolean
  sortOrder?: number
}

// ---- Units of measure -----------------------------------------------------
export type UnitType = 'QUANTITY' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'CUSTOM'

/** A unit of measure as stored locally. `isSystem` units (no business) are read-only. */
export interface LocalUnit {
  id: string
  name: string
  abbreviation: string | null
  type: UnitType
  isDefault: boolean
  isActive: boolean
  isSystem: boolean
}

export interface UnitInput {
  name: string
  abbreviation: string
  type?: UnitType
  isActive?: boolean
}

// ---- Products -------------------------------------------------------------
export type ProductType = 'SIMPLE' | 'SERVICE' | 'VARIABLE_QUANTITY' | 'COMPOSITE'
export type SerialType = 'IMEI' | 'SERIAL_NUMBER' | 'BARCODE'

/** A product as stored locally, enriched with category/brand/unit display names. */
export interface LocalProduct {
  id: string
  name: string
  slug: string | null
  description: string | null
  sku: string | null
  barcode: string | null
  /** Base price set at the pricing stage — the inherit default for variants + the
   * edit-form value. For display use effectiveSellingPrice/effectiveCostPrice. */
  sellingPrice: number
  costPrice: number | null
  /** Displayed price: for variant products this is the AVERAGE of the variants'
   * effective prices (override ?? base); otherwise equals the base. Computed live. */
  effectiveSellingPrice: number
  effectiveCostPrice: number | null
  currency: string
  taxRate: number
  productType: ProductType
  isService: boolean
  trackInventory: boolean
  categoryId: string | null
  brandId: string | null
  modelId: string | null
  unitOfMeasureId: string | null
  imageUrl: string | null
  isActive: boolean
  isFeatured: boolean
  isPublishedOnline: boolean
  onlineDescription: string | null
  onlineStockReserve: number
  metaTitle: string | null
  metaDescription: string | null
  isSerialized: boolean
  serialType: SerialType | null
  warrantyMonths: number | null
  /** Serialized products only: each unit is a unique item with its own image/description/SEO. */
  uniqueItems: boolean
  lowStockThreshold: number | null
  reorderPoint: number | null
  /** Read-only stock (owned by the Inventory module; reflects opening stock until that syncs). */
  currentStock: number
  /** Whether the product has any (non-deleted) variants — lets callers skip loading them. */
  hasVariants: boolean
  categoryName: string | null
  brandName: string | null
  unitAbbr: string | null
}

/** One attribute-option link of a variant (e.g. Color=Black). */
export interface VariantOptionRef {
  attributeGroupId: string
  attributeOptionId: string
}

/** A generated product variant (a sellable attribute combination). */
export interface LocalVariant {
  id: string
  name: string
  priceOverride: number | null
  costPriceOverride: number | null
  sku: string | null
  isActive: boolean
  sortOrder: number
  /** Read-only per-variant stock (from the variant's inventory level). */
  stockQuantity: number
  lowStockThreshold: number | null
  reorderPoint: number | null
  // A variant is a mini-product with its own description + SEO/online fields.
  description: string | null
  metaTitle: string | null
  metaDescription: string | null
  onlineDescription: string | null
  isPublishedOnline: boolean
  options: VariantOptionRef[]
}

/** Desired variant from the matrix (no id — matched by option combination on save). */
export interface VariantInput {
  name: string
  priceOverride?: number | null
  costPriceOverride?: number | null
  sku?: string | null
  isActive?: boolean
  /** Opening stock to seed the variant's inventory on create (non-serialised). */
  openingStock?: number | null
  lowStockThreshold?: number | null
  reorderPoint?: number | null
  description?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
  onlineDescription?: string | null
  isPublishedOnline?: boolean
  options: VariantOptionRef[]
}

/** One serialised unit (IMEI/SN/Barcode) of a product, optionally tied to a variant. */
export interface LocalSerialUnit {
  id: string
  productId: string
  variantId: string | null
  serialNumber: string
  serialType: SerialType
  status: string
  // In unique-item mode each unit is a mini-product with its own image/description/SEO.
  description: string | null
  imageUrl: string | null
  metaTitle: string | null
  metaDescription: string | null
}

/** Desired serial unit on save (matched by serialNumber so live units keep their id). */
export interface SerialUnitInput {
  variantId?: string | null
  serialNumber: string
  serialType: SerialType
}

/** Edit a unique serial unit's mini-product fields (unique-item mode). */
export interface SerialUnitUpdateInput {
  serialNumber?: string
  description?: string | null
  imageUrl?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
}

/** How a manual stock adjustment changes the quantity (mirrors API StockAdjustmentType). */
export type StockAdjustmentType = 'ADD' | 'REMOVE' | 'SET'

/** Manual stock adjustment for a direct product → a MANUAL_ADJUSTMENT movement. */
export interface AdjustStockInput {
  type: StockAdjustmentType
  quantity: number
  /** Reason (>= 3 chars) — recorded on the movement + audit. */
  notes: string
  /** When set, adjusts the stock of a specific (non-serialized) variant instead of the product. */
  variantId?: string | null
}

/** Reorder/low-stock thresholds (no movement). */
export interface ThresholdInput {
  lowStockThreshold: number | null
  reorderPoint: number | null
}

/** Movement-ledger query (paginated). */
export interface MovementsQuery extends ListQueryT {
  type?: StockMovementType
  dateFrom?: string
  dateTo?: string
  /** Scope to one variant's movements (variant detail page). */
  variantId?: string
}

/** One row in the inventory (stock-levels) list. */
export interface LocalInventoryItem {
  productId: string
  name: string
  sku: string | null
  imageUrl: string | null
  categoryName: string | null
  unitAbbr: string | null
  currency: string
  currentStock: number
  lowStockThreshold: number | null
  reorderPoint: number | null
  /** Derived state from stock vs reorder/low threshold. */
  stockStatus: 'in' | 'low' | 'out'
  /** cost_price × current stock (this product's currency). */
  stockValueCost: number
  lastRestockAt: string | null
}

/** KPI roll-up for the inventory page header. */
export interface InventoryStats {
  trackedSkus: number
  unitsOnHand: number
  stockValueCost: number
  lowStock: number
  outOfStock: number
}

export interface InventoryListQuery extends ListQueryT {
  categoryId?: string
  stockStatus?: StockStatus
}

/** A direct product below its reorder threshold + suggested restock quantity. */
export interface LocalReorderSuggestion {
  productId: string
  name: string
  sku: string | null
  currentStock: number
  /** Reorder point (or low-stock threshold) used as the target. */
  target: number
  suggestedQty: number
  unitCost: number | null
  currency: string
  /** Sales velocity in units/day (trailing window, stock-out days excluded), BIZ-4.6.
   * null when too little history/sales to trust — falls back to the manual target. */
  velocity?: number | null
  /** Days of stock left at the current velocity ("Reste N jours"). null when untrusted. */
  daysCover?: number | null
  /** Whole days the product was out of stock in the window. */
  stockoutDays?: number | null
  /** Unit selling price — feeds revenue-at-risk on the À-commander surface (BIZ-4.5). */
  sellingPrice?: number | null
  /** Last supplier who restocked this product (grouping key on À-commander). */
  supplierId?: string | null
  supplierName?: string | null
  supplierPhone?: string | null
}

/** One line of a restock (a purchase that adds stock). */
export interface RestockItemInput {
  productId: string
  /** Target variant (for variant products); null/omitted for direct/serialized. */
  variantId?: string | null
  /** Quantity received (direct/variant). Omitted for serialized — derived from serialNumbers. */
  quantity?: number
  unitCost?: number | null
  /** Serial numbers received (for serialized products) — each becomes an in-stock unit. */
  serialNumbers?: string[]
}

/** A supplier charge line applied at receive (tax/transport/packaging). */
export interface RestockChargeLineInput {
  id?: string
  chargeTypeId?: string | null
  name: string
  rateType: 'PERCENT' | 'FIXED'
  rateValue: number
  amount: number
}

/** A supplier discount line applied at receive (remise). */
export interface RestockDiscountLineInput {
  id?: string
  description: string
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'
  rate?: number | null
  amount: number
}

/** A split payment line at receive. */
export interface RestockPaymentLineInput {
  method: PaymentMethodT
  amount: number
  mobileMoneyReference?: string | null
}

/** A restock (goods receipt). Optionally fulfils a purchase order and/or is on
 * supplier credit (paid < invoice total → a payable). Settlement mirrors the sell
 * flow: goods subtotal − discounts + charges = invoice total, settled by payments. */
export interface RestockInput {
  items: RestockItemInput[]
  /** PO this receipt fulfils; updates each line's received qty + the PO status. */
  purchaseOrderId?: string | null
  /** Supplier (contact) — required when on credit. */
  supplierId?: string | null
  /** Split payments. When omitted, falls back to `amountPaid` (or fully paid). */
  payments?: RestockPaymentLineInput[]
  /** Legacy single-amount path; superseded by `payments`. */
  amountPaid?: number | null
  /** Supplier discount lines (reduce the invoice total). */
  discounts?: RestockDiscountLineInput[]
  /** Additional charge lines (raise the invoice total). */
  charges?: RestockChargeLineInput[]
  /** Supplier invoice (audit proof). File required when a credit balance remains. */
  invoiceNumber?: string | null
  invoiceDate?: string | null
  invoiceFileUrl?: string | null
  reference?: string | null
  notes?: string | null
}

// ---- Sales (POS checkout) -------------------------------------------------
/** One cart line at checkout. Serialized products pass the chosen in-stock serial
 * unit ids (quantity = their count); variant products pass the variantId. */
export interface SaleLineInput {
  productId: string
  variantId?: string | null
  variantName?: string | null
  serialUnitIds?: string[]
  quantity: number
  unitPrice: number
  /** Catalogue price at cart-add (variant override ?? product selling price). Snapshot
   * so later catalogue changes never move history; defaults to unitPrice if omitted. */
  unitPriceListed?: number
  discountAmount?: number
  costPrice?: number | null
  /** Reason for a price override on this line (BIZ-1.6); defaults to NEGOTIATED. */
  reasonCode?: string | null
  reasonNote?: string | null
}
/** A charge line on the sale (transport, service, payment fee…). Mirrors restock. */
export interface SaleChargeLineInput {
  id?: string
  chargeTypeId?: string | null
  name: string
  rateType: 'PERCENT' | 'FIXED'
  rateValue: number
  amount: number
}
/** A discount line on the sale (remise). */
export interface SaleDiscountLineInput {
  id?: string
  description: string
  discountType:
    | 'PERCENTAGE'
    | 'FIXED_AMOUNT'
    | 'OVERRIDE'
    | 'ROUNDING'
    | 'DAMAGE'
    | 'STAFF_PURCHASE'
  rate?: number | null
  amount: number
  /** LINE-scoped when set (reconciles with that line's discount_amount); null = cart-level. */
  saleItemId?: string | null
  reasonCode?: string | null
  reasonNote?: string | null
}
/** A split-payment line. `SAVINGS` draws from the customer's deposit balance. */
export interface SalePaymentLineInput {
  method: PaymentMethodT
  amount: number
  mobileMoneyReference?: string | null
  savingsAccountId?: string | null
}
/** A checkout. `clientId` is the renderer-generated idempotency key. Goods subtotal
 * − discounts + charges = total, settled by payments; any shortfall on a registered
 * customer becomes a receivable (credit). No tax line (prices are inclusive). */
export interface SaleInput {
  clientId: string
  soldAt?: string
  customerId?: string | null
  customerName?: string | null
  customerPhone?: string | null
  notes?: string | null
  items: SaleLineInput[]
  payments: SalePaymentLineInput[]
  charges?: SaleChargeLineInput[]
  discounts?: SaleDiscountLineInput[]
  /** Manager userId who authorized an over-limit discount via step-up (BIZ-1.4). */
  authorizedByUserId?: string | null
  /** Optional expected payment date ('YYYY-MM-DD') for the credit portion of the sale. */
  creditDueDate?: string | null
  /** Open cash session (till shift) this sale is rung at, so the drawer reconciles. The cloud
   * build sets it from the current session; desktop tags it locally at write time. */
  cashSessionId?: string | null
}
/** An opening balance brought forward for a contact (one per direction). */
export interface OpeningBalanceInput {
  contactId: string
  direction: DebtDirection
  amount: number
  asOfDate?: string | null
  notes?: string | null
}
export interface LocalOpeningBalance {
  id: string
  contactId: string
  direction: DebtDirection
  amount: number
  asOfDate: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface SalesListQuery extends ListQueryT {
  customerId?: string
  status?: string
  paymentMethod?: string
  /** Channel filter: 'ONLINE' | 'IN_STORE' (omit for all). */
  source?: string
  dateFrom?: string
  dateTo?: string
}
/** KPI strip for the Sales dashboard over a date range (revenue, basket, units, refunds). */
export interface LocalSalesSummary {
  revenue: number
  transactions: number
  averageBasket: number
  itemsSold: number
  refundCount: number
  refundAmount: number
  currency: string
}

// --- Expenses ---
export interface LocalExpenseCategory {
  id: string
  name: string
  slug: string | null
  color: string | null
  icon: string | null
  isSystem: boolean
  sortOrder: number
  expenseCount?: number
  /** Sticky default: true once any expense in this category was marked recurring, so new
   * expenses in it default to recurring without re-marking (#5). */
  defaultRecurring?: boolean
}
export interface LocalExpense {
  id: string
  description: string
  amount: number
  currency: string
  expenseDate: string
  vendor: string | null
  notes: string | null
  isRecurring: boolean
  status: string
  paymentMethod: string | null
  categoryId: string | null
  categoryName: string | null
  categoryColor: string | null
  receiptUrl: string | null
  createdAt: string
  updatedAt: string
}
export interface ExpenseInput {
  categoryId: string
  description: string
  amount: number
  expenseDate: string
  vendor?: string | null
  notes?: string | null
  isRecurring?: boolean
  status?: string
  paymentMethod?: string | null
  receiptUrl?: string | null
}
export interface ExpenseCategoryInput {
  name: string
  color: string
  icon?: string | null
}
export interface ExpensesListQuery extends ListQueryT {
  categoryId?: string
  status?: string
  dateFrom?: string
  dateTo?: string
}
/** A category slice of the period's spend (for the donut + legend + largest-category KPI). */
export interface ExpenseCategorySlice {
  categoryId: string
  name: string
  color: string
  amount: number
  percentage: number
}
/** KPI strip + chart data for the Expenses dashboard over the period. */
export interface LocalExpenseSummary {
  total: number
  count: number
  previousTotal: number
  changePct: number
  avgPerDay: number
  pendingCount: number
  pendingAmount: number
  largest: ExpenseCategorySlice | null
  byCategory: ExpenseCategorySlice[]
  currency: string
}
export interface ExpenseTrendItem {
  year: number
  month: number
  label: string
  total: number
}
export interface LocalSaleItem {
  id: string
  productId: string
  productName: string
  variantId: string | null
  variantName: string | null
  serialNumber: string | null
  quantity: number
  unitPrice: number
  unitPriceListed: number | null
  discountAmount: number
  lineTotal: number
}
export interface LocalSalePayment {
  id: string
  method: PaymentMethodT
  amount: number
  mobileMoneyReference: string | null
}
/** A sale summary row (for the list / receipt header). */
export interface LocalSale {
  id: string
  saleNumber: string
  receiptNumber: string
  status: string
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  subtotal: number
  discountAmount: number
  chargesAmount: number
  totalAmount: number
  amountPaid: number
  creditAmount: number
  changeGiven: number
  currency: string
  paymentMethod: string | null
  /** Sale channel: 'ONLINE' | 'IN_STORE' (null on pre-migration rows = in-store). */
  source: string | null
  notes: string | null
  soldAt: string
  createdAt: string
  itemCount: number
  /** Local sync state: 'pending' while a sale still has an unsent/failed outbox row. */
  syncStatus: 'synced' | 'pending'
}
/** A full sale with its lines + payments (for get()/receipt/success screen). */
export interface LocalSaleDetail extends LocalSale {
  items: LocalSaleItem[]
  payments: LocalSalePayment[]
}
/** A customer's deposit balance available to pay from at checkout. */
export interface LocalSavingsBalance {
  id: string
  accountNumber: string
  balance: number
}

// --- Deposits (sessions) — reuse the shared deposit shapes ---
export type {
  CustomerDeposit,
  DepositTransaction,
  DepositStatement,
  DepositStatementEntry,
  DepositTaggedProduct,
  DepositStatus,
  DepositOutcome,
  CreateDepositInput,
  AddDepositPaymentInput,
  CloseDepositInput,
  DepositCloseSettlement,
} from '@biztrack/types'
import type {
  CustomerDeposit as CustomerDepositT,
  DepositTransaction as DepositTransactionT,
  DepositStatement as DepositStatementT,
  CreateDepositInput as CreateDepositInputT,
  AddDepositPaymentInput as AddDepositPaymentInputT,
  CloseDepositInput as CloseDepositInputT,
  CashSession as CashSessionT,
  CashSessionStatus as CashSessionStatusT,
  CashSessionExpectedCash as CashSessionExpectedCashT,
  CashMovement as CashMovementT,
  RecordCashMovementInput as RecordCashMovementInputT,
  CloseCashSessionInput as CloseCashSessionInputT,
  SetCashVarianceReasonInput as SetCashVarianceReasonInputT,
  CashVarianceHistory as CashVarianceHistoryT,
  CashVarianceHistoryQuery as CashVarianceHistoryQueryT,
  CashReportKind as CashReportKindT,
  CashShiftReportData as CashShiftReportDataT,
  CashDailyReportData as CashDailyReportDataT,
  CashDailyReportQuery as CashDailyReportQueryT,
  AuditAction as AuditActionT,
} from '@biztrack/types'

export interface DepositsListQuery extends ListQueryT {
  status?: 'OPEN' | 'CLOSED'
}

export interface CashSessionsListQuery extends ListQueryT {
  status?: CashSessionStatusT
}
export interface OpenCashSessionInput {
  id?: string
  openingFloat?: number
}
export interface TransitionCashSessionInput {
  status: CashSessionStatusT
  closingNote?: string
}
/** A session plus its transactions (for the detail pane). */
export interface LocalDepositDetail extends CustomerDepositT {
  transactions: DepositTransactionT[]
}
// --- Online store / orders — reuse the shared online shapes ---
export type {
  OnlineStore,
  OnlineStoreStatus,
  OnlineStoreLayout,
  OnlineStoreAppearance,
  OnlineCatalogBinding,
  CreateOnlineStoreRequest,
  UpdateOnlineStoreRequest,
  OnlineOrder,
  OnlineOrderDetail,
  OnlineOrderListResult,
  OnlineOrderStatus,
  OnlineOrderEvent,
  OnlineFulfillmentType,
  OnlinePaymentStatus,
  UpdateOrderStatusRequest,
  OrderSerialSelection,
  OnlineCartItem,
  OnlineAdminProduct,
  OnlineAdminProductsQuery,
  OnlinePaymentMethod,
  UpdateOrderPaymentRequest,
  OnlineStorePublicationSummary,
  ProductPublishBlocker,
  ProductPublishability,
} from '@biztrack/types'
// Value export — storefront-readiness check (runtime, shared with the API).
export { checkProductPublishable } from '@biztrack/types'
// Value exports (order state-machine helpers + payment methods) — runtime, not just types.
export {
  ONLINE_ORDER_TRANSITIONS,
  ONLINE_ORDER_COMPLETION_STATUSES,
  canTransitionOnlineOrder,
  isTerminalOnlineOrderStatus,
  ONLINE_PAYMENT_METHODS,
} from '@biztrack/types'
import type {
  OnlineStore as OnlineStoreT,
  CreateOnlineStoreRequest as CreateOnlineStoreT,
  UpdateOnlineStoreRequest as UpdateOnlineStoreT,
  OnlineOrder as OnlineOrderT,
  OnlineOrderDetail as OnlineOrderDetailT,
  OnlineOrderListResult as OnlineOrderListResultT,
  OnlineOrderStatus as OnlineOrderStatusT,
  UpdateOrderStatusRequest as UpdateOrderStatusT,
  UpdateOrderPaymentRequest as UpdateOrderPaymentT,
  OnlineAdminProduct as OnlineAdminProductT,
  OnlineAdminProductsQuery as OnlineAdminProductsQueryT,
  OnlineStorePublicationSummary as OnlineStorePublicationSummaryT,
} from '@biztrack/types'

// --- Business profile (Settings → General) — reuse the shared business shapes ---
export type { BusinessProfile, UpdateBusinessRequest } from '@biztrack/types'
export { BusinessType } from '@biztrack/types'
import type {
  BusinessProfile as BusinessProfileT,
  UpdateBusinessRequest as UpdateBusinessRequestT,
} from '@biztrack/types'

// --- Fiscal calendar + period close (Settings → Accounting periods) ---
export type { FiscalYearWithPeriods, AccountingPeriod, PostingAdjustment } from '@biztrack/types'

// --- Notifications control plane (Settings → Notifications) — server-owned, online-only ---
export type {
  NotificationSettings,
  NotificationChannelToggle,
  NotificationQuietHours,
  NotificationRecipient,
  NotificationRecipientLookupResult,
  UpdateNotificationMatrixRequest,
  UpdateNotificationQuietHoursRequest,
  AddNotificationRecipientRequest,
  UpdateRecipientSubscriptionsRequest,
  UpdateNotificationRecipientRequest,
} from '@biztrack/types'
import type {
  NotificationSettings as NotificationSettingsT,
  FiscalYearWithPeriods as FiscalYearWithPeriodsT,
  AccountingPeriod as AccountingPeriodT,
  PostingAdjustment as PostingAdjustmentT,
  NotificationRecipientLookupResult as NotificationRecipientLookupResultT,
  UpdateNotificationMatrixRequest as UpdateNotificationMatrixRequestT,
  UpdateNotificationQuietHoursRequest as UpdateNotificationQuietHoursRequestT,
  AddNotificationRecipientRequest as AddNotificationRecipientRequestT,
  UpdateRecipientSubscriptionsRequest as UpdateRecipientSubscriptionsRequestT,
  UpdateNotificationRecipientRequest as UpdateNotificationRecipientRequestT,
} from '@biztrack/types'

// --- Plans / subscription (Settings → Subscription) — reuse the shared plan shapes ---
export type {
  ListPlansResponse,
  CurrentSubscriptionResponse,
  QuotaUsageResponse,
  PlanQuotaUsage,
  PlanQuotaResource,
  CancelPlanResponse,
} from '@biztrack/types'
import type {
  ListPlansResponse as ListPlansResponseT,
  CurrentSubscriptionResponse as CurrentSubscriptionResponseT,
  QuotaUsageResponse as QuotaUsageResponseT,
  CancelPlanResponse as CancelPlanResponseT,
} from '@biztrack/types'

// --- Organization → Roles & Team — reuse the shared role/member/invite shapes ---
export type {
  RoleItem,
  RoleWithPermissions,
  PermissionCatalogItem,
  ListRolesResponse,
  ListPermissionsResponse,
  CreateRoleRequest,
  UpdateRoleRequest,
  TeamMember,
  ListTeamMembersResponse,
  UpdateMemberRoleResponse,
  RemoveTeamMemberResponse,
  UpdateMemberStatusResponse,
  PendingInviteItem,
  ListPendingInvitesResponse,
  SendInviteRequest,
  SendInviteResponse,
  ResendInviteResponse,
  CancelInviteResponse,
  BusinessMemberRole,
  BusinessMemberStatus,
  InviteStatus,
} from '@biztrack/types'
import type {
  ListRolesResponse as ListRolesResponseT,
  ListPermissionsResponse as ListPermissionsResponseT,
  RoleWithPermissions as RoleWithPermissionsT,
  CreateRoleRequest as CreateRoleRequestT,
  UpdateRoleRequest as UpdateRoleRequestT,
  ListTeamMembersResponse as ListTeamMembersResponseT,
  UpdateMemberRoleResponse as UpdateMemberRoleResponseT,
  RemoveTeamMemberResponse as RemoveTeamMemberResponseT,
  UpdateMemberStatusResponse as UpdateMemberStatusResponseT,
  ListPendingInvitesResponse as ListPendingInvitesResponseT,
  SendInviteRequest as SendInviteRequestT,
  SendInviteResponse as SendInviteResponseT,
  ResendInviteResponse as ResendInviteResponseT,
  CancelInviteResponse as CancelInviteResponseT,
} from '@biztrack/types'

export interface RolesListQuery {
  page?: number
  limit?: number
  search?: string
}

// --- In-app notifications + invitee-side invitations ---
export type {
  NotificationItem,
  NotificationType,
  ListNotificationsQuery,
  ListNotificationsResponse,
  UnreadCountResponse,
  MarkNotificationReadResponse,
  MarkAllNotificationsReadResponse,
  NotificationEventPayload,
  PendingInvitationItem,
  ListMyInvitationsResponse,
  AcceptInvitationResponse,
  RejectInvitationResponse,
} from '@biztrack/types'
import type {
  ListNotificationsQuery as ListNotificationsQueryT,
  ListNotificationsResponse as ListNotificationsResponseT,
  UnreadCountResponse as UnreadCountResponseT,
  MarkNotificationReadResponse as MarkNotificationReadResponseT,
  MarkAllNotificationsReadResponse as MarkAllNotificationsReadResponseT,
  NotificationEventPayload as NotificationEventPayloadT,
  ListMyInvitationsResponse as ListMyInvitationsResponseT,
  AcceptInvitationResponse as AcceptInvitationResponseT,
  RejectInvitationResponse as RejectInvitationResponseT,
} from '@biztrack/types'

export interface OnlineOrdersQuery {
  status?: OnlineOrderStatusT
  page?: number
  limit?: number
}

/** Result of a subdomain availability check. */
export interface OnlineSlugCheck {
  slug: string
  available: boolean
  reason?: 'invalid' | 'reserved' | 'taken'
}

/** KPI strip for the Deposits dashboard. */
export interface LocalDepositSummary {
  openCount: number
  depositsHeld: number
  collectedCount: number
  collectedAmount: number
  refundedTransferredCount: number
  refundedTransferredAmount: number
  currency: string
}
/** Result of resolving a scanned/typed code (barcode, SKU, or serial) to something sellable. */
export type ScanHit =
  | { kind: 'product'; product: LocalProduct }
  | { kind: 'variant'; product: LocalProduct; variant: LocalVariant }
  | { kind: 'serial'; product: LocalProduct; serial: LocalSerialUnit }

/** A sellable catalog entry for the POS grid: a non-variant product, or one variant of a
 * variant product (each variant is its own tile). */
export type SellEntry =
  | { kind: 'product'; product: LocalProduct }
  | { kind: 'variant'; product: LocalProduct; variant: LocalVariant }

/** Why a stock level changed (mirrors the API's MovementType). */
export type StockMovementType =
  | 'OPENING_STOCK'
  | 'SALE'
  | 'RESTOCK_IN'
  | 'MANUAL_ADJUSTMENT'
  | 'VOID_REVERSAL'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'

/** One stock-ledger entry shown in the product detail stock card (newest first). */
export interface LocalStockMovement {
  id: string
  /** Product id — populated only by the all-products movements list (reports). */
  productId?: string
  /** Product display name — populated only by the all-products movements list (reports). */
  productName?: string | null
  /** The variant this movement affected (null = product-level). */
  variantId?: string | null
  type: StockMovementType
  quantityChange: number
  quantityBefore: number
  quantityAfter: number
  referenceType: string | null
  referenceId: string | null
  notes: string | null
  performedByName: string | null
  createdAt: string
}

/** A product gallery image (the main image stays on the product's imageUrl). */
export interface LocalProductImage {
  id: string
  productId: string
  /** Set when the image belongs to a specific variant; null for a product-level image. */
  variantId: string | null
  url: string
  altText: string | null
  sortOrder: number
}

/** One desired gallery image (id present = existing; absent = newly uploaded). */
export interface ProductImageInput {
  id?: string
  url: string
  altText?: string | null
}

export interface ProductInput {
  name: string
  description?: string | null
  sku?: string | null
  barcode?: string | null
  sellingPrice: number
  costPrice?: number | null
  taxRate?: number
  unitOfMeasureId: string
  categoryId?: string | null
  brandId?: string | null
  modelId?: string | null
  imageUrl?: string | null
  productType?: ProductType
  isService?: boolean
  isActive?: boolean
  isFeatured?: boolean
  isPublishedOnline?: boolean
  onlineDescription?: string | null
  onlineStockReserve?: number
  metaTitle?: string | null
  metaDescription?: string | null
  isSerialized?: boolean
  serialType?: SerialType | null
  warrantyMonths?: number | null
  uniqueItems?: boolean
  openingStock?: number
  lowStockThreshold?: number | null
  reorderPoint?: number | null
}

// ---- Brands & Models ------------------------------------------------------
/** A model under a brand, stored locally. */
export interface LocalModel {
  id: string
  brandId: string
  name: string
  isActive: boolean
  sortOrder: number
}

/** A brand with its category links (M2M) + models, stored locally. */
export interface LocalBrand {
  id: string
  name: string
  slug: string | null
  logoUrl: string | null
  description: string | null
  isActive: boolean
  sortOrder: number
  categoryIds: string[]
  models: LocalModel[]
}

export interface BrandInput {
  name: string
  logoUrl?: string | null
  description?: string | null
  /** Category ids to link (M2M). A brand must have at least one. */
  categoryIds: string[]
  sortOrder?: number
  isActive?: boolean
}

export interface ModelInput {
  name: string
  isActive?: boolean
}

/** A file the renderer hands to main for upload to the API storage service. */
export interface UploadFileInput {
  /** Raw file bytes (from File.arrayBuffer()). */
  bytes: ArrayBuffer
  filename: string
  contentType: string
  /** Logical folder/prefix within the business (e.g. 'categories'). */
  folder?: string
}

/** Result of a successful upload — persist `url` on the owning record. */
export interface UploadedFile {
  key: string
  url: string
}

/** Sync engine status surfaced to the renderer (no tokens, no payloads). */
export interface SyncStatus {
  state: 'idle' | 'syncing' | 'offline' | 'error'
  lastSyncedAt: string | null
  pendingCount: number
  /** Records waiting on a dependency to sync first (auto-retried). */
  deferredCount: number
  /** Records that errored and are backing off for retry. */
  failedCount: number
  /** Records that exhausted retries — need manual retry. */
  deadCount: number
  lastError: string | null
}

export interface TitleBarOverlayColors {
  /** Background of the native caption-button band (hex). */
  color: string
  /** Symbol (− □ ×) colour (hex). */
  symbolColor: string
}

export interface SkeletonCheckDTO {
  value: string
  checkedAt: string
}

export interface SkeletonHealthDTO {
  ok: boolean
  productCount: number
  skeletonValue: string | null
  source: 'local-sqlite'
}

/** Why an offline manager-PIN verification was denied. */
export type PinVerifyReason = 'STALE_DEVICE' | 'NO_MATCH' | 'INVALID_FORMAT' | 'LOCKED_OUT'

/** Result of an offline manager-PIN step-up check. */
export interface PinVerifyResult {
  authorized: boolean
  reason?: PinVerifyReason
  /** The manager whose PIN matched — recorded as `authorized_by` on the action. */
  authorizedByUserId: string | null
  authorizedByName: string | null
  /** Failed attempts left before a lockout (present on a NO_MATCH). */
  attemptsRemaining?: number
  /** ISO time the device lockout ends (present on a LOCKED_OUT). */
  lockedUntil?: string
}

/** The shape exposed on `window.api` by the preload bridge. */
export interface BridgeApi {
  skeleton: {
    getCheck: () => Promise<SkeletonCheckDTO | null>
    getHealth: () => Promise<SkeletonHealthDTO>
  }
  theme: {
    set: (theme: 'light' | 'dark' | 'system') => void
  }
  window: {
    /** Paint the native window controls to match the current top bar. */
    setTitleBarOverlay: (colors: TitleBarOverlayColors) => void
  }
  auth: {
    getSession: () => Promise<SessionStatus>
    login: (identifier: string, password: string) => Promise<AuthFlowResult>
    requestLogin: (identifier: string, channel?: OtpChannel) => Promise<AuthFlowResult>
    loginOtp: (identifier: string, code: string) => Promise<AuthFlowResult>
    requestPasswordReset: (identifier: string, channel?: OtpChannel) => Promise<AuthFlowResult>
    resetPassword: (
      identifier: string,
      code: string,
      newPassword: string,
    ) => Promise<AuthFlowResult>
    verifyPhone: (phone: string, code: string, inviteToken?: string) => Promise<AuthFlowResult>
    verifyEmail: (email: string, code: string, inviteToken?: string) => Promise<AuthFlowResult>
    resendOtp: (identifier: string, type: string, channel?: OtpChannel) => Promise<AuthFlowResult>
    register: (payload: RegisterPayload) => Promise<AuthFlowResult>
    getInvitePreview: (token: string) => Promise<InvitePreviewResult>
    acceptInvite: (token: string) => Promise<AuthFlowResult>
    rejectInvite: (token: string) => Promise<{ ok: boolean; error?: string }>
    setupBusiness: (payload: BusinessSetupPayload) => Promise<AuthFlowResult>
    listPlans: () => Promise<PlanList>
    selectPlan: (plan: string, billingCycle?: BillingCycle) => Promise<AuthFlowResult>
    selectBusiness: (businessId: string) => Promise<AuthFlowResult>
    listBusinesses: () => Promise<BusinessOption[]>
    offlineLogin: (password: string) => Promise<AuthFlowResult>
    logout: () => Promise<SessionStatus>
  }
  pin: {
    /** Set or rotate the current user's manager PIN (requires connectivity). */
    set: (pin: string) => Promise<{ pinVersion: number }>
    /** Verify a manager PIN offline for step-up authorization. */
    verify: (pin: string) => Promise<PinVerifyResult>
    /** Verify a scanned authorization card token offline (BIZ-3.3). */
    verifyCard: (token: string) => Promise<PinVerifyResult>
    /** Whether the current user's role may set a PIN and authorize step-up. */
    canManage: () => Promise<boolean>
  }
  /** Authorization cards (BIZ-3.3). Owner-only; online — the server owns issuance/revocation. */
  credentials: {
    list: () => Promise<MemberAuthCredentialT[]>
    issueCard: (input: IssueCardRequestT) => Promise<IssueCardResponseT>
    revoke: (id: string) => Promise<MemberAuthCredentialT>
  }
  sync: {
    /** Run a push+pull cycle now. */
    trigger: () => Promise<void>
    /** Reset the pull cursor and re-pull every record from the server (full resync). */
    fullSync: () => Promise<void>
    /** Requeue dead/failed/deferred records and sync now. */
    retry: () => Promise<void>
    getStatus: () => Promise<SyncStatus>
    /** Subscribe to status changes; returns an unsubscribe fn. */
    onStatus: (cb: (status: SyncStatus) => void) => () => void
  }
  categories: {
    list: (query?: CategoryListQuery) => Promise<PaginatedT<LocalCategory>>
    /** Full set (no pagination) — for tree/parent pickers. */
    listAll: () => Promise<LocalCategory[]>
    /** Terminal/leaf categories a product can target (optionally brand-scoped). */
    listSelectable: (query?: CategorySelectableQuery) => Promise<LocalCategory[]>
    /** Categories eligible to be a parent (depth<3, no products, no variant options). */
    listParentOptions: (query?: CategoryParentOptionsQuery) => Promise<LocalCategory[]>
    create: (input: CategoryInput) => Promise<LocalCategory>
    update: (id: string, input: CategoryInput) => Promise<LocalCategory>
    remove: (id: string) => Promise<void>
  }
  attributes: {
    listGroups: (query?: AttributeGroupListQuery) => Promise<PaginatedT<LocalAttributeGroup>>
    /** Full set (no pagination) — for the category form's attribute attach list. */
    listAllGroups: () => Promise<LocalAttributeGroup[]>
    createGroup: (input: AttributeGroupInput) => Promise<LocalAttributeGroup>
    updateGroup: (id: string, input: AttributeGroupInput) => Promise<LocalAttributeGroup>
    deleteGroup: (id: string) => Promise<void>
    addOption: (groupId: string, input: AttributeOptionInput) => Promise<LocalAttributeOption>
    updateOption: (optionId: string, input: AttributeOptionInput) => Promise<LocalAttributeOption>
    deleteOption: (optionId: string) => Promise<void>
    listCategoryLinks: (categoryId: string) => Promise<LocalCategoryAttributeGroup[]>
    /** Replace a category's attached groups with `links` (diffs + enqueues changes). */
    setCategoryLinks: (categoryId: string, links: CategoryAttributeLinkInput[]) => Promise<void>
  }
  units: {
    list: (query?: UnitListQuery) => Promise<PaginatedT<LocalUnit>>
    create: (input: UnitInput) => Promise<LocalUnit>
    update: (id: string, input: UnitInput) => Promise<LocalUnit>
    remove: (id: string) => Promise<void>
  }
  brands: {
    list: (query?: BrandListQuery) => Promise<PaginatedT<LocalBrand>>
    get: (id: string) => Promise<LocalBrand | null>
    create: (input: BrandInput) => Promise<LocalBrand>
    update: (id: string, input: BrandInput) => Promise<LocalBrand>
    remove: (id: string) => Promise<void>
    addModel: (brandId: string, input: ModelInput) => Promise<LocalModel>
    updateModel: (modelId: string, input: ModelInput) => Promise<LocalModel>
    removeModel: (modelId: string) => Promise<void>
  }
  products: {
    list: (query?: ProductListQuery) => Promise<PaginatedT<LocalProduct>>
    /** Every product matching the filters, unpaginated — for CSV/PDF catalogue export. */
    listAll: (query?: ProductListQuery) => Promise<LocalProduct[]>
    /** Flattened sellable catalog for the POS grid: products + one entry per variant. */
    listSellable: (query?: ProductListQuery) => Promise<PaginatedT<SellEntry>>
    stats: () => Promise<ProductStats>
    get: (id: string) => Promise<LocalProduct | null>
    create: (input: ProductInput) => Promise<LocalProduct>
    update: (id: string, input: ProductInput) => Promise<LocalProduct>
    remove: (id: string) => Promise<void>
    /** Images for a product (variantId omitted/null) or a specific variant. */
    listImages: (productId: string, variantId?: string | null) => Promise<LocalProductImage[]>
    /** Replace a product's — or a variant's — gallery (diff + enqueues changes). */
    setImages: (
      productId: string,
      images: ProductImageInput[],
      variantId?: string | null,
    ) => Promise<void>
    listVariants: (productId: string) => Promise<LocalVariant[]>
    /** Paginated variants for the product-detail management section (default limit 5). */
    listVariantsPage: (productId: string, query?: ListQueryT) => Promise<PaginatedT<LocalVariant>>
    /** Set a product's initial variants at creation. */
    setVariants: (productId: string, variants: VariantInput[]) => Promise<void>
    /** Add a variant post-creation (opening stock → stock-in movement). */
    addVariant: (productId: string, input: VariantInput) => Promise<LocalVariant>
    /** Edit a variant's catalog info (no movement). */
    updateVariant: (
      productId: string,
      variantId: string,
      input: VariantInput,
    ) => Promise<LocalVariant>
    /** Remove a variant (writes off its stock) with a reason. */
    removeVariant: (productId: string, variantId: string, reason: string) => Promise<void>
    listSerialUnits: (productId: string) => Promise<LocalSerialUnit[]>
    /** Paginated serial units for the product-detail management section (default limit 5). */
    listSerialUnitsPage: (
      productId: string,
      query?: SerialUnitsPageQuery,
    ) => Promise<PaginatedT<LocalSerialUnit>>
    /** IN_STOCK serial units a sale can consume (optionally scoped to a variant + serial search). */
    listInStockSerials: (
      productId: string,
      variantId?: string | null,
      search?: string,
    ) => Promise<LocalSerialUnit[]>
    /** Resolve a scanned/typed code (barcode, SKU, serial) to something sellable. */
    resolveScan: (code: string) => Promise<ScanHit | null>
    /** Set a product's initial serial units at creation (opening stock). */
    setSerialUnits: (productId: string, units: SerialUnitInput[]) => Promise<void>
    /** Add units to stock post-creation (a stock-in movement); revives retired numbers. */
    addSerialUnits: (
      productId: string,
      units: SerialUnitInput[],
      notes?: string | null,
    ) => Promise<LocalSerialUnit[]>
    /** Retire a unit from stock (a stock-out movement) with a reason. */
    retireSerialUnit: (productId: string, unitId: string, reason: string) => Promise<void>
    /** Correct a unit's serial number (no movement). */
    updateSerialNumber: (
      productId: string,
      unitId: string,
      serialNumber: string,
    ) => Promise<LocalSerialUnit>
    /** Edit a unique serial unit's mini-product fields (image/description/SEO). */
    updateSerialUnit: (
      productId: string,
      unitId: string,
      input: SerialUnitUpdateInput,
    ) => Promise<LocalSerialUnit>
    /** Stock-ledger entries for the detail stock card (newest first). */
    listMovements: (productId: string) => Promise<LocalStockMovement[]>
  }
  inventory: {
    /** Tracked products with stock levels + thresholds (paginated). */
    list: (query?: InventoryListQuery) => Promise<PaginatedT<LocalInventoryItem>>
    /** KPI roll-up for the inventory header. */
    stats: () => Promise<InventoryStats>
    /** Direct products needing reorder + suggested quantities (for the Generate-PO flow). */
    reorderSuggestions: () => Promise<LocalReorderSuggestion[]>
    /** Restock (cash/cost) — adds stock + a RESTOCK_IN movement. Direct products only. */
    restock: (input: RestockInput) => Promise<void>
    /** Manually adjust a direct product's stock (set/add/remove) → a movement. */
    adjust: (productId: string, input: AdjustStockInput) => Promise<void>
    /** Set reorder/low-stock thresholds (no movement). */
    setThreshold: (productId: string, input: ThresholdInput) => Promise<void>
    /** Paginated stock-movement ledger for a product. */
    listMovements: (
      productId: string,
      query?: MovementsQuery,
    ) => Promise<PaginatedT<LocalStockMovement>>
    /** Paginated stock-movement ledger across ALL products (for the Stock Movements report). */
    listAllMovements: (query?: MovementsQuery) => Promise<PaginatedT<LocalStockMovement>>
    /** Inventory turnover per product over the range (Inventory Turnover report). */
    turnover: (query?: MovementsQuery) => Promise<InventoryTurnoverRow[]>
    /** Dead / slow-moving stock (no sale in 60+ days) + total stock cost (Dead Stock report). */
    deadStock: () => Promise<{ rows: DeadStockRow[]; stockCostTotal: number }>
    /** Restock unit-cost trend per product (Supplier Price Trend report). */
    supplierPriceTrend: () => Promise<SupplierPriceRow[]>
  }
  contacts: {
    /** Paginated contacts with outstanding balances (default 20). */
    list: (query?: ContactsQuery) => Promise<PaginatedT<LocalContactListItem>>
    /** Aggregate balances + per-tab counts for the list header. */
    summary: () => Promise<ContactsSummary>
    /** Full active supplier set (type SUPPLIER|BOTH) — for PO/RFQ pickers. */
    listAllSuppliers: () => Promise<LocalContact[]>
    /** Full active customer set (type CUSTOMER|BOTH) — for sale/debt pickers. */
    listAllCustomers: () => Promise<LocalContact[]>
    get: (id: string) => Promise<LocalContactListItem | null>
    create: (input: CreateContactRequest) => Promise<LocalContact>
    update: (id: string, input: UpdateContactRequest) => Promise<LocalContact>
    /** Deactivate a contact (blocked if it has open debts). */
    remove: (id: string) => Promise<void>
  }
  debts: {
    /** Paginated debts for a contact (the contact-detail ledger). */
    listByContact: (contactId: string, query?: DebtsQuery) => Promise<PaginatedT<LocalDebt>>
    /** Chronological account statement (debits/credits/running balance) for a direction. */
    statement: (contactId: string, direction: DebtDirection) => Promise<ContactStatement>
    /** Record a payment against a debt; returns the updated debt. */
    recordPayment: (debtId: string, input: RecordDebtPaymentRequest) => Promise<LocalDebt>
    /** Set/clear a debt's expected payment date (null → default credit period). */
    updateDueDate: (debtId: string, dueDate: string | null) => Promise<LocalDebt>
    /** Net a Both-contact's receivable vs payable with OFFSET contra-payments (oldest first). */
    offset: (contactId: string) => Promise<{ offsetAmount: number; affected: number }>
    /** Ageing report (buckets outstanding balances by debt age) for one direction. */
    ageing: (direction: DebtDirection) => Promise<AgeingReport>
  }
  openingBalances: {
    /** Create/update a contact's opening balance for a direction. */
    upsert: (input: OpeningBalanceInput) => Promise<LocalOpeningBalance>
    /** A contact's opening balances (one per direction). */
    listForContact: (contactId: string) => Promise<LocalOpeningBalance[]>
  }
  expenses: {
    /** Paginated expense ledger (newest first). */
    list: (query?: ExpensesListQuery) => Promise<PaginatedT<LocalExpense> & { totalAmount: number }>
    get: (id: string) => Promise<LocalExpense | null>
    /** KPI strip + donut + largest/pending totals over the period. */
    summary: (query?: ExpensesListQuery) => Promise<LocalExpenseSummary>
    /** Last-6-months spend trend (for the bar chart). */
    trend: () => Promise<ExpenseTrendItem[]>
    create: (input: ExpenseInput) => Promise<LocalExpense>
    update: (id: string, input: ExpenseInput) => Promise<LocalExpense>
    /** Flip status; marking PAID requires a payment method, PENDING clears it. */
    setStatus: (id: string, status: string, paymentMethod?: string | null) => Promise<LocalExpense>
    remove: (id: string) => Promise<void>
  }
  expenseCategories: {
    /** System + business expense categories (for the filter + form picker). */
    listAll: () => Promise<LocalExpenseCategory[]>
    create: (input: ExpenseCategoryInput) => Promise<LocalExpenseCategory>
  }
  rfqs: {
    list: (query?: RfqsQuery) => Promise<PaginatedT<LocalRfqListItem>>
    get: (id: string) => Promise<LocalRfqDetail | null>
    create: (input: CreateRfqRequest) => Promise<LocalRfqDetail>
    /** Record a supplier's quote against an RFQ. */
    recordQuote: (rfqId: string, input: RecordRfqQuoteRequest) => Promise<LocalRfqDetail>
    /** Build the printable document view-model for an RFQ addressed to one supplier. */
    buildDocument: (rfqId: string, supplierId: string) => Promise<RfqDocument>
    /** Generate the PDF + open the WhatsApp/email composer for one supplier; marks sent. */
    send: (rfqId: string, supplierId: string, channel: RfqSendChannel) => Promise<LocalRfqDetail>
  }
  purchaseOrders: {
    list: (query?: PurchaseOrdersQuery) => Promise<PaginatedT<LocalPurchaseOrderListItem>>
    get: (id: string) => Promise<LocalPurchaseOrderDetail | null>
    create: (input: CreatePurchaseOrderRequest) => Promise<LocalPurchaseOrderDetail>
    /** Create a PO from a chosen RFQ supplier quote (marks the RFQ converted). */
    createFromRfq: (
      rfqId: string,
      input: ConvertRfqToPoRequest,
    ) => Promise<LocalPurchaseOrderDetail>
    buildDocument: (poId: string) => Promise<PurchaseOrderDocument>
    /** Generate the PDF + open the WhatsApp/email composer for the supplier; marks sent. */
    send: (poId: string, channel: PurchaseOrderSendChannel) => Promise<LocalPurchaseOrderDetail>
    cancel: (poId: string) => Promise<LocalPurchaseOrderDetail>
  }
  documents: {
    /** Online: server renders the PDF + dispatches (WhatsApp/email) to the recipient. */
    send: (input: DocumentSendInput) => Promise<void>
    /** Render the PDF locally and save it via a native dialog. Works offline. */
    downloadPdf: (input: DocumentDownloadInput) => Promise<DocumentDownloadResult>
    /** Render an arbitrary (trusted, app-generated) HTML document to PDF + save dialog. */
    downloadHtmlPdf: (html: string, filename: string) => Promise<DocumentDownloadResult>
    /** Share an app-generated HTML doc as a PDF via the WhatsApp/email composer (offline-first). */
    shareHtmlPdf: (input: ShareHtmlPdfInput) => Promise<void>
  }
  audit: {
    /** Read the local audit trail (newest first), optionally scoped to an entity. */
    list: (query?: AuditListQuery) => Promise<PaginatedT<LocalAuditLog>>
    /** Record a held-cart line that was rung then removed before checkout (BIZ-2.9). This is
     * local-only — a held cart has no DB row, so there is no server-side equivalent. */
    saleLineRemoved: (input: SaleLineRemovedInput) => Promise<void>
  }
  uploads: {
    /** Upload a file (image/pdf) through the API storage service; returns its URL. */
    file: (input: UploadFileInput) => Promise<UploadedFile>
  }
  charges: {
    /** Active charge types (system + business) for the receive/settle charge picker. */
    listActive: () => Promise<ChargeTypeT[]>
  }
  sales: {
    /** Ring up a checkout (idempotent on clientId). Returns the saved sale + lines. */
    create: (input: SaleInput) => Promise<LocalSaleDetail>
    /** The current cashier's role discount limits (to prompt step-up when exceeded). */
    myDiscountLimits: () => Promise<RoleDiscountLimits>
    /** Whether the cart needs manager auth on margin grounds (below cost + role
     * disallows). Returns only a boolean — the cost figure never leaves the main process. */
    belowCostCheck: (
      lines: Array<{ productId: string; variantId?: string | null; unitPrice: number }>,
    ) => Promise<boolean>
    list: (query?: SalesListQuery) => Promise<PaginatedT<LocalSale>>
    /** All sales matching the filters (no pagination) — for CSV export. */
    listAll: (query?: SalesListQuery) => Promise<LocalSale[]>
    /** KPI strip totals over the filtered date range. */
    summary: (query?: SalesListQuery) => Promise<LocalSalesSummary>
    /** Daily sales series (one row per day) for the Daily Sales Summary report. */
    dailySeries: (query?: SalesListQuery) => Promise<DailySalesRow[]>
    /** Per-cashier performance roster over the range for the Cashier Performance report. */
    cashierRoster: (query?: SalesListQuery) => Promise<CashierPerformanceRow[]>
    /** Per-product revenue/COGS/margin over the range (Sales by Product report). */
    byProduct: (query?: SalesListQuery) => Promise<SalesByProductRow[]>
    /** Sales split by payment method over the range (Sales by Payment Method report). */
    byPaymentMethod: (query?: SalesListQuery) => Promise<SalesByPaymentRow[]>
    /** Refunds & returns (by reason + by cashier) over the range. */
    refunds: (
      query?: SalesListQuery,
    ) => Promise<{ byReason: RefundReasonRow[]; byCashier: RefundCashierRow[]; grossSales: number }>
    /** Product revenue + COGS over the range (feeds the Income Statement). */
    grossProfit: (query?: SalesListQuery) => Promise<{ revenue: number; cogs: number }>
    /** Headline discount numbers over the range (Discount Summary report). */
    discountSummary: (query?: SalesListQuery) => Promise<DiscountSummary>
    /** Discount total + rate ranked per cashier (Discounts by Cashier report). */
    discountsByCashier: (query?: SalesListQuery) => Promise<DiscountByCashierRow[]>
    /** Discount total + margin-after-discount per product (Discounts by Product report). */
    discountsByProduct: (query?: SalesListQuery) => Promise<DiscountByProductRow[]>
    /** Over-limit + below-cost discount rows, most recent first (Flagged Discounts report). */
    flaggedDiscounts: (query?: SalesListQuery) => Promise<FlaggedDiscountRow[]>
    get: (id: string) => Promise<LocalSaleDetail | null>
    /** Void a completed sale (reverses stock/serials/deposit/debt locally + syncs). Reason 10-1000 chars. */
    void: (saleId: string, reason: string) => Promise<LocalSaleDetail>
    /** Refund/return a sale in full or partially (BIZ-1.8). Offline-first — records the return
     * locally + syncs; returns the updated sale. */
    refund: (saleId: string, input: RefundSaleInput) => Promise<LocalSaleDetail>
    /** Send the receipt to the customer. Online → server dispatches; offline → share composer. */
    sendReceipt: (
      saleId: string,
      channel: DocumentSendChannel,
      locale: string,
      opts?: { recipient?: DocumentRecipient; online?: boolean },
    ) => Promise<void>
    /** Print the receipt directly to the connected printer; falls back to saving a PDF.
     * Pass reprint=true from sales history so the reprint is audited (BIZ-2.9). */
    printReceipt: (
      saleId: string,
      locale: string,
      reprint?: boolean,
    ) => Promise<{ printed: boolean; pdfPath?: string }>
    /** Render the receipt to a PDF and save it via the native dialog. */
    downloadReceipt: (saleId: string, locale: string) => Promise<{ saved: boolean; path?: string }>
    /** The compiled receipt HTML (for the success-screen preview). */
    receiptHtml: (saleId: string, locale: string) => Promise<string | null>
  }
  savings: {
    /** A customer's OPEN deposit session balance (null if none) — for the Sell "Deposit" tender. */
    getForCustomer: (customerId: string) => Promise<LocalSavingsBalance | null>
  }
  deposits: {
    list: (query?: DepositsListQuery) => Promise<PaginatedT<CustomerDepositT>>
    get: (id: string) => Promise<LocalDepositDetail | null>
    statement: (id: string) => Promise<DepositStatementT | null>
    summary: () => Promise<LocalDepositSummary>
    create: (input: CreateDepositInputT) => Promise<CustomerDepositT>
    addPayment: (id: string, input: AddDepositPaymentInputT) => Promise<CustomerDepositT>
    close: (id: string, input: CloseDepositInputT) => Promise<CustomerDepositT>
    /** Compiled deposit-receipt HTML for one transaction (fed to the shared share dialog). */
    receiptHtml: (transactionId: string, locale: string) => Promise<string | null>
    /** Compiled full-session report HTML (fed to the shared share dialog). */
    reportHtml: (id: string, locale: string) => Promise<string | null>
  }
  /** Cash sessions (till shifts) — offline-first; open/transition + read (BIZ-2.1). */
  cashSessions: {
    list: (query?: CashSessionsListQuery) => Promise<PaginatedT<CashSessionT>>
    get: (id: string) => Promise<CashSessionT | null>
    /** This device's live session (OPEN/COUNTING) or null — drives the POS shift banner. */
    current: () => Promise<CashSessionT | null>
    open: (input?: OpenCashSessionInput) => Promise<CashSessionT>
    transition: (id: string, input: TransitionCashSessionInput) => Promise<CashSessionT>
    /** Close a shift with a blind denomination count → variance (BIZ-2.4). */
    close: (id: string, input: CloseCashSessionInputT) => Promise<CashSessionT>
    /** Record why a just-closed shift was out of tolerance (BIZ-2.6). */
    setVarianceReason: (id: string, input: SetCashVarianceReasonInputT) => Promise<CashSessionT>
    /** Per-cashier drawer-accuracy history over the last N days (BIZ-2.6). */
    varianceHistory: (query?: CashVarianceHistoryQueryT) => Promise<CashVarianceHistoryT>
    /** Z-report (close) or X-report (mid-shift read) for a shift (BIZ-2.6). */
    shiftReport: (id: string, kind?: CashReportKindT) => Promise<CashShiftReportDataT | null>
    /** Daily close — every shift in a day + rolled-up totals (BIZ-2.6). */
    dailyReport: (query?: CashDailyReportQueryT) => Promise<CashDailyReportDataT>
    /** Whether the signed-in user's role runs a till (drives the login shift prompt). */
    roleTracksDrawer: () => Promise<boolean>
    /** An OPEN session older than the max-shift window (orphan), or null (BIZ-2.5). */
    staleOpen: () => Promise<CashSessionT | null>
    /** Force-close an orphaned shift as RECOVERED (variance stays unknown). */
    recover: (id: string) => Promise<CashSessionT>
    /** Expected drawer cash + its breakdown for a session (BIZ-2.2). */
    expectedCash: (id: string) => Promise<CashSessionExpectedCashT | null>
    /** Record a cash movement against the open shift (BIZ-2.3). */
    recordMovement: (input: RecordCashMovementInputT) => Promise<CashMovementT>
    /** Cash movements for a session, newest first. */
    listMovements: (sessionId: string) => Promise<CashMovementT[]>
  }
  /** Online store / orders — API-only (proxied through main); requires connectivity. */
  online: {
    getStore: () => Promise<OnlineStoreT | null>
    createStore: (input: CreateOnlineStoreT) => Promise<OnlineStoreT>
    updateStore: (input: UpdateOnlineStoreT) => Promise<OnlineStoreT>
    publishStore: () => Promise<OnlineStoreT>
    listPublications: () => Promise<OnlineStorePublicationSummaryT[]>
    restorePublication: (version: number) => Promise<OnlineStoreT>
    listOrders: (query?: OnlineOrdersQuery) => Promise<OnlineOrderListResultT>
    getOrder: (id: string) => Promise<OnlineOrderDetailT>
    updateOrderStatus: (id: string, input: UpdateOrderStatusT) => Promise<OnlineOrderT>
    updateOrderPayment: (id: string, input: UpdateOrderPaymentT) => Promise<OnlineOrderDetailT>
    checkSlug: (slug: string) => Promise<OnlineSlugCheck>
    listProducts: (query?: OnlineAdminProductsQueryT) => Promise<PaginatedT<OnlineAdminProductT>>
    setProductPublished: (id: string, published: boolean) => Promise<void>
  }
  /** Business profile (Settings → General) — server-owned, proxied through main. */
  business: {
    getProfile: () => Promise<BusinessProfileT | null>
    update: (payload: UpdateBusinessRequestT) => Promise<BusinessProfileT>
  }
  /** Notification preferences (Settings → Notifications) — server-owned, proxied through main. */
  notificationSettings: {
    get: () => Promise<NotificationSettingsT>
    listTimezones: () => Promise<string[]>
    lookupContact: (q: string) => Promise<NotificationRecipientLookupResultT>
    updateMatrix: (body: UpdateNotificationMatrixRequestT) => Promise<NotificationSettingsT>
    updateQuietHours: (body: UpdateNotificationQuietHoursRequestT) => Promise<NotificationSettingsT>
    addRecipient: (body: AddNotificationRecipientRequestT) => Promise<NotificationSettingsT>
    updateRecipient: (
      id: string,
      body: UpdateNotificationRecipientRequestT,
    ) => Promise<NotificationSettingsT>
    updateRecipientSubscriptions: (
      id: string,
      body: UpdateRecipientSubscriptionsRequestT,
    ) => Promise<NotificationSettingsT>
    removeRecipient: (id: string) => Promise<NotificationSettingsT>
  }
  /** Fiscal calendar + period close (Settings → Accounting periods) — server-owned, proxied. */
  fiscal: {
    calendar: () => Promise<FiscalYearWithPeriodsT[]>
    adjustments: () => Promise<PostingAdjustmentT[]>
    closePeriod: (id: string) => Promise<AccountingPeriodT>
    lockPeriod: (id: string) => Promise<AccountingPeriodT>
  }
  /** Plans / subscription (Settings → Subscription) — server-owned, proxied through main. */
  plans: {
    list: () => Promise<ListPlansResponseT>
    subscription: () => Promise<CurrentSubscriptionResponseT>
    quotaUsage: () => Promise<QuotaUsageResponseT>
    upgrade: (plan: string) => Promise<void>
    cancel: () => Promise<CancelPlanResponseT>
  }
  /** Organization → Roles — server-owned, online-only, proxied through main. */
  roles: {
    list: (query?: RolesListQuery) => Promise<ListRolesResponseT>
    permissions: () => Promise<ListPermissionsResponseT>
    get: (id: string) => Promise<RoleWithPermissionsT>
    create: (input: CreateRoleRequestT) => Promise<RoleWithPermissionsT>
    update: (id: string, input: UpdateRoleRequestT) => Promise<RoleWithPermissionsT>
    remove: (id: string) => Promise<{ deleted: boolean }>
    setPermissions: (id: string, permissions: string[]) => Promise<RoleWithPermissionsT>
  }
  /** Organization → Team (members + invites) — server-owned, online-only. */
  team: {
    listMembers: () => Promise<ListTeamMembersResponseT>
    updateMemberRole: (userId: string, roleId: string) => Promise<UpdateMemberRoleResponseT>
    removeMember: (userId: string) => Promise<RemoveTeamMemberResponseT>
    setMemberActive: (userId: string, active: boolean) => Promise<UpdateMemberStatusResponseT>
    listInvites: () => Promise<ListPendingInvitesResponseT>
    sendInvite: (input: SendInviteRequestT) => Promise<SendInviteResponseT>
    resendInvite: (id: string) => Promise<ResendInviteResponseT>
    cancelInvite: (id: string) => Promise<CancelInviteResponseT>
  }
  notifications: {
    list: (query?: ListNotificationsQueryT) => Promise<ListNotificationsResponseT>
    unreadCount: () => Promise<UnreadCountResponseT>
    markRead: (id: string) => Promise<MarkNotificationReadResponseT>
    markAllRead: () => Promise<MarkAllNotificationsReadResponseT>
    /** (Re)connect the realtime socket and subscribe to this user's room. */
    connect: () => Promise<void>
    /** Subscribe to realtime notification pushes; returns an unsubscribe fn. */
    onEvent: (cb: (payload: NotificationEventPayloadT) => void) => () => void
  }
  invitations: {
    list: () => Promise<ListMyInvitationsResponseT>
    accept: (businessId: string) => Promise<AcceptInvitationResponseT>
    reject: (businessId: string) => Promise<RejectInvitationResponseT>
  }
  /** Deep links from the OS (biztrack:// custom protocol → a native-app handoff, N7). */
  deeplink: {
    /** Subscribe to in-app navigation requests (route path); returns an unsubscribe fn. */
    onNavigate: (cb: (path: string) => void) => () => void
  }
}
