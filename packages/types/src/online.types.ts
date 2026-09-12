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
  // Prepayments / partial payment + COD eligibility (Spec 10 ②).
  allowPartialPayment: boolean
  partialMinPercent: number
  partialMinOrderAmount: number
  depositRequired: boolean
  codMinOrderAmount: number
  codMaxOrderAmount?: number | null
  // Fulfilment: which options the store offers + delivery economics/reach.
  offerDelivery: boolean
  offerPickup: boolean
  /** Flat delivery fee in the store currency (minor unit not used — whole XAF). */
  deliveryFee: number
  pickupAddress?: string | null
  /** Cities/zones the store delivers to (empty = anywhere the customer enters). Legacy — superseded by
   *  deliveryZones. */
  deliveryCities: string[]
  // Address-driven delivery zones (Spec 10 ③).
  deliveryZones: DeliveryZone[]
  freeDeliveryOverAmount?: number | null
  unlistedAreaBehavior: UnlistedAreaBehavior
  unlistedDefaultFee: number
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
  allowPartialPayment?: boolean
  partialMinPercent?: number
  partialMinOrderAmount?: number
  depositRequired?: boolean
  codMinOrderAmount?: number
  codMaxOrderAmount?: number | null
  offerDelivery?: boolean
  offerPickup?: boolean
  deliveryFee?: number
  pickupAddress?: string | null
  deliveryCities?: string[]
  deliveryZones?: DeliveryZone[]
  freeDeliveryOverAmount?: number | null
  unlistedAreaBehavior?: UnlistedAreaBehavior
  unlistedDefaultFee?: number
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
  payment: {
    cashOnDelivery: boolean
    mtnMomo: boolean
    orangeMoney: boolean
    card: boolean
    /** Prepayments / partial payment + COD eligibility (Spec 10 ②). */
    allowPartialPayment: boolean
    partialMinPercent: number
    partialMinOrderAmount: number
    depositRequired: boolean
    codMinOrderAmount: number
    codMaxOrderAmount: number | null
  }
  fulfilment: {
    offerDelivery: boolean
    offerPickup: boolean
    deliveryFee: number
    pickupAddress: string | null
    deliveryCities: string[]
    // Address-driven delivery zones (Spec 10 ③).
    deliveryZones: DeliveryZone[]
    freeDeliveryOverAmount: number | null
    unlistedAreaBehavior: UnlistedAreaBehavior
    unlistedDefaultFee: number
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
  /** Theme preset (a–d) + light/dark, driving the storefront's CSS tokens. */
  themeId: string
  appearance: OnlineStoreAppearance
  layoutTemplate: OnlineStoreLayout
  phone?: string | null
  email?: string | null
  address?: string | null
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
  /** Prepayments / partial payment + COD eligibility (Spec 10 ②). Drives the checkout payment-mode
   *  resolver (full online / deposit + rest on delivery / full COD). */
  prepayment: {
    allowPartialPayment: boolean
    partialMinPercent: number
    partialMinOrderAmount: number
    depositRequired: boolean
    codMinOrderAmount: number
    codMaxOrderAmount: number | null
  }
  fulfilment: {
    offerDelivery: boolean
    offerPickup: boolean
    deliveryFee: number
    pickupAddress?: string | null
    deliveryCities: string[]
    // Address-driven delivery zones (Spec 10 ③).
    deliveryZones: DeliveryZone[]
    freeDeliveryOverAmount: number | null
    unlistedAreaBehavior: UnlistedAreaBehavior
    unlistedDefaultFee: number
  }
  socials: {
    instagram?: string | null
    facebook?: string | null
    tiktok?: string | null
    x?: string | null
    linkedin?: string | null
  }
  seo: {
    title?: string | null
    description?: string | null
    ogImageUrl?: string | null
  }
}

/** The payment modes a checkout may offer for a given order (Spec 10 ②). */
export interface CheckoutPaymentEligibility {
  /** Pay the full amount online now. */
  fullOnline: boolean
  /** Pay a deposit online now, the rest on delivery. */
  deposit: boolean
  /** Pay everything on delivery (cash). */
  fullCod: boolean
  /** Deposit amount bounds in major units (min = the configured %; max = the full total). */
  depositMin: number
  depositMax: number
}

