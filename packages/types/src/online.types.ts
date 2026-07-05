import type { IsoDateString, PaginatedResult } from './http.types'

export type OnlineStoreDomainType = 'PATH' | 'SUBDOMAIN' | 'CUSTOM' | 'PURCHASED'
export type OnlineStoreStatus = 'draft' | 'published' | 'suspended'
export type OnlineStoreLayout = 'classic' | 'boutique' | 'catalog' | 'landing'
export type OnlineStoreAppearance = 'light' | 'dark'
export type OnlineCatalogBinding = 'snapshot' | 'live'

export interface OnlineStore {
  id: string
  businessId: string
  storeName: string
  storeSlug: string
  tagline?: string | null
  logoUrl?: string | null
  bannerUrl?: string | null
  primaryColor: string
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  whatsappNumber?: string | null
  domainType: OnlineStoreDomainType
  customDomain?: string | null
  domainVerified: boolean
  sslIssued: boolean
  isActive: boolean
  showOutOfStock: boolean
  allowOrderNotes: boolean
  minOrderAmount?: number | null
  currency: string
  paymentCashOnDelivery: boolean
  paymentMtnMomo: boolean
  paymentOrangeMoney: boolean
  paymentCard: boolean
  // Fulfilment: which options the store offers + delivery economics/reach.
  offerDelivery: boolean
  offerPickup: boolean
  /** Flat delivery fee in the store currency (minor unit not used — whole XAF). */
  deliveryFee: number
  pickupAddress?: string | null
  /** Cities/zones the store delivers to (empty = anywhere the customer enters). */
  deliveryCities: string[]
  // Storefront appearance + catalog + SEO + lifecycle (design-store-config / issue #91)
  layoutTemplate: OnlineStoreLayout
  themeId: string
  appearance: OnlineStoreAppearance
  catalogBinding: OnlineCatalogBinding
  showLowStockBadges: boolean
  seoTitle?: string | null
  seoDescription?: string | null
  ogImageUrl?: string | null
  robotsIndex: boolean
  socialInstagram?: string | null
  socialFacebook?: string | null
  socialTiktok?: string | null
  socialX?: string | null
  socialLinkedin?: string | null
  status: OnlineStoreStatus
  publishedAt?: IsoDateString | null
  hasUnpublishedChanges: boolean
  createdAt?: IsoDateString
  updatedAt?: IsoDateString
}

export interface CreateOnlineStoreRequest {
  storeName: string
  storeSlug?: string
  tagline?: string
  logoUrl?: string
  bannerUrl?: string
  primaryColor?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  whatsappNumber?: string
}

export interface UpdateOnlineStoreRequest {
  storeName?: string
  tagline?: string | null
  logoUrl?: string | null
  bannerUrl?: string | null
  primaryColor?: string
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  whatsappNumber?: string | null
  isActive?: boolean
  showOutOfStock?: boolean
  allowOrderNotes?: boolean
  minOrderAmount?: number | null
  paymentCashOnDelivery?: boolean
  paymentMtnMomo?: boolean
  paymentOrangeMoney?: boolean
  paymentCard?: boolean
  offerDelivery?: boolean
  offerPickup?: boolean
  deliveryFee?: number
  pickupAddress?: string | null
  deliveryCities?: string[]
  storeSlug?: string
  layoutTemplate?: OnlineStoreLayout
  themeId?: string
  appearance?: OnlineStoreAppearance
  catalogBinding?: OnlineCatalogBinding
  showLowStockBadges?: boolean
  seoTitle?: string | null
  seoDescription?: string | null
  ogImageUrl?: string | null
  robotsIndex?: boolean
  socialInstagram?: string | null
  socialFacebook?: string | null
  socialTiktok?: string | null
  socialX?: string | null
  socialLinkedin?: string | null
}

// ---- Publish snapshots (draft → published) ---------------------------------

/**
 * The immutable, published-facing store configuration captured at publish time. The public
 * storefront renders from THIS snapshot, never the editable draft (the `online_stores` row) —
 * so admins can stage config changes and only go live on publish. Product catalogue/stock stays
 * live for now (Tier 1); a future tier snapshots the catalogue too via `appearance.catalogBinding`.
 */
