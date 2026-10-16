// ---------------------------------------------------------------------------
// Stock changes (slice 9): what a manual adjustment does to a stock level, when it is
// refused, and which movement a change is recorded as. The server (REST and the sync
// replay), the till's main process and its adjust-stock dialog all call these, so a till
// adjustment is never one the server works out differently.
// ---------------------------------------------------------------------------

import { stockStatus, type StockStatus } from '../catalog/product-pricing'
import { roundQuantity } from '../sales/sale-pricing'

export type StockAdjustmentKind = 'ADD' | 'REMOVE' | 'SET'

/** A manual adjustment carries a reason of at least this many characters (trimmed). */
export const STOCK_ADJUSTMENT_REASON_MIN = 3

export type StockAdjustmentRejection =
  | 'STOCK_QUANTITY_INVALID'
  | 'STOCK_QUANTITY_NOT_POSITIVE'
  | 'STOCK_QUANTITY_NEGATIVE'
  | 'INVENTORY_INSUFFICIENT_STOCK'
  | 'STOCK_REASON_REQUIRED'

export type StockAdjustmentDecision =
  | {
      ok: true
      /** The level before and after, at most three decimals. */
      before: number
      after: number
      /** after − before; 0 means nothing changes and nothing is recorded. */
      change: number
      /** The reason, trimmed. */
      notes: string
    }
  | { ok: false; code: StockAdjustmentRejection }

/**
 * The quantity of a manual adjustment, before any level is read: ADD and REMOVE take a
 * quantity above zero, SET takes the new level (zero or more).
 */
export function checkStockAdjustmentQuantity(input: {
  type: StockAdjustmentKind | `${StockAdjustmentKind}`
  quantity: number
}): Extract<
  StockAdjustmentRejection,
  'STOCK_QUANTITY_INVALID' | 'STOCK_QUANTITY_NOT_POSITIVE' | 'STOCK_QUANTITY_NEGATIVE'
> | null {
  const { type } = input
  if (!Number.isFinite(input.quantity)) return 'STOCK_QUANTITY_INVALID'
  if (type !== 'ADD' && type !== 'REMOVE' && type !== 'SET') return 'STOCK_QUANTITY_INVALID'
  const quantity = roundQuantity(input.quantity)
  if ((type === 'ADD' || type === 'REMOVE') && quantity <= 0) return 'STOCK_QUANTITY_NOT_POSITIVE'
  if (type === 'SET' && quantity < 0) return 'STOCK_QUANTITY_NEGATIVE'
  return null
}

/**
 * A manual adjustment of one stock level: the quantity check above, then stock never goes
 * below zero by an adjustment, then a reason is required. The checks run in this order, so
 * a screen shows the same first problem the server would.
 */
export function decideStockAdjustment(input: {
  current: number
  type: StockAdjustmentKind | `${StockAdjustmentKind}`
  quantity: number
  notes?: string | null
}): StockAdjustmentDecision {
  const quantityProblem = checkStockAdjustmentQuantity(input)
  if (quantityProblem) return { ok: false, code: quantityProblem }
  if (!Number.isFinite(input.current)) return { ok: false, code: 'STOCK_QUANTITY_INVALID' }
  const quantity = roundQuantity(input.quantity)
  const before = roundQuantity(input.current)
  const after = roundQuantity(
    input.type === 'ADD'
      ? before + quantity
      : input.type === 'REMOVE'
        ? before - quantity
        : quantity,
  )
  if (after < 0) return { ok: false, code: 'INVENTORY_INSUFFICIENT_STOCK' }

  const notes = (input.notes ?? '').trim()
  if (notes.length < STOCK_ADJUSTMENT_REASON_MIN) {
    return { ok: false, code: 'STOCK_REASON_REQUIRED' }
  }
  return { ok: true, before, after, change: roundQuantity(after - before), notes }
}

/** The level an adjustment would leave, for a screen's preview (no checks). */
export function previewStockAdjustment(input: {
  current: number
  type: StockAdjustmentKind | `${StockAdjustmentKind}`
  quantity: number
}): number {
  const quantity = Number.isFinite(input.quantity) ? input.quantity : 0
  return roundQuantity(
    input.type === 'ADD'
      ? input.current + quantity
      : input.type === 'REMOVE'
        ? input.current - quantity
        : quantity,
  )
}

export type StockChangeMovementType = 'OPENING_STOCK' | 'MANUAL_ADJUSTMENT'

