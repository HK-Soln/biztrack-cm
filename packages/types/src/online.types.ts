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

export type OnlineOrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED'

export type OnlinePaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'

export type OnlineOrderEventType =
  | 'ORDER_PLACED'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_FAILED'
  | 'ORDER_CONFIRMED'
  | 'PREPARATION_STARTED'
  | 'ORDER_DISPATCHED'
  | 'ORDER_DELIVERED'
  | 'ORDER_CANCELLED'
  | 'ORDER_REFUNDED'
  | 'NOTE_ADDED'
  | 'DELIVERY_ATTEMPTED'

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
  dispatchedAt?: IsoDateString | null
  deliveredAt?: IsoDateString | null
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