export interface OnlineStorePublishedConfig {
  storeName: string
  storeSlug: string
  tagline: string | null
  logoUrl: string | null
  bannerUrl: string | null
  primaryColor: string
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  whatsappNumber: string | null
  currency: string
  showOutOfStock: boolean
  allowOrderNotes: boolean
  minOrderAmount: number | null
  payment: { cashOnDelivery: boolean; mtnMomo: boolean; orangeMoney: boolean; card: boolean }
  fulfilment: {
    offerDelivery: boolean
    offerPickup: boolean
    deliveryFee: number
    pickupAddress: string | null
    deliveryCities: string[]
  }
  appearance: {
    layoutTemplate: OnlineStoreLayout
    themeId: string
    appearance: OnlineStoreAppearance
    catalogBinding: OnlineCatalogBinding
    showLowStockBadges: boolean
  }
  seo: {
    seoTitle: string | null
    seoDescription: string | null
    ogImageUrl: string | null
    robotsIndex: boolean
  }
  socials: {
    instagram: string | null
    facebook: string | null
    tiktok: string | null
    x: string | null
    linkedin: string | null
  }
}

/** One immutable publish of a store — the audit/rollback trail. */
export interface OnlineStorePublication {
  id: string
  version: number
  publishedAt: IsoDateString
  publishedById?: string | null
  publishedByName?: string | null
  /** Set when this publish restored an earlier version (rollback provenance). */
  sourceVersion?: number | null
  config: OnlineStorePublishedConfig
}

/** Publication row without the (large) config — for the audit/history list. */
export type OnlineStorePublicationSummary = Omit<OnlineStorePublication, 'config'>

export interface RestorePublicationRequest {
  version: number
}

/** Product online-store fields (Phase 3I), set on create/update. */
export interface ProductOnlineFields {
  isPublishedOnline?: boolean
  onlineDescription?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
  onlineSortOrder?: number
  onlineStockReserve?: number
}

/**
 * Why a product would not show correctly on the storefront:
 * - `inactive`  — the product is disabled (the public storefront filters `is_active = true`).
 * - `no_price`  — no positive selling price to display/charge.
 * - `no_image`  — no image, so it renders as a blank card.
 * These are advisory: publishing is never hard-blocked (the storefront already only surfaces
 * active + published products), but the admin should be nudged to fix them.
 */
export type ProductPublishBlocker = 'inactive' | 'no_price' | 'no_image'

/** The minimal product shape needed to judge storefront-readiness. */
export interface ProductPublishInput {
  isActive: boolean
  sellingPrice: number
  imageUrl?: string | null
}

export interface ProductPublishability {
  /** True when the product would display correctly once published. */
  ready: boolean
  blockers: ProductPublishBlocker[]
}

/** Shared storefront-readiness check, used by the desktop admin and the API alike. */
export function checkProductPublishable(p: ProductPublishInput): ProductPublishability {
  const blockers: ProductPublishBlocker[] = []
  if (!p.isActive) blockers.push('inactive')
  if (!(p.sellingPrice > 0)) blockers.push('no_price')
  if (!p.imageUrl) blockers.push('no_image')
  return { ready: blockers.length === 0, blockers }
}

// ---- Admin (store owner) product management --------------------------------

/**
 * A product row in the "Online products" manager (desktop + cloud). Served by the online-store
 * module and mutated through it directly (never the offline sync set) — publish state must
 * reflect the live storefront immediately.
 */
export interface OnlineAdminProduct {
  id: string
  name: string
  sku?: string | null
  imageUrl?: string | null
  sellingPrice: number
  categoryName?: string | null
  inStock: number
  trackInventory: boolean
  isActive: boolean
  isPublishedOnline: boolean
}

export interface OnlineAdminProductsQuery {
  page?: number
  limit?: number
  search?: string
  /** true = published only, false = drafts only, omitted = all. */
  published?: boolean
}

// ---- Public (storefront) read shapes ---------------------------------------

export interface PublicStore {
  storeName: string
  storeSlug: string
  tagline?: string | null
  logoUrl?: string | null
  bannerUrl?: string | null
  primaryColor: string
  phone?: string | null
  whatsappNumber?: string | null
  city?: string | null
  currency: string
  showOutOfStock: boolean
  allowOrderNotes: boolean
  minOrderAmount?: number | null
  paymentMethods: {
    cashOnDelivery: boolean
    mtnMomo: boolean
    orangeMoney: boolean
    card: boolean
  }
}

export interface PublicProductVariant {
  id: string
  name: string
  sellingPrice: number
  inStock: number
  attributes: Array<{ groupName: string; optionValue: string; colorHex?: string | null }>
}

