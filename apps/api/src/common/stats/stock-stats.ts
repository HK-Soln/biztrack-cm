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

/** Low-stock threshold from the product-level inventory row (reorder ?? low ?? 0). */
export function thresholdExpr(a = 'p'): string {
  return `COALESCE((
    SELECT COALESCE(il.reorder_point, il.low_stock_threshold, 0) FROM inventory_levels il
    WHERE il.product_id = ${a}.id AND il.variant_id IS NULL AND il.deleted_at IS NULL LIMIT 1), 0)`
}

export function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
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
