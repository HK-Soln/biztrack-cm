import type {
  AttributeGroupInput,
  AttributeGroupListQuery,
  AttributeOptionInput,
  BrandInput,
  ChargeType,
  BrandListQuery,
  CategoryAttributeLinkInput,
  CategoryInput,
  CategoryListQuery,
  CategoryParentOptionsQuery,
  CategorySelectableQuery,
  ContactsQuery,
  DocumentRecipient,
  DocumentSendChannel,
  ContactsSummary,
  CreateContactRequest,
  UpdateContactRequest,
  LocalContact,
  LocalContactListItem,
  DebtsQuery,
  DebtDirection,
  ContactStatement,
  AgeingReport,
  RecordDebtPaymentRequest,
  LocalDebt,
  CreateRfqRequest,
  RfqsQuery,
  RecordRfqQuoteRequest,
  RfqDocument,
  RfqSendChannel,
  LocalRfqDetail,
  LocalRfqListItem,
  CreatePurchaseOrderRequest,
  ConvertRfqToPoRequest,
  PurchaseOrdersQuery,
  PurchaseOrderSendChannel,
  PurchaseOrderDocument,
  LocalPurchaseOrderDetail,
  LocalPurchaseOrderListItem,
  DocumentSendInput,
  DocumentDownloadInput,
  DocumentDownloadResult,
  ShareHtmlPdfInput,
  LocalAttributeGroup,
  LocalAttributeOption,
  LocalBrand,
  LocalCategory,
  LocalCategoryAttributeGroup,
  LocalModel,
  AuditListQuery,
  LocalAuditLog,
  AdjustStockInput,
  InventoryListQuery,
  InventoryStats,
  LocalInventoryItem,
  LocalReorderSuggestion,
  LocalProduct,
  LocalProductImage,
  LocalOpeningBalance,
  OpeningBalanceInput,
  LocalExpense,
  LocalExpenseCategory,
  LocalExpenseSummary,
  ExpenseInput,
  ExpenseCategoryInput,
  ExpensesListQuery,
  ExpenseTrendItem,
  LocalSale,
  LocalSaleDetail,
  LocalSalesSummary,
  DailySalesRow,
  CashierPerformanceRow,
  SalesByProductRow,
  SalesByPaymentRow,
  RefundReasonRow,
  RefundCashierRow,
  LocalSavingsBalance,
  CustomerDeposit,
  DepositStatement,
  CreateDepositInput,
  AddDepositPaymentInput,
  CloseDepositInput,
  DepositsListQuery,
  LocalDepositDetail,
  LocalDepositSummary,
  OnlineStore,
  CreateOnlineStoreRequest,
  UpdateOnlineStoreRequest,
  OnlineOrder,
  OnlineOrderDetail,
  OnlineOrderListResult,
  UpdateOrderStatusRequest,
  BusinessProfile,
  UpdateBusinessRequest,
  ListPlansResponse,
  CurrentSubscriptionResponse,
  QuotaUsageResponse,
  CancelPlanResponse,
  RolesListQuery,
  ListRolesResponse,
  ListPermissionsResponse,
  RoleWithPermissions,
  CreateRoleRequest,
  UpdateRoleRequest,
  ListTeamMembersResponse,
  UpdateMemberRoleResponse,
  RemoveTeamMemberResponse,
  UpdateMemberStatusResponse,
  ListPendingInvitesResponse,
  SendInviteRequest,
  SendInviteResponse,
  ResendInviteResponse,
  CancelInviteResponse,
  ListNotificationsQuery,
  ListNotificationsResponse,
  UnreadCountResponse,
  MarkNotificationReadResponse,
  MarkAllNotificationsReadResponse,
  NotificationEventPayload,
  ListMyInvitationsResponse,
  AcceptInvitationResponse,
  RejectInvitationResponse,
  OnlineOrdersQuery,
  OnlineSlugCheck,
  OnlineAdminProduct,
  OnlineAdminProductsQuery,
  OnlineStorePublicationSummary,
  UpdateOrderPaymentRequest,
  LocalSerialUnit,
  LocalStockMovement,
  LocalUnit,
  LocalVariant,
  MovementsQuery,
  InventoryTurnoverRow,
  DeadStockRow,
  SupplierPriceRow,
  RestockInput,
  SaleInput,
  SalesListQuery,
  ScanHit,
  ThresholdInput,
  ModelInput,
  PaginatedResult,
  ProductImageInput,
  ProductInput,
  ProductListQuery,
  ProductStats,
  SerialUnitInput,
  VariantInput,
  SkeletonCheckDTO,
  SkeletonHealthDTO,
  UnitInput,
  UnitListQuery,
  UploadFileInput,
  UploadedFile,
  SessionStatus,
  AuthFlowResult,
  OtpChannel,
  RegisterPayload,
  InvitePreviewResult,
  BusinessSetupPayload,
  PlanList,
  BillingCycle,
  BusinessOption,
  SyncStatus,
  TitleBarOverlayColors,
} from '@shared/ipc'

