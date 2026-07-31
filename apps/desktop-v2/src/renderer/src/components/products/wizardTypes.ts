import type { ProductImageInput, VariantOptionRef } from '@shared/ipc'

/**
 * A variant captured in the create wizard, held in memory until the product is created.
 * Prices/stock are strings (raw input); the shell converts + averages them at save time.
 * A variant is a mini-product: it carries its own image gallery and, for serialized products,
 * its own list of serial numbers (its stock = that count).
 */
export interface DraftVariant {
  /** Stable client key for list rendering (not persisted). */
  key: string
  name: string
  /** Attribute-based variants carry one option per group; free-form variants have []. */
  options: VariantOptionRef[]
  sku: string
  price: string
  cost: string
  openingStock: string
  lowStockThreshold: string
  reorderPoint: string
  gallery: ProductImageInput[]
  /** Serial numbers for this variant (only when the product is serialized). */
  serials: string[]
}

export function emptyDraftVariant(key: string): DraftVariant {
  return {
    key,
    name: '',
    options: [],
    sku: '',
    price: '',
    cost: '',
    openingStock: '',
    lowStockThreshold: '',
    reorderPoint: '',
    gallery: [],
    serials: [],
  }
}

/** Average of the numeric values in a list of raw strings, or null when none are set. */
export function averageOf(values: string[]): number | null {
  const nums = values
    .map((v) => Number(v.replace(/\s/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0)
  if (nums.length === 0) return null
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}
