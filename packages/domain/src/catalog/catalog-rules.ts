// ---------------------------------------------------------------------------
// What a catalog record may be: prices, stock tracking by product type, variants, where a
// category may sit, when it may be deleted, and what a serial number looks like. The server
// (REST and the sync path) and the till all apply these before saving (ruling R12), so a
// record a till saves is never one the server then refuses.
// ---------------------------------------------------------------------------

import { deriveProductTypeFlags, type ProductType, type ProductTypeFlags } from '@biztrack/types'

/**
 * Stock tracking by product type (ruling R13): a service or a bundle holds no stock, a
 * product sold by quantity is always tracked, a simple product follows its own setting.
 */
export function productStockFlags(
  productType: ProductType | `${ProductType}`,
  trackInventory?: boolean | null,
): ProductTypeFlags {
  return deriveProductTypeFlags(productType as ProductType, trackInventory)
}

export type ProductPriceRejection = 'PRODUCT_PRICE_INVALID' | 'PRODUCT_COST_INVALID'

/** A selling price, and a cost when given, are numbers and never negative (ruling R15). */
export function checkProductPrices(input: {
  sellingPrice: number
  costPrice?: number | null
}): ProductPriceRejection | null {
  if (!Number.isFinite(input.sellingPrice) || input.sellingPrice < 0) return 'PRODUCT_PRICE_INVALID'
  if (input.costPrice != null && (!Number.isFinite(input.costPrice) || input.costPrice < 0)) {
    return 'PRODUCT_COST_INVALID'
  }
  return null
}

/** A variant product needs at least one variant; more can be added later (ruling R14). */
export const MIN_PRODUCT_VARIANTS = 1

export function checkVariantCount(count: number): 'PRODUCT_VARIANTS_REQUIRED' | null {
  return count >= MIN_PRODUCT_VARIANTS ? null : 'PRODUCT_VARIANTS_REQUIRED'
}

/** Categories nest at most three levels deep. */
export const MAX_CATEGORY_DEPTH = 3

export type CategoryPlacementRejection =
  | 'CATEGORY_PARENT_NOT_FOUND'
  | 'CATEGORY_PARENT_CYCLE'
  | 'MAX_DEPTH_EXCEEDED'
  /** Only a category with no sub-categories can move: its subtree would change depth. */
  | 'CATEGORY_REPARENT_HAS_CHILDREN'
  /** A category that holds products cannot take sub-categories. */
  | 'CATEGORY_PARENT_HAS_PRODUCTS'
  | 'CATEGORY_PARENT_HAS_VARIANT_OPTIONS'

/**
 * Where a category may sit. `parent` is the category it would go under, as loaded (null
 * when the id does not exist). A new category has no `selfId`.
 */
export function placeCategory(input: {
  selfId?: string | null
  currentParentId?: string | null
  nextParentId: string | null
  /** The category already has sub-categories. */
  hasChildren?: boolean
  parent?: {
    id: string
    depth: number
    hasProducts: boolean
    hasVariantOptions: boolean
  } | null
}):
  | { ok: true; parentId: string | null; depth: number; moved: boolean }
  | { ok: false; code: CategoryPlacementRejection } {
  const next = input.nextParentId || null
  const current = input.currentParentId ?? null
  const moved = !input.selfId || next !== current
  if (input.selfId && moved && input.hasChildren) {
    return { ok: false, code: 'CATEGORY_REPARENT_HAS_CHILDREN' }
  }
  if (next === null) return { ok: true, parentId: null, depth: 1, moved }
  if (input.selfId && next === input.selfId) return { ok: false, code: 'CATEGORY_PARENT_CYCLE' }
  const parent = input.parent
  if (!parent) return { ok: false, code: 'CATEGORY_PARENT_NOT_FOUND' }
  if (moved) {
    if (parent.depth >= MAX_CATEGORY_DEPTH) return { ok: false, code: 'MAX_DEPTH_EXCEEDED' }
    if (parent.hasProducts) return { ok: false, code: 'CATEGORY_PARENT_HAS_PRODUCTS' }
    if (parent.hasVariantOptions) {
      return { ok: false, code: 'CATEGORY_PARENT_HAS_VARIANT_OPTIONS' }
    }
  }
  return { ok: true, parentId: next, depth: parent.depth + 1, moved }
}

/** A category is deleted only once it has no sub-categories and no products. */
export function checkCategoryRemoval(input: {
  hasChildren: boolean
  productCount: number
}): 'CATEGORY_HAS_CHILDREN' | 'CATEGORY_HAS_PRODUCTS' | null {
  if (input.hasChildren) return 'CATEGORY_HAS_CHILDREN'
  if (input.productCount > 0) return 'CATEGORY_HAS_PRODUCTS'
  return null
}

/** Products go only in a category with no active sub-categories. */
export function categoryAcceptsProducts(activeChildCount: number): boolean {
  return activeChildCount === 0
}

export type SerialType = 'IMEI' | 'SERIAL_NUMBER' | 'BARCODE'

/** A 15-digit IMEI with a valid Luhn check digit. */
export function validateImei(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false
  let sum = 0
  for (let i = 0; i < 15; i++) {
    let digit = Number.parseInt(imei[i] as string, 10)
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

/**
 * A serial number for its type: an IMEI is 15 digits with a Luhn check; a serial number is
 * up to 30 letters, digits, '-' or '_'; a barcode is 1 to 30 characters.
 */
export function validateSerialNumber(serial: string, type: SerialType | string): boolean {
  switch (type) {
    case 'IMEI':
      return validateImei(serial)
    case 'SERIAL_NUMBER':
      return /^[A-Za-z0-9\-_]{1,30}$/.test(serial)
    case 'BARCODE':
      return serial.length >= 1 && serial.length <= 30
    default:
      return false
  }
}

/**
 * A brand is deleted only once no product uses it; its models and its category links go
 * with it.
 */
export function checkBrandRemoval(productCount: number): 'BRAND_IN_USE' | null {
  return productCount > 0 ? 'BRAND_IN_USE' : null
}

/** A model is deleted only once no product uses it. */
export function checkModelRemoval(productCount: number): 'MODEL_IN_USE' | null {
  return productCount > 0 ? 'MODEL_IN_USE' : null
}

/**
 * An attribute (group) is deleted only once no live product variant uses it and no category
 * is linked to it; its options go with it. `cause` says which one holds it.
 */
export function checkAttributeGroupRemoval(input: {
  variantUses: number
  categoryLinks: number
}): { code: 'ATTRIBUTE_GROUP_IN_USE'; cause: 'VARIANTS' | 'CATEGORIES' } | null {
  if (input.variantUses > 0) return { code: 'ATTRIBUTE_GROUP_IN_USE', cause: 'VARIANTS' }
  if (input.categoryLinks > 0) return { code: 'ATTRIBUTE_GROUP_IN_USE', cause: 'CATEGORIES' }
  return null
}

/** An attribute option is deleted only once no live product variant uses it. */
export function checkAttributeOptionRemoval(variantUses: number): 'ATTRIBUTE_OPTION_IN_USE' | null {
  return variantUses > 0 ? 'ATTRIBUTE_OPTION_IN_USE' : null
}