// The renderer's single data dependency. In Electron it resolves to the IPC bridge
// (offline-first, local SQLite via main). In a plain browser / the future cloud
// build it resolves to an HTTP adapter calling apps/api — same interface, so
// components never change.
export interface DataClient {
  skeleton: {
    getCheck: () => Promise<SkeletonCheckDTO | null>
    getHealth: () => Promise<SkeletonHealthDTO>
  }
  categories: {
    list: (query?: CategoryListQuery) => Promise<PaginatedResult<LocalCategory>>
    listAll: () => Promise<LocalCategory[]>
    listSelectable: (query?: CategorySelectableQuery) => Promise<LocalCategory[]>
    listParentOptions: (query?: CategoryParentOptionsQuery) => Promise<LocalCategory[]>
    create: (input: CategoryInput) => Promise<LocalCategory>
    update: (id: string, input: CategoryInput) => Promise<LocalCategory>
    remove: (id: string) => Promise<void>
  }
  attributes: {
    listGroups: (query?: AttributeGroupListQuery) => Promise<PaginatedResult<LocalAttributeGroup>>
    listAllGroups: () => Promise<LocalAttributeGroup[]>
    createGroup: (input: AttributeGroupInput) => Promise<LocalAttributeGroup>
    updateGroup: (id: string, input: AttributeGroupInput) => Promise<LocalAttributeGroup>
    deleteGroup: (id: string) => Promise<void>
    addOption: (groupId: string, input: AttributeOptionInput) => Promise<LocalAttributeOption>
    updateOption: (optionId: string, input: AttributeOptionInput) => Promise<LocalAttributeOption>
    deleteOption: (optionId: string) => Promise<void>
    listCategoryLinks: (categoryId: string) => Promise<LocalCategoryAttributeGroup[]>
    setCategoryLinks: (categoryId: string, links: CategoryAttributeLinkInput[]) => Promise<void>
  }
  units: {
    list: (query?: UnitListQuery) => Promise<PaginatedResult<LocalUnit>>
    create: (input: UnitInput) => Promise<LocalUnit>
    update: (id: string, input: UnitInput) => Promise<LocalUnit>
    remove: (id: string) => Promise<void>
  }
  brands: {
    list: (query?: BrandListQuery) => Promise<PaginatedResult<LocalBrand>>
    get: (id: string) => Promise<LocalBrand | null>
    create: (input: BrandInput) => Promise<LocalBrand>
    update: (id: string, input: BrandInput) => Promise<LocalBrand>
    remove: (id: string) => Promise<void>
    addModel: (brandId: string, input: ModelInput) => Promise<LocalModel>
    updateModel: (modelId: string, input: ModelInput) => Promise<LocalModel>
    removeModel: (modelId: string) => Promise<void>
  }
  products: {
    list: (query?: ProductListQuery) => Promise<PaginatedResult<LocalProduct>>
    stats: () => Promise<ProductStats>
    get: (id: string) => Promise<LocalProduct | null>
    create: (input: ProductInput) => Promise<LocalProduct>
    update: (id: string, input: ProductInput) => Promise<LocalProduct>
    remove: (id: string) => Promise<void>
    listImages: (productId: string) => Promise<LocalProductImage[]>
    setImages: (productId: string, images: ProductImageInput[]) => Promise<void>
    listVariants: (productId: string) => Promise<LocalVariant[]>
    setVariants: (productId: string, variants: VariantInput[]) => Promise<void>
    addVariant: (productId: string, input: VariantInput) => Promise<LocalVariant>
    updateVariant: (
      productId: string,
      variantId: string,
      input: VariantInput,
    ) => Promise<LocalVariant>
    removeVariant: (productId: string, variantId: string, reason: string) => Promise<void>
    listSerialUnits: (productId: string) => Promise<LocalSerialUnit[]>
    listInStockSerials: (
      productId: string,
      variantId?: string | null,
      search?: string,
    ) => Promise<LocalSerialUnit[]>
    resolveScan: (code: string) => Promise<ScanHit | null>
    setSerialUnits: (productId: string, units: SerialUnitInput[]) => Promise<void>
    addSerialUnits: (
      productId: string,
      units: SerialUnitInput[],
      notes?: string | null,
    ) => Promise<LocalSerialUnit[]>
    retireSerialUnit: (productId: string, unitId: string, reason: string) => Promise<void>
    updateSerialNumber: (
      productId: string,
      unitId: string,
      serialNumber: string,
    ) => Promise<LocalSerialUnit>
    listMovements: (productId: string) => Promise<LocalStockMovement[]>
  }
  inventory: {
    list: (query?: InventoryListQuery) => Promise<PaginatedResult<LocalInventoryItem>>
    stats: () => Promise<InventoryStats>
    reorderSuggestions: () => Promise<LocalReorderSuggestion[]>
    restock: (input: RestockInput) => Promise<void>
    adjust: (productId: string, input: AdjustStockInput) => Promise<void>
    setThreshold: (productId: string, input: ThresholdInput) => Promise<void>
    listMovements: (
      productId: string,
      query?: MovementsQuery,
    ) => Promise<PaginatedResult<LocalStockMovement>>
    listAllMovements: (query?: MovementsQuery) => Promise<PaginatedResult<LocalStockMovement>>
    turnover: (query?: MovementsQuery) => Promise<InventoryTurnoverRow[]>
    deadStock: () => Promise<{ rows: DeadStockRow[]; stockCostTotal: number }>
    supplierPriceTrend: () => Promise<SupplierPriceRow[]>
  }
  contacts: {
    list: (query?: ContactsQuery) => Promise<PaginatedResult<LocalContactListItem>>
    summary: () => Promise<ContactsSummary>
    listAllSuppliers: () => Promise<LocalContact[]>
    listAllCustomers: () => Promise<LocalContact[]>
    get: (id: string) => Promise<LocalContactListItem | null>
    create: (input: CreateContactRequest) => Promise<LocalContact>
    update: (id: string, input: UpdateContactRequest) => Promise<LocalContact>
    remove: (id: string) => Promise<void>
  }
  debts: {
    listByContact: (contactId: string, query?: DebtsQuery) => Promise<PaginatedResult<LocalDebt>>
    statement: (contactId: string, direction: DebtDirection) => Promise<ContactStatement>
    recordPayment: (debtId: string, input: RecordDebtPaymentRequest) => Promise<LocalDebt>
    offset: (contactId: string) => Promise<{ offsetAmount: number; affected: number }>
    ageing: (direction: DebtDirection) => Promise<AgeingReport>
  }
  openingBalances: {
    upsert: (input: OpeningBalanceInput) => Promise<LocalOpeningBalance>
    listForContact: (contactId: string) => Promise<LocalOpeningBalance[]>
  }
  expenses: {
    list: (
      query?: ExpensesListQuery,
    ) => Promise<PaginatedResult<LocalExpense> & { totalAmount: number }>
    get: (id: string) => Promise<LocalExpense | null>
    summary: (query?: ExpensesListQuery) => Promise<LocalExpenseSummary>
    trend: () => Promise<ExpenseTrendItem[]>
    create: (input: ExpenseInput) => Promise<LocalExpense>
    update: (id: string, input: ExpenseInput) => Promise<LocalExpense>
    setStatus: (id: string, status: string, paymentMethod?: string | null) => Promise<LocalExpense>
    remove: (id: string) => Promise<void>
  }
  expenseCategories: {
    listAll: () => Promise<LocalExpenseCategory[]>
    create: (input: ExpenseCategoryInput) => Promise<LocalExpenseCategory>
  }
  rfqs: {
    list: (query?: RfqsQuery) => Promise<PaginatedResult<LocalRfqListItem>>
    get: (id: string) => Promise<LocalRfqDetail | null>
    create: (input: CreateRfqRequest) => Promise<LocalRfqDetail>
    recordQuote: (rfqId: string, input: RecordRfqQuoteRequest) => Promise<LocalRfqDetail>
    buildDocument: (rfqId: string, supplierId: string) => Promise<RfqDocument>
    send: (rfqId: string, supplierId: string, channel: RfqSendChannel) => Promise<LocalRfqDetail>
  }
  purchaseOrders: {
    list: (query?: PurchaseOrdersQuery) => Promise<PaginatedResult<LocalPurchaseOrderListItem>>
    get: (id: string) => Promise<LocalPurchaseOrderDetail | null>
    create: (input: CreatePurchaseOrderRequest) => Promise<LocalPurchaseOrderDetail>
    createFromRfq: (
      rfqId: string,
      input: ConvertRfqToPoRequest,
    ) => Promise<LocalPurchaseOrderDetail>
    buildDocument: (poId: string) => Promise<PurchaseOrderDocument>
    send: (poId: string, channel: PurchaseOrderSendChannel) => Promise<LocalPurchaseOrderDetail>
    cancel: (poId: string) => Promise<LocalPurchaseOrderDetail>
  }
  documents: {
    send: (input: DocumentSendInput) => Promise<void>
    downloadPdf: (input: DocumentDownloadInput) => Promise<DocumentDownloadResult>
    downloadHtmlPdf: (html: string, filename: string) => Promise<DocumentDownloadResult>
    shareHtmlPdf: (input: ShareHtmlPdfInput) => Promise<void>
  }
  audit: {
    list: (query?: AuditListQuery) => Promise<PaginatedResult<LocalAuditLog>>
  }
  uploads: {
    file: (input: UploadFileInput) => Promise<UploadedFile>
  }
  charges: {
    listActive: () => Promise<ChargeType[]>
  }
  sales: {
    create: (input: SaleInput) => Promise<LocalSaleDetail>
    list: (query?: SalesListQuery) => Promise<PaginatedResult<LocalSale>>
    listAll: (query?: SalesListQuery) => Promise<LocalSale[]>
    summary: (query?: SalesListQuery) => Promise<LocalSalesSummary>
    dailySeries: (query?: SalesListQuery) => Promise<DailySalesRow[]>
    cashierRoster: (query?: SalesListQuery) => Promise<CashierPerformanceRow[]>
    byProduct: (query?: SalesListQuery) => Promise<SalesByProductRow[]>
    byPaymentMethod: (query?: SalesListQuery) => Promise<SalesByPaymentRow[]>
    refunds: (
      query?: SalesListQuery,
    ) => Promise<{ byReason: RefundReasonRow[]; byCashier: RefundCashierRow[]; grossSales: number }>
    grossProfit: (query?: SalesListQuery) => Promise<{ revenue: number; cogs: number }>
    get: (id: string) => Promise<LocalSaleDetail | null>
    sendReceipt: (
      saleId: string,
      channel: DocumentSendChannel,
      locale: string,
      opts?: { recipient?: DocumentRecipient; online?: boolean },
    ) => Promise<void>
    printReceipt: (
      saleId: string,
      locale: string,
    ) => Promise<{ printed: boolean; pdfPath?: string }>
    downloadReceipt: (saleId: string, locale: string) => Promise<{ saved: boolean; path?: string }>
    receiptHtml: (saleId: string, locale: string) => Promise<string | null>
  }
  savings: {
    getForCustomer: (customerId: string) => Promise<LocalSavingsBalance | null>
  }
  deposits: {
    list: (query?: DepositsListQuery) => Promise<PaginatedResult<CustomerDeposit>>
    get: (id: string) => Promise<LocalDepositDetail | null>
    statement: (id: string) => Promise<DepositStatement | null>
    summary: () => Promise<LocalDepositSummary>
    create: (input: CreateDepositInput) => Promise<CustomerDeposit>
    addPayment: (id: string, input: AddDepositPaymentInput) => Promise<CustomerDeposit>
    close: (id: string, input: CloseDepositInput) => Promise<CustomerDeposit>
    receiptHtml: (transactionId: string, locale: string) => Promise<string | null>
    reportHtml: (id: string, locale: string) => Promise<string | null>
  }
  online: {
    getStore: () => Promise<OnlineStore | null>
    createStore: (input: CreateOnlineStoreRequest) => Promise<OnlineStore>
    updateStore: (input: UpdateOnlineStoreRequest) => Promise<OnlineStore>
    publishStore: () => Promise<OnlineStore>
    listPublications: () => Promise<OnlineStorePublicationSummary[]>
    restorePublication: (version: number) => Promise<OnlineStore>
    listOrders: (query?: OnlineOrdersQuery) => Promise<OnlineOrderListResult>
    getOrder: (id: string) => Promise<OnlineOrderDetail>
    updateOrderStatus: (id: string, input: UpdateOrderStatusRequest) => Promise<OnlineOrder>
    updateOrderPayment: (id: string, input: UpdateOrderPaymentRequest) => Promise<OnlineOrderDetail>
    checkSlug: (slug: string) => Promise<OnlineSlugCheck>
    listProducts: (query?: OnlineAdminProductsQuery) => Promise<PaginatedResult<OnlineAdminProduct>>
    setProductPublished: (id: string, published: boolean) => Promise<void>
  }
  business: {
    getProfile: () => Promise<BusinessProfile | null>
    update: (payload: UpdateBusinessRequest) => Promise<BusinessProfile>
  }
  plans: {
    list: () => Promise<ListPlansResponse>
    subscription: () => Promise<CurrentSubscriptionResponse>
    quotaUsage: () => Promise<QuotaUsageResponse>
    upgrade: (plan: string) => Promise<void>
    cancel: () => Promise<CancelPlanResponse>
  }
  roles: {
    list: (query?: RolesListQuery) => Promise<ListRolesResponse>
    permissions: () => Promise<ListPermissionsResponse>
    get: (id: string) => Promise<RoleWithPermissions>
    create: (input: CreateRoleRequest) => Promise<RoleWithPermissions>
    update: (id: string, input: UpdateRoleRequest) => Promise<RoleWithPermissions>
    remove: (id: string) => Promise<{ deleted: boolean }>
    setPermissions: (id: string, permissions: string[]) => Promise<RoleWithPermissions>
  }
  team: {
    listMembers: () => Promise<ListTeamMembersResponse>
    updateMemberRole: (userId: string, roleId: string) => Promise<UpdateMemberRoleResponse>
    removeMember: (userId: string) => Promise<RemoveTeamMemberResponse>
    setMemberActive: (userId: string, active: boolean) => Promise<UpdateMemberStatusResponse>
    listInvites: () => Promise<ListPendingInvitesResponse>
    sendInvite: (input: SendInviteRequest) => Promise<SendInviteResponse>
    resendInvite: (id: string) => Promise<ResendInviteResponse>
    cancelInvite: (id: string) => Promise<CancelInviteResponse>
  }
  notifications: {
    list: (query?: ListNotificationsQuery) => Promise<ListNotificationsResponse>
    unreadCount: () => Promise<UnreadCountResponse>
    markRead: (id: string) => Promise<MarkNotificationReadResponse>
    markAllRead: () => Promise<MarkAllNotificationsReadResponse>
    connect: () => Promise<void>
    onEvent: (cb: (payload: NotificationEventPayload) => void) => () => void
  }
  invitations: {
    list: () => Promise<ListMyInvitationsResponse>
    accept: (businessId: string) => Promise<AcceptInvitationResponse>
    reject: (businessId: string) => Promise<RejectInvitationResponse>
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
  sync: {
    trigger: () => Promise<void>
    fullSync: () => Promise<void>
    retry: () => Promise<void>
    getStatus: () => Promise<SyncStatus>
    onStatus: (cb: (status: SyncStatus) => void) => () => void
  }
  theme: {
    set: (theme: 'light' | 'dark' | 'system') => void
  }
  window: {
    setTitleBarOverlay: (colors: TitleBarOverlayColors) => void
  }
}

import { cloudAuth } from './cloud-auth'
import {
  cloudRoles,
  cloudTeam,
  cloudNotificationsRest,
  cloudInvitations,
  cloudBusiness,
  cloudPlans,
  cloudOnline,
  cloudUploads,
} from './cloud-data'
import { cloudRealtimeConnect, cloudRealtimeOnEvent } from './cloud-realtime'
import {
  cloudCategories,
  cloudBrands,
  cloudUnits,
  cloudExpenseCategories,
  cloudAttributes,
} from './cloud-catalog'
import { cloudContacts } from './cloud-contacts'
import { cloudProducts } from './cloud-products'
import { cloudSales } from './cloud-sales'
import { cloudInventory } from './cloud-inventory'
import { cloudExpenses } from './cloud-expenses'
import { cloudDebts, cloudOpeningBalances } from './cloud-debts'
import { cloudSavings, cloudDeposits } from './cloud-deposits'
import { cloudRfqs, cloudPurchaseOrders } from './cloud-procurement'
import { cloudAudit, cloudCharges, cloudDocuments } from './cloud-misc'

/** True when running inside the Electron renderer (preload bridge present). */
export const isElectron = typeof window !== 'undefined' && Boolean(window.api)

function electronAdapter(): DataClient {
  return {
    skeleton: {
      getCheck: () => window.api.skeleton.getCheck(),
      getHealth: () => window.api.skeleton.getHealth(),
    },
    categories: {
      list: (query) => window.api.categories.list(query),
      listAll: () => window.api.categories.listAll(),
      listSelectable: (query) => window.api.categories.listSelectable(query),
      listParentOptions: (query) => window.api.categories.listParentOptions(query),
      create: (input) => window.api.categories.create(input),
      update: (id, input) => window.api.categories.update(id, input),
      remove: (id) => window.api.categories.remove(id),
    },
    attributes: {
      listGroups: (query) => window.api.attributes.listGroups(query),
      listAllGroups: () => window.api.attributes.listAllGroups(),
      createGroup: (input) => window.api.attributes.createGroup(input),
      updateGroup: (id, input) => window.api.attributes.updateGroup(id, input),
      deleteGroup: (id) => window.api.attributes.deleteGroup(id),
      addOption: (groupId, input) => window.api.attributes.addOption(groupId, input),
      updateOption: (optionId, input) => window.api.attributes.updateOption(optionId, input),
      deleteOption: (optionId) => window.api.attributes.deleteOption(optionId),
      listCategoryLinks: (categoryId) => window.api.attributes.listCategoryLinks(categoryId),
      setCategoryLinks: (categoryId, links) =>
        window.api.attributes.setCategoryLinks(categoryId, links),
    },
    units: {
      list: (query) => window.api.units.list(query),
      create: (input) => window.api.units.create(input),
      update: (id, input) => window.api.units.update(id, input),
      remove: (id) => window.api.units.remove(id),
    },
    brands: {
      list: (query) => window.api.brands.list(query),
      get: (id) => window.api.brands.get(id),
      create: (input) => window.api.brands.create(input),
      update: (id, input) => window.api.brands.update(id, input),
      remove: (id) => window.api.brands.remove(id),
      addModel: (brandId, input) => window.api.brands.addModel(brandId, input),
      updateModel: (modelId, input) => window.api.brands.updateModel(modelId, input),
      removeModel: (modelId) => window.api.brands.removeModel(modelId),
    },
    products: {
      list: (query) => window.api.products.list(query),
      stats: () => window.api.products.stats(),
      get: (id) => window.api.products.get(id),
      create: (input) => window.api.products.create(input),
      update: (id, input) => window.api.products.update(id, input),
      remove: (id) => window.api.products.remove(id),
      listImages: (productId) => window.api.products.listImages(productId),
      setImages: (productId, images) => window.api.products.setImages(productId, images),
      listVariants: (productId) => window.api.products.listVariants(productId),
      setVariants: (productId, variants) => window.api.products.setVariants(productId, variants),
      addVariant: (productId, input) => window.api.products.addVariant(productId, input),
      updateVariant: (productId, variantId, input) =>
        window.api.products.updateVariant(productId, variantId, input),
      removeVariant: (productId, variantId, reason) =>
        window.api.products.removeVariant(productId, variantId, reason),
      listSerialUnits: (productId) => window.api.products.listSerialUnits(productId),
      listInStockSerials: (productId, variantId, search) =>
        window.api.products.listInStockSerials(productId, variantId, search),
      resolveScan: (code) => window.api.products.resolveScan(code),
      setSerialUnits: (productId, units) => window.api.products.setSerialUnits(productId, units),
      addSerialUnits: (productId, units, notes) =>
        window.api.products.addSerialUnits(productId, units, notes),
      retireSerialUnit: (productId, unitId, reason) =>
        window.api.products.retireSerialUnit(productId, unitId, reason),
      updateSerialNumber: (productId, unitId, serialNumber) =>
        window.api.products.updateSerialNumber(productId, unitId, serialNumber),
      listMovements: (productId) => window.api.products.listMovements(productId),
    },
    inventory: {
      list: (query) => window.api.inventory.list(query),
      stats: () => window.api.inventory.stats(),
      reorderSuggestions: () => window.api.inventory.reorderSuggestions(),
      restock: (input) => window.api.inventory.restock(input),
      adjust: (productId, input) => window.api.inventory.adjust(productId, input),
      setThreshold: (productId, input) => window.api.inventory.setThreshold(productId, input),
      listMovements: (productId, query) => window.api.inventory.listMovements(productId, query),
      listAllMovements: (query) => window.api.inventory.listAllMovements(query),
      turnover: (query) => window.api.inventory.turnover(query),
      deadStock: () => window.api.inventory.deadStock(),
      supplierPriceTrend: () => window.api.inventory.supplierPriceTrend(),
    },
    contacts: {
      list: (query) => window.api.contacts.list(query),
      summary: () => window.api.contacts.summary(),
      listAllSuppliers: () => window.api.contacts.listAllSuppliers(),
      listAllCustomers: () => window.api.contacts.listAllCustomers(),
      get: (id) => window.api.contacts.get(id),
      create: (input) => window.api.contacts.create(input),
      update: (id, input) => window.api.contacts.update(id, input),
      remove: (id) => window.api.contacts.remove(id),
    },
    debts: {
      listByContact: (contactId, query) => window.api.debts.listByContact(contactId, query),
      statement: (contactId, direction) => window.api.debts.statement(contactId, direction),
      recordPayment: (debtId, input) => window.api.debts.recordPayment(debtId, input),
      offset: (contactId) => window.api.debts.offset(contactId),
      ageing: (direction) => window.api.debts.ageing(direction),
    },
    openingBalances: {
      upsert: (input) => window.api.openingBalances.upsert(input),
      listForContact: (contactId) => window.api.openingBalances.listForContact(contactId),
    },
    expenses: {
      list: (query) => window.api.expenses.list(query),
      get: (id) => window.api.expenses.get(id),
      summary: (query) => window.api.expenses.summary(query),
      trend: () => window.api.expenses.trend(),
      create: (input) => window.api.expenses.create(input),
      update: (id, input) => window.api.expenses.update(id, input),
      setStatus: (id, status, paymentMethod) =>
        window.api.expenses.setStatus(id, status, paymentMethod),
      remove: (id) => window.api.expenses.remove(id),
    },
    expenseCategories: {
      listAll: () => window.api.expenseCategories.listAll(),
      create: (input) => window.api.expenseCategories.create(input),
    },
    rfqs: {
      list: (query) => window.api.rfqs.list(query),
      get: (id) => window.api.rfqs.get(id),
      create: (input) => window.api.rfqs.create(input),
      recordQuote: (rfqId, input) => window.api.rfqs.recordQuote(rfqId, input),
      buildDocument: (rfqId, supplierId) => window.api.rfqs.buildDocument(rfqId, supplierId),
      send: (rfqId, supplierId, channel) => window.api.rfqs.send(rfqId, supplierId, channel),
    },
    purchaseOrders: {
      list: (query) => window.api.purchaseOrders.list(query),
      get: (id) => window.api.purchaseOrders.get(id),
      create: (input) => window.api.purchaseOrders.create(input),
      createFromRfq: (rfqId, input) => window.api.purchaseOrders.createFromRfq(rfqId, input),
      buildDocument: (poId) => window.api.purchaseOrders.buildDocument(poId),
      send: (poId, channel) => window.api.purchaseOrders.send(poId, channel),
      cancel: (poId) => window.api.purchaseOrders.cancel(poId),
    },
    documents: {
      send: (input) => window.api.documents.send(input),
      downloadPdf: (input) => window.api.documents.downloadPdf(input),
      downloadHtmlPdf: (html, filename) => window.api.documents.downloadHtmlPdf(html, filename),
      shareHtmlPdf: (input) => window.api.documents.shareHtmlPdf(input),
    },
    audit: {
      list: (query) => window.api.audit.list(query),
    },
    uploads: {
      file: (input) => window.api.uploads.file(input),
    },
    charges: {
      listActive: () => window.api.charges.listActive(),
    },
    sales: {
      create: (input) => window.api.sales.create(input),
      list: (query) => window.api.sales.list(query),
      listAll: (query) => window.api.sales.listAll(query),
      summary: (query) => window.api.sales.summary(query),
      dailySeries: (query) => window.api.sales.dailySeries(query),
      cashierRoster: (query) => window.api.sales.cashierRoster(query),
      byProduct: (query) => window.api.sales.byProduct(query),
      byPaymentMethod: (query) => window.api.sales.byPaymentMethod(query),
      refunds: (query) => window.api.sales.refunds(query),
      grossProfit: (query) => window.api.sales.grossProfit(query),
      get: (id) => window.api.sales.get(id),
      sendReceipt: (saleId, channel, locale, opts) =>
        window.api.sales.sendReceipt(saleId, channel, locale, opts),
      printReceipt: (saleId, locale) => window.api.sales.printReceipt(saleId, locale),
      downloadReceipt: (saleId, locale) => window.api.sales.downloadReceipt(saleId, locale),
      receiptHtml: (saleId, locale) => window.api.sales.receiptHtml(saleId, locale),
    },
    savings: {
      getForCustomer: (customerId) => window.api.savings.getForCustomer(customerId),
    },
    deposits: {
      list: (query) => window.api.deposits.list(query),
      get: (id) => window.api.deposits.get(id),
      statement: (id) => window.api.deposits.statement(id),
      summary: () => window.api.deposits.summary(),
      create: (input) => window.api.deposits.create(input),
      addPayment: (id, input) => window.api.deposits.addPayment(id, input),
      close: (id, input) => window.api.deposits.close(id, input),
      receiptHtml: (transactionId, locale) =>
        window.api.deposits.receiptHtml(transactionId, locale),
      reportHtml: (id, locale) => window.api.deposits.reportHtml(id, locale),
    },
    online: {
      getStore: () => window.api.online.getStore(),
      createStore: (input) => window.api.online.createStore(input),
      updateStore: (input) => window.api.online.updateStore(input),
      publishStore: () => window.api.online.publishStore(),
      listPublications: () => window.api.online.listPublications(),
      restorePublication: (version) => window.api.online.restorePublication(version),
      listOrders: (query) => window.api.online.listOrders(query),
      getOrder: (id) => window.api.online.getOrder(id),
      updateOrderStatus: (id, input) => window.api.online.updateOrderStatus(id, input),
      updateOrderPayment: (id, input) => window.api.online.updateOrderPayment(id, input),
      checkSlug: (slug) => window.api.online.checkSlug(slug),
      listProducts: (query) => window.api.online.listProducts(query),
      setProductPublished: (id, published) => window.api.online.setProductPublished(id, published),
    },
    business: {
      getProfile: () => window.api.business.getProfile(),
      update: (payload) => window.api.business.update(payload),
    },
    plans: {
      list: () => window.api.plans.list(),
      subscription: () => window.api.plans.subscription(),
      quotaUsage: () => window.api.plans.quotaUsage(),
      upgrade: (plan) => window.api.plans.upgrade(plan),
      cancel: () => window.api.plans.cancel(),
    },
    roles: {
      list: (query) => window.api.roles.list(query),
      permissions: () => window.api.roles.permissions(),
      get: (id) => window.api.roles.get(id),
      create: (input) => window.api.roles.create(input),
      update: (id, input) => window.api.roles.update(id, input),
      remove: (id) => window.api.roles.remove(id),
      setPermissions: (id, permissions) => window.api.roles.setPermissions(id, permissions),
    },
    team: {
      listMembers: () => window.api.team.listMembers(),
      updateMemberRole: (userId, roleId) => window.api.team.updateMemberRole(userId, roleId),
      removeMember: (userId) => window.api.team.removeMember(userId),
      setMemberActive: (userId, active) => window.api.team.setMemberActive(userId, active),
      listInvites: () => window.api.team.listInvites(),
      sendInvite: (input) => window.api.team.sendInvite(input),
      resendInvite: (id) => window.api.team.resendInvite(id),
      cancelInvite: (id) => window.api.team.cancelInvite(id),
    },
    notifications: {
      list: (query) => window.api.notifications.list(query),
      unreadCount: () => window.api.notifications.unreadCount(),
      markRead: (id) => window.api.notifications.markRead(id),
      markAllRead: () => window.api.notifications.markAllRead(),
      connect: () => window.api.notifications.connect(),
      onEvent: (cb) => window.api.notifications.onEvent(cb),
    },
    invitations: {
      list: () => window.api.invitations.list(),
      accept: (businessId) => window.api.invitations.accept(businessId),
      reject: (businessId) => window.api.invitations.reject(businessId),
    },
    auth: {
      getSession: () => window.api.auth.getSession(),
      login: (identifier, password) => window.api.auth.login(identifier, password),
      requestLogin: (identifier, channel) => window.api.auth.requestLogin(identifier, channel),
      loginOtp: (identifier, code) => window.api.auth.loginOtp(identifier, code),
      requestPasswordReset: (identifier, channel) =>
        window.api.auth.requestPasswordReset(identifier, channel),
      resetPassword: (identifier, code, newPassword) =>
        window.api.auth.resetPassword(identifier, code, newPassword),
      verifyPhone: (phone, code, inviteToken) =>
        window.api.auth.verifyPhone(phone, code, inviteToken),
      verifyEmail: (email, code, inviteToken) =>
        window.api.auth.verifyEmail(email, code, inviteToken),
      resendOtp: (identifier, type, channel) =>
        window.api.auth.resendOtp(identifier, type, channel),
      register: (payload) => window.api.auth.register(payload),
      getInvitePreview: (token) => window.api.auth.getInvitePreview(token),
      acceptInvite: (token) => window.api.auth.acceptInvite(token),
      rejectInvite: (token) => window.api.auth.rejectInvite(token),
      setupBusiness: (payload) => window.api.auth.setupBusiness(payload),
      listPlans: () => window.api.auth.listPlans(),
      selectPlan: (plan, billingCycle) => window.api.auth.selectPlan(plan, billingCycle),
      selectBusiness: (businessId) => window.api.auth.selectBusiness(businessId),
      listBusinesses: () => window.api.auth.listBusinesses(),
      offlineLogin: (password) => window.api.auth.offlineLogin(password),
      logout: () => window.api.auth.logout(),
    },
    sync: {
      trigger: () => window.api.sync.trigger(),
      fullSync: () => window.api.sync.fullSync(),
      retry: () => window.api.sync.retry(),
      getStatus: () => window.api.sync.getStatus(),
      onStatus: (cb) => window.api.sync.onStatus(cb),
    },
    theme: {
      set: (theme) => window.api.theme.set(theme),
    },
    window: {
      setTitleBarOverlay: (colors) => window.api.window.setTitleBarOverlay(colors),
    },
  }
}

// Placeholder until the cloud build lands. The cloud/browser build is ONLINE-ONLY:
// it never touches the filesystem or SQLite — it calls apps/api directly over HTTP
// (access token in memory, refresh token in an httpOnly cookie). Until that adapter
// exists, fail with a clear message instead of a cryptic "window.api is undefined".
function cloudAdapter(): DataClient {
  const notWired = async (): Promise<never> => {
    throw new Error(
      'Online (cloud) mode is not wired up yet. Launch the desktop app with `pnpm dev:desktop-v2` to use the offline build.',
    )
  }
  return {
    skeleton: { getCheck: notWired, getHealth: notWired },
    categories: cloudCategories,
    attributes: cloudAttributes,
    units: cloudUnits,
    brands: cloudBrands,
    products: cloudProducts,
    inventory: cloudInventory,
    contacts: cloudContacts,
    debts: cloudDebts,
    openingBalances: cloudOpeningBalances,
    expenses: cloudExpenses,
    expenseCategories: cloudExpenseCategories,
    rfqs: cloudRfqs,
    purchaseOrders: cloudPurchaseOrders,
    documents: cloudDocuments,
    audit: cloudAudit,
    uploads: cloudUploads,
    charges: cloudCharges,
    sales: cloudSales,
    savings: cloudSavings,
    deposits: cloudDeposits,
    online: cloudOnline,
    business: cloudBusiness,
    plans: cloudPlans,
    roles: cloudRoles,
    team: cloudTeam,
    notifications: {
      ...cloudNotificationsRest,
      connect: cloudRealtimeConnect,
      onEvent: cloudRealtimeOnEvent,
    },
    invitations: cloudInvitations,
    auth: cloudAuth,
    // Cloud is online-only: there is no local sync engine, so report a stable
    // "synced" status and treat trigger/retry as no-ops.
    sync: {
      trigger: async () => {},
      fullSync: async () => {},
      retry: async () => {},
      getStatus: async () => ({
        state: 'idle',
        lastSyncedAt: new Date().toISOString(),
        pendingCount: 0,
        deferredCount: 0,
        failedCount: 0,
        deadCount: 0,
        lastError: null,
      }),
      onStatus: () => () => {},
    },
    theme: { set: () => {} }, // theme.store already persists to localStorage
    window: { setTitleBarOverlay: () => {} }, // no native window controls in the browser
  }
}

export const dataClient: DataClient = isElectron ? electronAdapter() : cloudAdapter()