/**
 * Resolve which payment modes a checkout may offer, from the store's prepayment/COD config + the
 * enabled methods + the order total (Spec 10 ②). A *required* deposit removes full COD so it can't be
 * bypassed; a deposit is always paid online, so it needs an online method.
 */
export function resolveCheckoutPayment(
  cfg: PublicStore['prepayment'],
  methods: PublicStore['paymentMethods'],
  orderTotal: number,
): CheckoutPaymentEligibility {
  const anyOnline = methods.mtnMomo || methods.orangeMoney || methods.card
  const depositApplies = cfg.allowPartialPayment && orderTotal >= cfg.partialMinOrderAmount
  const codWithinRange =
    orderTotal >= cfg.codMinOrderAmount &&
    (cfg.codMaxOrderAmount == null || orderTotal <= cfg.codMaxOrderAmount)
  const depositMin = Math.min(Math.ceil((orderTotal * cfg.partialMinPercent) / 100), orderTotal)
  return {
    fullOnline: anyOnline,
    deposit: depositApplies && anyOnline,
    fullCod: methods.cashOnDelivery && codWithinRange && !(depositApplies && cfg.depositRequired),
    depositMin,
    depositMax: orderTotal,
  }
}

/** A delivery zone (Spec 10 ③): a fee for addresses matching country/region/city (any subset). */
export interface DeliveryZone {
  id: string
  name: string
  fee: number
  countryIso2?: string | null
  region?: string | null
  city?: string | null
}

/** What to do when a delivery address matches no configured zone. */
export type UnlistedAreaBehavior = 'BLOCK' | 'DEFAULT_FEE' | 'ARRANGE'

/** The customer's structured delivery address (Spec 10 ③), used to match a zone. */
export interface DeliveryAddressInput {
  countryIso2?: string | null
  region?: string | null
  city?: string | null
}

/** The store's fulfilment config needed to price delivery. */
export interface DeliveryPricingConfig {
  deliveryZones: DeliveryZone[]
  /** Legacy flat fee — used when no zones are configured. */
  deliveryFee: number
  freeDeliveryOverAmount?: number | null
  unlistedAreaBehavior: UnlistedAreaBehavior
  unlistedDefaultFee: number
}

export interface DeliveryFeeResult {
  /** False only when the address is unlisted and the store blocks delivery there. */
  deliverable: boolean
  fee: number
  matchedZoneName: string | null
  /** True when the address is unlisted and the store arranges the fee separately (fee = 0 for now; the
   *  merchant sends a payment link for the delivery fee later). */
  arrangeSeparately: boolean
  freeApplied: boolean
}

/** Most-specific match wins: a zone matches if every field it specifies equals the address; among
 *  matches, city beats region beats country. */
export function matchDeliveryZone(
  zones: DeliveryZone[],
  address: DeliveryAddressInput,
): DeliveryZone | null {
  const norm = (s?: string | null) => (s ?? '').trim().toLowerCase()
  const c = norm(address.countryIso2)
  const r = norm(address.region)
  const ci = norm(address.city)
  let best: DeliveryZone | null = null
  let bestScore = -1
  for (const z of zones) {
    const zc = norm(z.countryIso2)
    const zr = norm(z.region)
    const zci = norm(z.city)
    if (zc && zc !== c) continue
    if (zr && zr !== r) continue
    if (zci && zci !== ci) continue
    const score = (zci ? 4 : 0) + (zr ? 2 : 0) + (zc ? 1 : 0)
    if (score > bestScore) {
      bestScore = score
      best = z
    }
  }
  return best
}

/**
 * Resolve the delivery fee for an order (Spec 10 ③): free-over-threshold first, then the most-specific
 * matching zone; with no zones configured fall back to the legacy flat fee; otherwise apply the
 * unlisted-area behaviour (block / default fee / arrange separately).
 */