/**
 * Which movement a stock change outside a sale or a restock is recorded as: a product's
 * first ever positive change is its OPENING_STOCK, every later one a MANUAL_ADJUSTMENT.
 * `hasHistory` is whether the product already has any movement.
 */
export function stockChangeMovementType(input: {
  change: number
  hasHistory: boolean
}): StockChangeMovementType {
  return input.change > 0 && !input.hasHistory ? 'OPENING_STOCK' : 'MANUAL_ADJUSTMENT'
}

export type StockAdjustmentTargetRejection =
  | 'STOCK_NOT_TRACKED'
  | 'STOCK_SERIALIZED'
  | 'STOCK_VARIANT_REQUIRED'
  | 'STOCK_VARIANT_NOT_EXPECTED'

/**
 * Which level a manual adjustment may change. A product that does not track stock has none.
 * A serialized product's stock is its serial units, changed by adding or retiring units. A
 * product with variants is adjusted variant by variant; a product without has one level.
 */
export function checkStockAdjustmentTarget(input: {
  trackInventory: boolean
  isSerialized: boolean
  hasVariants: boolean
  variantId?: string | null
}): StockAdjustmentTargetRejection | null {
  if (!input.trackInventory) return 'STOCK_NOT_TRACKED'
  if (input.isSerialized) return 'STOCK_SERIALIZED'
  if (input.hasVariants && !input.variantId) return 'STOCK_VARIANT_REQUIRED'
  if (!input.hasVariants && input.variantId) return 'STOCK_VARIANT_NOT_EXPECTED'
  return null
}

/**
 * The stock level a new product starts with, whether it is made on the server or arrives
 * from a till. An untracked product has none. A serialized product's stock is its serial
 * units: its level only holds its low-stock thresholds and stays at 0, and the units record
 * their own movements. Any other tracked product starts at its opening stock (never below
 * zero), recorded as an OPENING_STOCK movement when above zero.
 */
export function newProductStockLevel(input: {
  trackInventory: boolean
  isSerialized: boolean
  openingStock?: number | null
}): { quantity: number } | null {
  if (!input.trackInventory) return null
  if (input.isSerialized) return { quantity: 0 }
  const opening = Number(input.openingStock ?? 0)
  return { quantity: Number.isFinite(opening) ? Math.max(roundQuantity(opening), 0) : 0 }
}

/**
 * The stock level a new variant starts with: its opening stock (never below zero) when the
 * product tracks stock and is not serialized. A serialized variant's stock is its units.
 */
export function newVariantStockLevel(input: {
  trackInventory: boolean
  isSerialized: boolean
  openingStock?: number | null
}): { quantity: number } | null {
  if (!input.trackInventory || input.isSerialized) return null
  return newProductStockLevel(input)
}

/**
 * What an edit does to a product's own level: a product that starts tracking stock gets one
 * (at 0), one that stops tracking loses it, otherwise it is kept.
 */
export function stockLevelOnEdit(input: {
  trackInventory: boolean
  hasLevel: boolean
}): 'CREATE' | 'KEEP' | 'REMOVE' | 'NONE' {
  if (input.trackInventory) return input.hasLevel ? 'KEEP' : 'CREATE'
  return input.hasLevel ? 'REMOVE' : 'NONE'
}

export interface StockLevelReading {
  stock: number
  reorderPoint?: number | null
  lowStockThreshold?: number | null
}

/**
 * Where a product's stock stands (OUT, LOW or IN). A product without variants is judged on
 * its own level (`stockStatus`: out at or below zero, low at or below its reorder point, or
 * else its low-stock threshold). A product with variants is out when its variants hold
 * nothing in total, and low when any one variant is out or low by its own thresholds, so
 * an empty size shows before the whole product runs out.
 */
export function productStockStatus(
  input: StockLevelReading & { variants?: readonly StockLevelReading[] | null },
): StockStatus {
  const variants = input.variants ?? []
  if (variants.length === 0) return stockStatus(input)
  const total = variants.reduce((sum, v) => sum + v.stock, 0)
  if (total <= 0) return 'OUT'
  return variants.some((v) => stockStatus(v) !== 'IN') ? 'LOW' : 'IN'
}

/**
 * `stockStatus` as a SQL CASE expression ('OUT' | 'LOW' | 'IN'), for lists, filters and
 * counts that must be done in the database. The arguments are SQL expressions for the
 * level's stock, reorder point and low-stock threshold; the same text runs on Postgres and
 * SQLite.
 */
