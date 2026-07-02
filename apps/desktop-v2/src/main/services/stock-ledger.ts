import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type { StockMovementType } from '../../shared/ipc'

/**
 * Shared stock-ledger helpers (used by products.service + inventory.service) so
 * there is ONE implementation of effective stock + movement recording.
 *
 * Effective on-hand stock per product (the number the UI shows):
 * - serialized   → count of IN_STOCK serial units
 * - has variants → sum of the variants' stock
 * - otherwise    → the product's own stock_quantity
 * `p` must be the products alias in the surrounding query.
 */
export const STOCK_EXPR = `(CASE
    WHEN p.is_serialized = 1 THEN (
      SELECT COUNT(*) FROM product_serial_units su
      WHERE su.product_id = p.id AND su.is_deleted = 0 AND su.status = 'IN_STOCK')
    WHEN EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_deleted = 0) THEN (
      SELECT COALESCE(SUM(pv.stock_quantity), 0) FROM product_variants pv
      WHERE pv.product_id = p.id AND pv.is_deleted = 0)
    ELSE p.stock_quantity
  END)`

/**
 * Effective selling / cost price for display (the number the UI shows):
 * - has variants → the AVERAGE of the variants' effective prices (override ?? base)
 * - otherwise    → the product's own price / cost_price
 * The product's own p.price / p.cost_price remain the BASE (the inherit default for
 * variants + the edit-form value); these are computed live so they reflect variant
 * price changes immediately. `p` must be the products alias in the surrounding query.
 */
export const PRICE_EXPR = `(CASE
    WHEN EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_deleted = 0) THEN (
      SELECT AVG(COALESCE(pv.price_override, p.price)) FROM product_variants pv
      WHERE pv.product_id = p.id AND pv.is_deleted = 0)
    ELSE p.price
  END)`
export const COST_EXPR = `(CASE
    WHEN EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_deleted = 0) THEN (
      SELECT AVG(COALESCE(pv.cost_price_override, p.cost_price)) FROM product_variants pv
      WHERE pv.product_id = p.id AND pv.is_deleted = 0)
    ELSE p.cost_price
  END)`

/**
 * Displayed selling price for a product card: a variant product shows its LOWEST variant
 * effective price (a "from X" price); otherwise the product's own price. (PRICE_EXPR — the
 * average — is kept for catalog valuation, not card display.)
 */
export const DISPLAY_PRICE_EXPR = `(CASE
    WHEN EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_deleted = 0) THEN (
      SELECT MIN(COALESCE(pv.price_override, p.price)) FROM product_variants pv
      WHERE pv.product_id = p.id AND pv.is_deleted = 0)
    ELSE p.price
  END)`

/** Effective on-hand stock for one product (serial count / variant sum / own qty). */
export function effectiveStock(db: DatabaseService, productId: string): number {
  const row = db.get<{ s: number | null }>(`SELECT ${STOCK_EXPR} AS s FROM products p WHERE p.id = ?`, [productId])
  return Math.max(0, row?.s ?? 0)
}

/** How many movements a product has (used to detect the opening one). */
export function movementCount(db: DatabaseService, businessId: string, productId: string): number {
  return (
    db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM inventory_movements WHERE business_id = ? AND product_id = ?`, [
      businessId,
      productId,
    ])?.n ?? 0
  )
}

/** Upsert the product-level inventory_level row (variant_id NULL) to `qty`. The
 * table has partial-unique indexes (migration 0025), so upsert explicitly. */
export function setInventoryLevel(
  db: DatabaseService,
  businessId: string,
  productId: string,
  qty: number,
  now: string,
): void {
  const level = db.get<{ id: string }>(
    `SELECT id FROM inventory_levels WHERE business_id = ? AND product_id = ? AND variant_id IS NULL LIMIT 1`,
    [businessId, productId],
  )
  if (level) {
    db.run(`UPDATE inventory_levels SET quantity = ?, updated_at = ? WHERE id = ?`, [qty, now, level.id])
  } else {
    db.run(
      `INSERT INTO inventory_levels (id, business_id, product_id, variant_id, quantity, low_stock_threshold, reorder_point, last_restock_at, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, NULL, NULL, NULL, ?, ?)`,
      [randomUUID(), businessId, productId, qty, now, now],
    )
  }
}

/**
 * Record a post-creation stock delta as a movement; the running balance is the
 * product's effective stock after the change. The first-ever positive movement is
 * OPENING_STOCK, everything after is MANUAL_ADJUSTMENT (unless a type is forced,
 * e.g. RESTOCK_IN). Local projection — callers enqueue the matching outbox event
 * separately when the change should sync.
 */
export function recordStockMovement(
  db: DatabaseService,
  businessId: string,
  productId: string,
  change: number,
  opts: { referenceType: string; referenceId: string; notes: string; type?: StockMovementType },
  now: string,
): string | null {
  if (change === 0) return null
  const id = randomUUID()
  const after = effectiveStock(db, productId)
  const before = after - change
  const type: StockMovementType =
    opts.type ?? (change > 0 && movementCount(db, businessId, productId) === 0 ? 'OPENING_STOCK' : 'MANUAL_ADJUSTMENT')
  setInventoryLevel(db, businessId, productId, after, now)
  db.run(
    `INSERT INTO inventory_movements
      (id, business_id, product_id, type, quantity_change, quantity_before, quantity_after,
       reference_type, reference_id, notes, performed_by_id, performed_by_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
    [id, businessId, productId, type, change, before, after, opts.referenceType, opts.referenceId, opts.notes, now],
  )
  return id
}