export interface PublicProductsQuery {
  page?: number
  limit?: number
  categoryId?: string
  search?: string
}

export interface PublicProductListItem {
  id: string
  name: string
  slug: string
  sellingPrice: number
  currency: string
  primaryImageUrl?: string | null
  categoryName?: string | null
  inStock: number
  hasVariants: boolean
}

export interface PublicProductDetail extends PublicProductListItem {
  description?: string | null
  onlineDescription?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
  images: string[]
  variants: PublicProductVariant[]
}

// ---- Cart, orders, events (Phase 3I part 2) --------------------------------

export interface OnlineCartItem {
  productId: string
  variantId?: string | null
  serialUnitId?: string | null
  quantity: number
  unitPrice: number
  productName: string
  variantName?: string | null
}

export interface OnlineCart {
  sessionToken: string
  items: OnlineCartItem[]
  subtotal: number
  customerName?: string | null
  customerPhone?: string | null
  customerEmail?: string | null
  notes?: string | null
}

export interface AddCartItemRequest {
  productId: string
  variantId?: string
  serialUnitId?: string
  quantity: number
}

export interface UpdateCartItemRequest {
  quantity: number
}

export type OnlineFulfillmentType = 'DELIVERY' | 'PICKUP'

/**
 * Fulfilment status — the PHYSICAL order lifecycle (separate from the payment axis).
 * The flow branches by fulfilment type (see ONLINE_ORDER_TRANSITIONS):
 *   shared:    PENDING → CONFIRMED → PREPARING → …
 *   PICKUP:    … → READY_FOR_PICKUP → PICKED_UP
 *   DELIVERY:  … → READY_FOR_DISPATCH → OUT_FOR_DELIVERY → DELIVERED
 *              (OUT_FOR_DELIVERY → DELIVERY_FAILED → retry | cancel)
 *   off-flow:  CANCELLED (pre-completion), RETURNED (post-completion)
 * Refunds live on the PAYMENT axis (OnlinePaymentStatus), not here.
 */
export type OnlineOrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP' // pickup
  | 'PICKED_UP' // pickup (terminal)
  | 'READY_FOR_DISPATCH' // delivery
  | 'OUT_FOR_DELIVERY' // delivery
  | 'DELIVERED' // delivery (terminal)
  | 'DELIVERY_FAILED' // delivery (retry or cancel)
  | 'RETURNED' // post-completion
  | 'CANCELLED' // terminal

const DELIVERY_TRANSITIONS: Record<OnlineOrderStatus, readonly OnlineOrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_DISPATCH', 'CANCELLED'],
  READY_FOR_DISPATCH: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_FAILED'],
  DELIVERY_FAILED: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  DELIVERED: ['RETURNED'],
  RETURNED: [],
  CANCELLED: [],
  READY_FOR_PICKUP: [], // not reachable in a delivery order
  PICKED_UP: [],
}

const PICKUP_TRANSITIONS: Record<OnlineOrderStatus, readonly OnlineOrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['RETURNED'],
  RETURNED: [],
  CANCELLED: [],
  READY_FOR_DISPATCH: [], // not reachable in a pickup order
  OUT_FOR_DELIVERY: [],
  DELIVERED: [],
  DELIVERY_FAILED: [],
}

/**
 * The fulfilment state machine, branched by fulfilment type. The API enforces these
 * transitions in updateStatus; the admin UI derives its available actions from the map.
 */
export const ONLINE_ORDER_TRANSITIONS: Record<
  OnlineFulfillmentType,
  Record<OnlineOrderStatus, readonly OnlineOrderStatus[]>
> = {
  DELIVERY: DELIVERY_TRANSITIONS,
  PICKUP: PICKUP_TRANSITIONS,
}

/** Statuses that mark a successfully completed order (money is due/collected). */
export const ONLINE_ORDER_COMPLETION_STATUSES: readonly OnlineOrderStatus[] = [
  'DELIVERED',
  'PICKED_UP',
]

/** True if `to` is a valid next status from `from` for the given fulfilment type. */
export function canTransitionOnlineOrder(
  fulfillment: OnlineFulfillmentType,
  from: OnlineOrderStatus,
  to: OnlineOrderStatus,
): boolean {
  return ONLINE_ORDER_TRANSITIONS[fulfillment]?.[from]?.includes(to) ?? false
}