export function resolveDeliveryFee(
  cfg: DeliveryPricingConfig,
  address: DeliveryAddressInput,
  subtotal: number,
): DeliveryFeeResult {
  if (cfg.freeDeliveryOverAmount != null && cfg.freeDeliveryOverAmount > 0 && subtotal >= cfg.freeDeliveryOverAmount)
    return { deliverable: true, fee: 0, matchedZoneName: null, arrangeSeparately: false, freeApplied: true }

  const zone = matchDeliveryZone(cfg.deliveryZones ?? [], address)
  if (zone)
    return {
      deliverable: true,
      fee: Math.max(0, Math.round(zone.fee)),
      matchedZoneName: zone.name,
      arrangeSeparately: false,
      freeApplied: false,
    }

  // No zones configured → legacy flat fee for every delivery.
  if (!cfg.deliveryZones || cfg.deliveryZones.length === 0)
    return {
      deliverable: true,
      fee: Math.max(0, Math.round(cfg.deliveryFee ?? 0)),
      matchedZoneName: null,
      arrangeSeparately: false,
      freeApplied: false,
    }

  switch (cfg.unlistedAreaBehavior) {
    case 'BLOCK':
      return { deliverable: false, fee: 0, matchedZoneName: null, arrangeSeparately: false, freeApplied: false }
    case 'ARRANGE':
      return { deliverable: true, fee: 0, matchedZoneName: null, arrangeSeparately: true, freeApplied: false }
    case 'DEFAULT_FEE':
    default:
      return {
        deliverable: true,
        fee: Math.max(0, Math.round(cfg.unlistedDefaultFee ?? 0)),
        matchedZoneName: null,
        arrangeSeparately: false,
        freeApplied: false,
      }
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
  categoryIds?: string[]
  brandIds?: string[]
  modelIds?: string[]
  attributeOptionIds?: string[]
  search?: string
}

/** A selectable facet value (brand, model, or attribute option) available in a store. */
export interface PublicFacetOption {
  id: string
  value: string
  colorHex?: string | null
}

export interface PublicAttributeGroupFacet {
  id: string
  name: string
  displayType: string
  options: PublicFacetOption[]
}

export interface PublicBrandFacet {
  id: string
  name: string
  slug: string
}

export interface PublicModelFacet {
  id: string
  name: string
  slug: string
  brandId: string
}

/** Filterable facets present on a store's published products (empty values omitted). */
export interface PublicFacets {
  brands: PublicBrandFacet[]
  models: PublicModelFacet[]
  attributeGroups: PublicAttributeGroupFacet[]
}

/** A message sent from a storefront's contact form to the business (delivered by email). */
export interface ContactMessageRequest {
  name: string
  phone?: string
  email?: string
  subject: string
  message: string
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
  /** When false, the product isn't stock-tracked → always available (ignore inStock). */
  trackInventory: boolean
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
  /** The product's primary image, for the cart / checkout thumbnails. */
  imageUrl?: string | null
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
  // Some money collected, balance still outstanding (deposit, or COD partly paid).
  | 'PARTIALLY_PAID'
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
  /** Structured delivery address (Spec 10 ③): country (ISO2) + region + city drive zone matching;
   *  deliveryAddress is the free-text street line. */
  deliveryCountry?: string
  deliveryRegion?: string
  deliveryAddress?: string
  deliveryCity?: string
  deliveryNotes?: string
  notes?: string
  paymentMethod?: string
  /** How the customer chose to pay (Spec 10 ②). Defaults to full online when a provider method is set,
   *  else COD. DEPOSIT collects `depositAmount` online now, the rest on delivery. */
  paymentMode?: 'FULL_ONLINE' | 'DEPOSIT' | 'FULL_COD'
  /** For paymentMode DEPOSIT: the amount (major units) to collect online now; the server re-validates it
   *  against the store's minimum deposit + order total. */
  depositAmount?: number
  /** The storefront's own origin (e.g. https://acme.example). For a provider-backed method the server
   * builds the hosted-payment return URLs from this + the new order's tracking token, so the customer
   * lands back on their order page. Ignored for COD. */
  returnUrl?: string
}

/**
 * The payment outcome/intent for an order (Spec 07). Two uses share this shape:
 *
 * At CHECKOUT, `mode` tells the storefront how to proceed (payment is NOT triggered here for
 * self-handled providers — order creation is decoupled from payment):
 *  - `redirect` → a hosted provider (Stripe): `url` is set, the storefront navigates there.
 *  - `self`     → a self-handled provider (MTN MoMo request-to-pay): the storefront sends the
 *                 customer to our own payment page `/orders/{token}/pay`, where the payment is
 *                 started and managed (enter number → push → poll → retry) without ever having
 *                 risked the order creation.
 *  - `none`     → no online payment (COD): go straight to the order page.
 *
 * On the PAYMENT PAGE, starting/retrying a payment returns the per-attempt outcome:
 *  - `url`     → hosted redirect: navigate there.
 *  - `pending` → push accepted; the customer approves on their phone; poll `GET .../orders/{token}/payment`.
 *  - `failed`  → the payment could not be started (provider error); show a retry.
 */
export interface CheckoutPayment {
  // 'link' (Spec 09) → the storefront redirects to the unified /pay/{token} page; 'none' → COD / no
  // online payment. The legacy 'redirect'/'self' order-pay-page modes were retired (Spec 09 slice 8).
  mode?: 'link' | 'none'
  /** mode==='link' — the payment-link token to pay the order at /pay/{token}. */
  token?: string
  /** mode==='link' — the method the customer preferred at checkout, pre-selected on the pay page. */
  method?: string
  /** mode==='link' with a DEPOSIT — the amount (major units) to collect online now; the pay page
   *  pre-fills it. Absent for a full-amount link. */
  amount?: number
}

/** Checkout result. `payment` is present only when a provider-backed method was chosen. */
export interface CheckoutResult {
  orderNumber: string
  trackingToken: string
  status: OnlineOrderStatus
  payment?: CheckoutPayment
}

/** Public payment status for the storefront payment page (polled while a push payment is pending).
 * PENDING → keep waiting; PAID → done; FAILED → let the customer retry.
 * `reason` is a provider failure-reason CODE (whitelisted, FAILED only) the storefront maps to copy. */
export interface PublicPaymentStatus {
  status: 'PENDING' | 'PAID' | 'FAILED'
  reason?: string
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
  // Money breakdown. `totalAmount = subtotal + deliveryFee + codFee + otherCharges`.
  // Persisted so the sale posted at confirm can map fees to typed charge lines instead of
  // losing them as overpayment (see docs/online-order-sale-flow-redesign.md §7).
  subtotal?: number
  deliveryFee?: number
  codFee?: number
  otherCharges?: number
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

/** Admin's serial-unit choices for a serialized order item (one id per unit ordered). */
export interface OrderSerialSelection {
  productId: string
  variantId?: string | null
  serialUnitIds: string[]
}

export interface UpdateOrderStatusRequest {
  status: OnlineOrderStatus
  internalNote?: string
  customerMessage?: string
  /** Serial units chosen for serialized items — required when confirming such an order. */
  serialUnitSelections?: OrderSerialSelection[]
}

/** A single money movement on the order's sale ledger (collection or refund). */
export interface OnlineOrderPaymentEntry {
  method: string
  amount: number
  kind: 'PAYMENT' | 'REFUND'
  at: IsoDateString
}

/** Financial summary of the order's posted sale — the money ledger behind the fulfilment. */
export interface OnlineOrderFinancials {
  saleId: string
  saleNumber: string
  /** Sale status (COMPLETED | VOIDED | REFUNDED | PARTIALLY_REFUNDED). */
  status: string
  totalAmount: number
  amountPaid: number
  /** Outstanding balance (COD not yet collected). */
  balanceDue: number
  refundedAmount: number
  chargesAmount: number
  payments: OnlineOrderPaymentEntry[]
}

/** Owner order detail: the order with its full event timeline + sale financials (if posted). */
export interface OnlineOrderDetail extends OnlineOrder {
  events: OnlineOrderEvent[]
  financials?: OnlineOrderFinancials | null
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
  /** The chosen payment method (CASH/MTN_MOMO/ORANGE_MONEY/CARD) + its money-axis status — drive the
   *  payment page (whether an online payment is still owed and how to collect it). */
  paymentMethod: string | null
  paymentStatus: OnlinePaymentStatus
  /** The phone the customer gave at checkout — prefills the Mobile Money number on the payment page
   *  (readable only with the order's secret tracking token). */
  customerPhone: string | null
  events: OnlineOrderEvent[]
}
