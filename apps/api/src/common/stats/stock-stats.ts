import { productStockStatusSql, stockStatusSql } from '@biztrack/domain'

/**
 * Shared raw-SQL fragments + response shapes for the catalog/inventory stats endpoints.
 *
 * Effective on-hand stock per product mirrors the desktop (stock-ledger.ts) ported to the
 * API's Postgres schema where stock lives in `inventory_levels` (not on the product row):
 *   - serialized   → count of IN_STOCK serial units
 *   - has variants → SUM of the variants' inventory-level quantities
 *   - otherwise    → the product-level inventory-level quantity (variant_id IS NULL)
 *
 * Effective cost / price for value calcs:
 *   - has variants → AVG of the variants' effective (override ?? base) cost/price
 *   - otherwise    → the product's own cost_price / price
 *
 * `a` is the products table alias in the surrounding query (default 'p').
 */
// A product "has variants" iff variant rows actually exist — NOT the `has_variants` flag,
// which can go stale (variants added/removed without updating it). This mirrors the
// desktop's STOCK_EXPR/PRICE_EXPR so both sides derive identical values.
function variantsExist(a: string): string {
  return `EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = ${a}.id AND pv.deleted_at IS NULL)`
}

export function stockExpr(a = 'p'): string {
  return `(CASE
    WHEN ${a}.is_serialized THEN (
      SELECT COUNT(*) FROM product_serial_units su
      WHERE su.product_id = ${a}.id AND su.deleted_at IS NULL AND su.status = 'IN_STOCK')
    WHEN ${variantsExist(a)} THEN (
      SELECT COALESCE(SUM(il.quantity), 0) FROM inventory_levels il
      WHERE il.product_id = ${a}.id AND il.variant_id IS NOT NULL AND il.deleted_at IS NULL)
    ELSE COALESCE((
      SELECT il.quantity FROM inventory_levels il
      WHERE il.product_id = ${a}.id AND il.variant_id IS NULL AND il.deleted_at IS NULL LIMIT 1), 0)
  END)`
}

export function costExpr(a = 'p'): string {
  return `(CASE
    WHEN ${variantsExist(a)} THEN (
      SELECT AVG(COALESCE(pv.cost_price_override, ${a}.cost_price)) FROM product_variants pv
      WHERE pv.product_id = ${a}.id AND pv.deleted_at IS NULL)
    ELSE ${a}.cost_price
  END)`
}

export function priceExpr(a = 'p'): string {
  return `(CASE
    WHEN ${variantsExist(a)} THEN (
      SELECT AVG(COALESCE(pv.price_override, ${a}.price)) FROM product_variants pv
      WHERE pv.product_id = ${a}.id AND pv.deleted_at IS NULL)
    ELSE ${a}.price
  END)`
}

/**
 * Displayed selling price for a product card: for a variant product, the LOWEST variant
 * effective price (a "from X" price); otherwise the product's own price.
 */
export function displayPriceExpr(a = 'p'): string {
  return `(CASE
    WHEN ${variantsExist(a)} THEN (
      SELECT MIN(COALESCE(pv.price_override, ${a}.price)) FROM product_variants pv
      WHERE pv.product_id = ${a}.id AND pv.deleted_at IS NULL)
    ELSE ${a}.price
  END)`
}

/** A live variant's on-hand stock (`pv` alias): its IN_STOCK units for a serialized product,
 * else its inventory level. */
function variantStockExpr(a: string): string {
  return `(CASE WHEN ${a}.is_serialized THEN (
      SELECT COUNT(*) FROM product_serial_units su
      WHERE su.variant_id = pv.id AND su.deleted_at IS NULL AND su.status = 'IN_STOCK')
    ELSE COALESCE((SELECT il.quantity FROM inventory_levels il
      WHERE il.variant_id = pv.id AND il.deleted_at IS NULL LIMIT 1), 0) END)`
}

function levelColumn(
  column: 'reorder_point' | 'low_stock_threshold',
  variant: string | null,
  a: string,
) {
  return variant
    ? `(SELECT il.${column} FROM inventory_levels il WHERE il.variant_id = ${variant} AND il.deleted_at IS NULL LIMIT 1)`
    : `(SELECT il.${column} FROM inventory_levels il WHERE il.product_id = ${a}.id AND il.variant_id IS NULL AND il.deleted_at IS NULL LIMIT 1)`
}

/**
 * Where a product's stock stands, 'OUT' | 'LOW' | 'IN' (@biztrack/domain productStockStatus,
 * the till's STOCK_STATUS_EXPR): its own thresholds, or, for a product with variants, low as
 * soon as one variant is out or low by its own thresholds.
 */
export function stockStatusExpr(a = 'p'): string {
  return productStockStatusSql({
    stock: stockExpr(a),
    reorderPoint: levelColumn('reorder_point', null, a),
    lowStockThreshold: levelColumn('low_stock_threshold', null, a),
    hasVariants: variantsExist(a),
    anyVariantShort: `EXISTS (SELECT 1 FROM product_variants pv
      WHERE pv.product_id = ${a}.id AND pv.deleted_at IS NULL
        AND ${stockStatusSql(
          variantStockExpr(a),
          levelColumn('reorder_point', 'pv.id', a),
          levelColumn('low_stock_threshold', 'pv.id', a),
        )} <> 'IN')`,
  })
}

/**
 * The level a product is reordered towards: its reorder point, else its low-stock threshold
 * (the threshold @biztrack/domain stockStatus uses); for a product with variants, the sum of
 * its variants' (as the till's reorder suggestions).
 */
export function reorderTargetExpr(a = 'p'): string {
  return `(CASE WHEN ${variantsExist(a)} THEN (
      SELECT COALESCE(SUM(COALESCE(${levelColumn('reorder_point', 'pv.id', a)}, ${levelColumn('low_stock_threshold', 'pv.id', a)}, 0)), 0)
      FROM product_variants pv WHERE pv.product_id = ${a}.id AND pv.deleted_at IS NULL)
    ELSE COALESCE(${levelColumn('reorder_point', null, a)}, ${levelColumn('low_stock_threshold', null, a)}, 0) END)`
}

/** The list filter value ('in' | 'low' | 'out') as a SQL condition on stockStatusExpr. */
export function stockStatusWhere(status: 'in' | 'low' | 'out', a = 'p'): string {
  return `${stockStatusExpr(a)} = '${status.toUpperCase()}'`
}

export interface ProductStats {
  totalSkus: number
  categories: number
  catalogValueCost: number
  retailValue: number
  blendedMarginPct: number
  lowStock: number
  outOfStock: number
}

export interface InventoryStats {
  trackedSkus: number
  unitsOnHand: number
  stockValueCost: number
  lowStock: number
  outOfStock: number
}