/** True if the status has no onward transitions for the given fulfilment type. */
export function isTerminalOnlineOrderStatus(
  fulfillment: OnlineFulfillmentType,
  status: OnlineOrderStatus,
): boolean {
  return (ONLINE_ORDER_TRANSITIONS[fulfillment]?.[status]?.length ?? 0) === 0
}

/**
 * Payment status — the MONEY axis (independent of fulfilment). COD drives
 * PENDING → PAID on completion; a gateway (paytrack) drives PENDING → AUTHORIZED →
 * PAID / FAILED, and PAID → REFUNDED / PARTIALLY_REFUNDED.
 */
export type OnlinePaymentStatus =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'PAID'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'

/**
 * Static payment methods an admin can record against an online order. COD-era set —
 * dynamic, per-business methods arrive with PayTrack. Mirrors the sale PaymentMethod enum
 * (minus SAVINGS/MIXED, which aren't online-order concepts).
 */
export const ONLINE_PAYMENT_METHODS = ['CASH', 'MTN_MOMO', 'ORANGE_MONEY', 'CARD'] as const
export type OnlinePaymentMethod = (typeof ONLINE_PAYMENT_METHODS)[number]

/** Admin records how/whether an online order was paid (separate from the fulfilment axis). */
export interface UpdateOrderPaymentRequest {
  paymentStatus: OnlinePaymentStatus
  paymentMethod?: OnlinePaymentMethod | null
}

export type OnlineOrderEventType =
  | 'ORDER_PLACED'
  | 'ORDER_CONFIRMED'
  | 'PREPARATION_STARTED'
  | 'ORDER_PACKED' // ready for dispatch/pickup
  | 'ORDER_READY_FOR_PICKUP'
  | 'ORDER_PICKED_UP'
  | 'COURIER_ASSIGNED'
  | 'ORDER_OUT_FOR_DELIVERY'
  | 'DELIVERY_ATTEMPTED'
  | 'DELIVERY_FAILED'
  | 'ORDER_DELIVERED'
  | 'ORDER_RETURNED'
  | 'ORDER_CANCELLED'
  | 'NOTE_ADDED'
  // Payment axis
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_AUTHORIZED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REFUNDED'
  | 'PAYMENT_PARTIALLY_REFUNDED'

export interface CheckoutRequest {
  customerName: string
  customerPhone: string
  customerEmail?: string
  fulfillmentType?: OnlineFulfillmentType
  deliveryAddress?: string
  deliveryCity?: string
  deliveryNotes?: string
  notes?: string
  paymentMethod?: string
}

export interface OnlineOrderEvent {
  id: string
  eventType: OnlineOrderEventType
  fromStatus?: string | null
  toStatus?: string | null
  isCustomerVisible: boolean
  customerMessage?: string | null
  createdAt: IsoDateString
}

export interface OnlineOrder {
  id: string
  onlineStoreId: string
  saleId?: string | null
  orderNumber: string
  trackingToken: string
  customerName: string
  customerEmail?: string | null
  customerPhone?: string | null
  fulfillmentType: OnlineFulfillmentType
  deliveryAddress?: string | null
  deliveryCity?: string | null
  deliveryNotes?: string | null
  status: OnlineOrderStatus
  paymentMethod?: string | null
  paymentStatus: OnlinePaymentStatus
  items?: OnlineCartItem[]
  totalAmount: number
  createdAt?: IsoDateString
  confirmedAt?: IsoDateString | null
  readyAt?: IsoDateString | null
  outForDeliveryAt?: IsoDateString | null
  deliveredAt?: IsoDateString | null
  pickedUpAt?: IsoDateString | null
  returnedAt?: IsoDateString | null
  // Delivery-service (courier) integration seam.
  courierName?: string | null
  courierTrackingNumber?: string | null
  courierTrackingUrl?: string | null
}

export interface UpdateOrderStatusRequest {
  status: OnlineOrderStatus
  internalNote?: string
  customerMessage?: string
}

/** Owner order detail: the order with its full event timeline. */
export interface OnlineOrderDetail extends OnlineOrder {
  events: OnlineOrderEvent[]
}

/** Paginated owner order list. */
export type OnlineOrderListResult = PaginatedResult<OnlineOrder>

/** Public tracking page payload (no auth, by tracking token). */
export interface PublicOrderTracking {
  orderNumber: string
  status: OnlineOrderStatus
  customerName: string
  totalAmount: number
  currency: string
  fulfillmentType: OnlineFulfillmentType
  events: OnlineOrderEvent[]
}