export function stockStatusSql(
  stock: string,
  reorderPoint: string,
  lowStockThreshold: string,
): string {
  const threshold = `COALESCE(${reorderPoint}, ${lowStockThreshold}, 0)`
  return `(CASE WHEN ${stock} <= 0 THEN 'OUT' WHEN ${threshold} > 0 AND ${stock} <= ${threshold} THEN 'LOW' ELSE 'IN' END)`
}

/**
 * `productStockStatus` as a SQL CASE expression. `hasVariants` is a boolean SQL expression
 * (whether live variant rows exist), `stock` the product's effective stock (the variants'
 * total for a variant product), and `anyVariantShort` a boolean SQL expression for "some
 * live variant's `stockStatusSql` is not 'IN'".
 */
export function productStockStatusSql(e: {
  stock: string
  reorderPoint: string
  lowStockThreshold: string
  hasVariants: string
  anyVariantShort: string
}): string {
  return `(CASE WHEN ${e.hasVariants} THEN (CASE WHEN ${e.stock} <= 0 THEN 'OUT' WHEN ${e.anyVariantShort} THEN 'LOW' ELSE 'IN' END) ELSE ${stockStatusSql(e.stock, e.reorderPoint, e.lowStockThreshold)} END)`
}

/** What a stock plan needs to know about a product. */
export interface StockedProduct {
  productType: string
  trackInventory: boolean
  isSerialized: boolean
}

/**
 * The stock levels a sale takes from, and that a void or a returned-to-stock refund gives
 * back. A bundle takes from its components (each component's quantity per bundle × the
 * bundles sold); a serialized product's stock is its units, which the sale marks sold, so it
 * touches no level; a product that does not track stock touches none. Lines keep their other
 * fields (a component line keeps the bundle line's), so a caller can carry its own ids.
 */
export function saleStockLines<
  L extends { productId: string; variantId?: string | null; quantity: number },
>(
  lines: readonly L[],
  catalog: {
    product: (productId: string) => StockedProduct | undefined
    components: (
      bundleId: string,
    ) => ReadonlyArray<{ componentProductId: string; quantity: number }>
  },
): L[] {
  const out: L[] = []
  const takesLevel = (p: StockedProduct | undefined) =>
    p == null || (p.trackInventory && !p.isSerialized)
  for (const line of lines) {
    const product = catalog.product(line.productId)
    if (product?.productType === 'COMPOSITE') {
      for (const part of catalog.components(line.productId)) {
        if (!takesLevel(catalog.product(part.componentProductId))) continue
        out.push({
          ...line,
          productId: part.componentProductId,
          variantId: null,
          quantity: roundQuantity(part.quantity * line.quantity),
        })
      }
    } else if (takesLevel(product)) {
      out.push(line)
    }
  }
  return out
}

/**
 * What deleting a product does to its stock: whatever it still holds is written off with a
 * MANUAL_ADJUSTMENT movement (none when it holds nothing), its serial units become DAMAGED and
 * are removed, and its levels go to 0. `stock` is its effective stock before the delete.
 */
export function planProductRemoval(input: { stock: number }): {
  writeOff: number
  movementType: 'MANUAL_ADJUSTMENT'
  serialStatus: 'DAMAGED'
} {
  return {
    writeOff: Math.max(0, roundQuantity(input.stock)),
    movementType: 'MANUAL_ADJUSTMENT',
    serialStatus: 'DAMAGED',
  }
}

/**
 * Removing one variant: it needs a reason; its stock (its level, or its in-stock units for a
 * serialized product) is written off against the variant; its units become DAMAGED. A product
 * left without variants becomes a product without variants.
 */
export function planVariantRemoval(input: { reason?: string | null; stock: number }):
  | {
      ok: true
      reason: string
      writeOff: number
      movementType: 'MANUAL_ADJUSTMENT'
      serialStatus: 'DAMAGED'
    }
  | { ok: false; code: 'VARIANT_REMOVE_REASON_REQUIRED' } {
  const reason = (input.reason ?? '').trim()
  if (!reason) return { ok: false, code: 'VARIANT_REMOVE_REASON_REQUIRED' }
  return {
    ok: true,
    reason,
    writeOff: Math.max(0, roundQuantity(input.stock)),
    movementType: 'MANUAL_ADJUSTMENT',
    serialStatus: 'DAMAGED',
  }
}
