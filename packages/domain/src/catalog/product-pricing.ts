// ---------------------------------------------------------------------------
// What a product or variant sells for and costs, the price a variant product is shown at,
// its margin, and whether its stock is low. One rule for the API, the till and the screens.
// The stock and catalog-value SQL on both sides mirrors these by hand (it has to run inside
// the query); keep them in step.
// ---------------------------------------------------------------------------

import { roundPercent } from '../reports/period-summary'

interface PricedProduct {
  sellingPrice: number
  costPrice?: number | null
}

interface PricedVariant {
  priceOverride?: number | null
  costPriceOverride?: number | null
}

/** A variant sells at its own price when it has one, else at the product's. */
export function variantPrice(product: PricedProduct, variant?: PricedVariant | null): number {
  return Number(variant?.priceOverride ?? product.sellingPrice)
}

/** A variant costs its own cost when it has one, else the product's; null when neither has one. */
export function variantCost(product: PricedProduct, variant?: PricedVariant | null): number | null {
  const cost = variant?.costPriceOverride ?? product.costPrice
  return cost == null ? null : Number(cost)
}

/** The price a product is shown at: for a variant product, its cheapest variant ("from"). */
export function productDisplayPrice(
  product: PricedProduct,
  variants: ReadonlyArray<PricedVariant> = [],
): number {
  return variants.length
    ? Math.min(...variants.map((v) => variantPrice(product, v)))
    : Number(product.sellingPrice)
}

/**
 * The cost a product is shown at: for a variant product, the average of the variants that
 * have a cost (one with no cost is left out, not counted as free); null when none has one.
 */
export function productAverageCost(
  product: PricedProduct,
  variants: ReadonlyArray<PricedVariant> = [],
): number | null {
  if (!variants.length) return product.costPrice == null ? null : Number(product.costPrice)
  const costs = variants
    .map((v) => variantCost(product, v))
    .filter((cost): cost is number => cost != null)
  return costs.length ? costs.reduce((sum, c) => sum + c, 0) / costs.length : null
}

/**
 * Margin on the selling price, in percent to one decimal. Null when it cannot be told: no
 * price, or no cost recorded.
 */
export function marginPercent(price: number, cost: number | null | undefined): number | null {
  if (!(price > 0) || cost == null || !(cost > 0)) return null
  return roundPercent(((price - cost) / price) * 100)
}

export type StockStatus = 'OUT' | 'LOW' | 'IN'

/**
 * Where a tracked product's stock stands. Out at or below zero. Low when at or below its
 * reorder point (or, without one, its low-stock threshold) and that limit is above zero.
 */
export function stockStatus(input: {
  stock: number
  reorderPoint?: number | null
  lowStockThreshold?: number | null
}): StockStatus {
  if (input.stock <= 0) return 'OUT'
  const threshold = input.reorderPoint ?? input.lowStockThreshold ?? 0
  return threshold > 0 && input.stock <= threshold ? 'LOW' : 'IN'
}

/** A product SKU is stored trimmed and in capitals; letters, digits, '-' and '_' only. */
export const PRODUCT_SKU_PATTERN = /^[A-Z0-9\-_]{1,100}$/

export function normalizeProductSku(raw: string | null | undefined): string | null {
  const sku = raw?.trim().toUpperCase()
  return sku ? sku : null
}

export type ProductSkuRejection = 'PRODUCT_SKU_INVALID' | 'PRODUCT_SKU_IMMUTABLE'

/**
 * A SKU given for a product. It must have the right shape, and once a product has a SKU it
 * cannot change (receipts, labels and other systems refer to it).
 */
export function checkProductSku(input: {
  existing?: string | null
  incoming?: string | null
}): { ok: true; sku: string | null } | { ok: false; code: ProductSkuRejection } {
  const existing = normalizeProductSku(input.existing)
  const incoming = normalizeProductSku(input.incoming)
  if (existing) {
    return incoming && incoming !== existing
      ? { ok: false, code: 'PRODUCT_SKU_IMMUTABLE' }
      : { ok: true, sku: existing }
  }
  if (incoming && !PRODUCT_SKU_PATTERN.test(incoming)) {
    return { ok: false, code: 'PRODUCT_SKU_INVALID' }
  }
  return { ok: true, sku: incoming }
}
