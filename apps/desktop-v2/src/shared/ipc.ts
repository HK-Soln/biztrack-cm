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
  authVerifyPhone: 'auth:verify-phone',
  authVerifyEmail: 'auth:verify-email',
  authResendOtp: 'auth:resend-otp',
  authRegister: 'auth:register',
  authSetupBusiness: 'auth:setup-business',
  authListPlans: 'auth:list-plans',
  authSelectPlan: 'auth:select-plan',
  authSelectBusiness: 'auth:select-business',
  authListBusinesses: 'auth:list-businesses',
  authOfflineLogin: 'auth:offline-login',
  authLogout: 'auth:logout',
  syncTrigger: 'sync:trigger',
  syncRetry: 'sync:retry',
  syncGetStatus: 'sync:get-status',
  syncStatusEvent: 'sync:status-event',
  categoriesList: 'categories:list',
  categoriesListAll: 'categories:list-all',
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
  productsGet: 'products:get',
  productsCreate: 'products:create',
  productsUpdate: 'products:update',
  productsDelete: 'products:delete',
  productsStats: 'products:stats',
  productsListImages: 'products:list-images',
  productsSetImages: 'products:set-images',
  productsListVariants: 'products:list-variants',
  productsSetVariants: 'products:set-variants',
  productsListSerialUnits: 'products:list-serial-units',
  productsSetSerialUnits: 'products:set-serial-units',
  uploadsFile: 'uploads:file',
} as const

// ---- Pagination -----------------------------------------------------------
// Re-exported from @biztrack/types so the desktop list contract matches the API
// (default limit 20, max 100). Local list methods accept a ListQuery and return a
// PaginatedResult; `listAll*` variants (for form pickers) return the full set.
export type { ListQuery, PaginatedResult } from '@biztrack/types'
import type { ListQuery as ListQueryT, PaginatedResult as PaginatedT } from '@biztrack/types'

/** Per-entity list query: the base ListQuery plus optional entity filters. */
export interface CategoryListQuery extends ListQueryT {
  parentId?: string | null
  isActive?: boolean
  /** Filter by hierarchy level (1=L1 … 3=L3). */
  depth?: number
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

// ---- Auth (Feature 1) -----------------------------------------------------
// The renderer only ever sees SESSION STATUS — never tokens. Tokens live in the
// Electron main process (secure-store). Cloud build will swap the same shape.
export type AuthPhase = 'none' | 'phase1' | 'phase2'

export interface SessionUser {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string | null
}

export interface SessionStatus {
  /** True only when a phase2 (business-scoped) session is active. NOTE: this is NOT
   * the same as "ready for dashboard" — a phase2 user may still be mid-onboarding.
   * Routing must use `nextStep`. */
  authenticated: boolean
  phase: AuthPhase
  isOffline: boolean
  user: SessionUser | null
  businessId: string | null
  businessName: string | null
  /** The AuthNextStep that drives routing: which screen this session should be on
   * (e.g. 'select_business', 'setup_business', 'dashboard'). null = signed out. */
  nextStep: string | null
}

export interface AuthContextInfo {
  maskedPhone?: string
  maskedEmail?: string
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

export interface BusinessOption {
  id: string
  name: string
  role: string | null
  /** Business lifecycle: 'ONBOARDING' | 'PLAN_PENDING' | 'ACTIVE' (or null if unknown).
   * A non-owner can only enter an ACTIVE business. */
  status: string | null
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
  sellingPrice: number
  costPrice: number | null
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
  lowStockThreshold: number | null
  reorderPoint: number | null
  /** Read-only stock (owned by the Inventory module; reflects opening stock until that syncs). */
  currentStock: number
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
}

/** Desired serial unit on save (matched by serialNumber so live units keep their id). */
export interface SerialUnitInput {
  variantId?: string | null
  serialNumber: string
  serialType: SerialType
}

/** A product gallery image (the main image stays on the product's imageUrl). */
export interface LocalProductImage {
  id: string
  productId: string
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
    verifyPhone: (phone: string, code: string) => Promise<AuthFlowResult>
    verifyEmail: (email: string, code: string) => Promise<AuthFlowResult>
    resendOtp: (identifier: string, type: string, channel?: OtpChannel) => Promise<AuthFlowResult>
    register: (payload: RegisterPayload) => Promise<AuthFlowResult>
    setupBusiness: (payload: BusinessSetupPayload) => Promise<AuthFlowResult>
    listPlans: () => Promise<PlanList>
    selectPlan: (plan: string, billingCycle?: BillingCycle) => Promise<AuthFlowResult>
    selectBusiness: (businessId: string) => Promise<AuthFlowResult>
    listBusinesses: () => Promise<BusinessOption[]>
    offlineLogin: (password: string) => Promise<AuthFlowResult>
    logout: () => Promise<SessionStatus>
  }
  sync: {
    /** Run a push+pull cycle now. */
    trigger: () => Promise<void>
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
    stats: () => Promise<ProductStats>
    get: (id: string) => Promise<LocalProduct | null>
    create: (input: ProductInput) => Promise<LocalProduct>
    update: (id: string, input: ProductInput) => Promise<LocalProduct>
    remove: (id: string) => Promise<void>
    listImages: (productId: string) => Promise<LocalProductImage[]>
    /** Replace a product's gallery (diff + enqueues changes). */
    setImages: (productId: string, images: ProductImageInput[]) => Promise<void>
    listVariants: (productId: string) => Promise<LocalVariant[]>
    /** Replace a product's variants (matched by option combination). */
    setVariants: (productId: string, variants: VariantInput[]) => Promise<void>
    listSerialUnits: (productId: string) => Promise<LocalSerialUnit[]>
    /** Replace a product's serial units (matched by serialNumber). */
    setSerialUnits: (productId: string, units: SerialUnitInput[]) => Promise<void>
  }
  uploads: {
    /** Upload a file (image/pdf) through the API storage service; returns its URL. */
    file: (input: UploadFileInput) => Promise<UploadedFile>
  }
}
