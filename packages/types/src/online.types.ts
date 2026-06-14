import type { IsoDateString } from './http.types'

export type OnlineStoreDomainType = 'PATH' | 'SUBDOMAIN' | 'CUSTOM' | 'PURCHASED'

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
