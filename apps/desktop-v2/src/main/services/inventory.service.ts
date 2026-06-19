import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  AdjustStockInput,
  InventoryListQuery,
  InventoryStats,
  LocalInventoryItem,
  LocalReorderSuggestion,
  LocalStockMovement,
  MovementsQuery,
  PaginatedResult,
  RestockInput,
  StockMovementType,
  ThresholdInput,
} from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'
import { COST_EXPR, STOCK_EXPR, recordStockMovement } from './stock-ledger'
import type { AuditLogger } from './audit.service'

interface MovementRow {
  id: string
  type: string
  quantity_change: number
  quantity_before: number
  quantity_after: number
  reference_type: string | null
  reference_id: string | null
  notes: string | null
  performed_by_name: string | null
  created_at: string
}

interface ProductMeta {
  name: string
  trackInventory: boolean
  isSerialized: boolean
  hasVariants: boolean
  stock: number
}

interface InventoryRow {
  id: string
  name: string
  sku: string | null
  image_url: string | null
  cost_price: number | null
  currency: string | null
  low_stock_threshold: number | null
  reorder_point: number | null
  effective_stock: number | null
  category_name: string | null
  unit_abbr: string | null
  last_restock_at: string | null
}

const INV_FROM = `products p
   LEFT JOIN product_categories c ON c.id = p.category_id
   LEFT JOIN unit_of_measures u ON u.id = p.unit_of_measure_id
   LEFT JOIN inventory_levels il ON il.product_id = p.id AND il.variant_id IS NULL`
const INV_COLS = `p.id, p.name, p.sku, p.image_url, ${COST_EXPR} AS cost_price, p.currency, p.low_stock_threshold, p.reorder_point,
   ${STOCK_EXPR} AS effective_stock, c.name AS category_name, u.abbreviation AS unit_abbr, il.last_restock_at`
const INV_THRESHOLD = 'COALESCE(p.reorder_point, p.low_stock_threshold, 0)'

/**
 * Offline-first inventory operations over the shared stock-ledger. Adjust writes a
 * MANUAL_ADJUSTMENT movement; thresholds write no movement. Both update local SQLite
 * + the sync_outbox (inventoryAdjustments / inventoryThresholds) and audit. Mirrors
 * the API inventory endpoints (POST /:id/adjust, PATCH /:id/threshold, GET /:id/movements).
 */
export class InventoryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly onMutated: () => void,
    private readonly audit?: AuditLogger,
  ) {}

  /** Tracked products with stock levels + thresholds (paginated). */
  list(query: InventoryListQuery = {}): PaginatedResult<LocalInventoryItem> {
    const businessId = this.getBusinessId()
    if (!businessId) return toPaginated<LocalInventoryItem>([], { total: 0, page: 1, limit: 20, totalPages: 1 })

    let where = 'p.business_id = ? AND p.is_deleted = 0 AND p.track_inventory = 1'
    const params: unknown[] = [businessId]
    if (query.categoryId) {
      where += ' AND p.category_id = ?'
      params.push(query.categoryId)
    }
    if (query.stockStatus && query.stockStatus !== 'all') {
      if (query.stockStatus === 'out') where += ` AND ${STOCK_EXPR} <= 0`
      else if (query.stockStatus === 'low') where += ` AND ${STOCK_EXPR} > 0 AND ${INV_THRESHOLD} > 0 AND ${STOCK_EXPR} <= ${INV_THRESHOLD}`
      else if (query.stockStatus === 'in') where += ` AND ${STOCK_EXPR} > 0 AND (${INV_THRESHOLD} = 0 OR ${STOCK_EXPR} > ${INV_THRESHOLD})`
    }

    const { rows, ...meta } = paginateRows<InventoryRow>(
      this.db,
      {
        from: INV_FROM,
        columns: INV_COLS,
        where,
        params,
        searchColumns: ['p.name', 'p.sku', 'p.barcode'],
        defaultSort: 'p.name ASC',
        sortMap: { name: 'p.name', stock: 'effective_stock', updatedAt: 'p.updated_at' },
      },
      query,
    )
    return toPaginated(rows.map(toInventoryItem), meta)
  }

  /** KPI roll-up for the inventory header (tracked products only). */
  stats(): InventoryStats {
    const empty: InventoryStats = { trackedSkus: 0, unitsOnHand: 0, stockValueCost: 0, lowStock: 0, outOfStock: 0 }
    const businessId = this.getBusinessId()
    if (!businessId) return empty
    const row = this.db.get<InventoryStats>(
      `SELECT
         COUNT(*) AS trackedSkus,
         COALESCE(SUM(${STOCK_EXPR}), 0) AS unitsOnHand,
         COALESCE(SUM(COALESCE(${COST_EXPR}, 0) * ${STOCK_EXPR}), 0) AS stockValueCost,
         COALESCE(SUM(CASE WHEN ${STOCK_EXPR} > 0 AND ${INV_THRESHOLD} > 0 AND ${STOCK_EXPR} <= ${INV_THRESHOLD} THEN 1 ELSE 0 END), 0) AS lowStock,
         COALESCE(SUM(CASE WHEN ${STOCK_EXPR} <= 0 THEN 1 ELSE 0 END), 0) AS outOfStock
       FROM products p WHERE p.business_id = ? AND p.is_deleted = 0 AND p.track_inventory = 1`,
      [businessId],
    )
    return row ?? empty
  }

  /** Direct products at/below their reorder threshold, with a suggested restock qty.
   * Drives the "needs reordering" banner + the Generate-PO (auto-filled restock). */
  reorderSuggestions(): LocalReorderSuggestion[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const rows = this.db.query<{
      id: string
      name: string
      sku: string | null
      cost_price: number | null
      currency: string | null
      stock: number | null
      target: number | null
    }>(
      `SELECT p.id, p.name, p.sku, p.cost_price, p.currency, ${STOCK_EXPR} AS stock, ${INV_THRESHOLD} AS target
       FROM products p
       WHERE p.business_id = ? AND p.is_deleted = 0 AND p.track_inventory = 1 AND p.is_serialized = 0
         AND NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_deleted = 0)
         AND (${STOCK_EXPR} <= 0 OR (${INV_THRESHOLD} > 0 AND ${STOCK_EXPR} <= ${INV_THRESHOLD}))
       ORDER BY ${STOCK_EXPR} ASC`,
      [businessId],
    )
    return rows.map((r) => {
      const stock = Math.max(0, r.stock ?? 0)
      const target = r.target ?? 0
      // Restock to a par level of 2× the reorder point so the order actually clears
      // the alert (restocking to exactly the reorder point leaves it still flagged).
      const suggestedQty = target > 0 ? Math.max(target * 2 - stock, 1) : 1
      return { productId: r.id, name: r.name, sku: r.sku, currentStock: stock, target, suggestedQty, unitCost: r.cost_price ?? null, currency: r.currency ?? 'XAF' }
    })
  }

  /** Manually adjust a direct product's stock. Only direct products (no variants,
   * not serialized) — variant/serial stock is changed in their own tables. */
  adjust(productId: string, input: AdjustStockInput): void {
    const businessId = this.requireBusinessId()
    const meta = this.requireProduct(productId, businessId)
    if (!meta.trackInventory) throw new Error('This product does not track stock.')
    if (meta.isSerialized || meta.hasVariants) {
      throw new Error('Adjust applies to direct products only; manage variant/serial stock from their panels.')
    }
    const notes = input.notes.trim()
    if (notes.length < 3) throw new Error('A reason (at least 3 characters) is required.')
    if (!Number.isFinite(input.quantity)) throw new Error('Quantity is invalid.')
    if ((input.type === 'ADD' || input.type === 'REMOVE') && input.quantity <= 0) throw new Error('Quantity must be greater than 0.')
    if (input.type === 'SET' && input.quantity < 0) throw new Error('Quantity cannot be negative.')

    const current = meta.stock
    const next = input.type === 'ADD' ? current + input.quantity : input.type === 'REMOVE' ? current - input.quantity : input.quantity
    if (next < 0) throw new Error('Not enough stock for this adjustment.')

    const change = next - current
    if (change === 0) return // no-op (e.g. SET to the current value)

    const now = new Date().toISOString()
    this.db.run(`UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ? AND business_id = ?`, [
      next,
      now,
      productId,
      businessId,
    ])
    const movementId =
      recordStockMovement(
        this.db,
        businessId,
        productId,
        change,
        { referenceType: 'adjustment', referenceId: productId, notes, type: 'MANUAL_ADJUSTMENT' },
        now,
      ) ?? randomUUID()

    // Sync as an inventory adjustment event (server replays the same delta). record_id
    // = movement id so the server applies it idempotently.
    this.enqueue('inventoryAdjustments', movementId, businessId, { productId, type: input.type, quantity: input.quantity, notes, createdAt: now }, now)
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'inventory',
      entityId: productId,
      entityLabel: meta.name,
      changes: { before: { stock: current }, after: { stock: next, adjust: input.type, quantity: input.quantity, reason: notes } },
    })
    this.onMutated()
  }

  /**
   * Restock (a purchase that adds stock) — cash/cost-only: records a restock with
   * unit costs, adds quantity, and writes a RESTOCK_IN movement per item. Direct
   * products only (serialized → serial panel; variant restock deferred). Supplier
   * credit/payables deferred to issue #83 — restock is treated as fully paid.
   */
  restock(input: RestockInput): void {
    const businessId = this.requireBusinessId()
    if (!input.items?.length) throw new Error('Add at least one item to restock.')
    const now = new Date().toISOString()
    const restockId = randomUUID()

    // Validate everything before writing.
    const lines = input.items.map((item) => {
      const meta = this.requireProduct(item.productId, businessId)
      if (!meta.trackInventory) throw new Error(`“${meta.name}” does not track stock.`)
      if (meta.isSerialized) throw new Error(`Restock “${meta.name}” by adding serial units from its panel.`)
      if (meta.hasVariants) throw new Error(`Per-variant restock for “${meta.name}” is not available yet.`)
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error('Quantity must be greater than 0.')
      const unitCost = item.unitCost != null && Number.isFinite(item.unitCost) && item.unitCost >= 0 ? item.unitCost : null
      return { productId: item.productId, name: meta.name, quantity: item.quantity, unitCost, before: meta.stock }
    })

    const totalCost = lines.reduce((sum, l) => sum + l.quantity * (l.unitCost ?? 0), 0)
    const reference = input.reference?.trim() || null
    const notes = input.notes?.trim() || null

    this.db.run(
      `INSERT INTO restock_records (id, business_id, reference_number, supplier_id, supplier_name, total_amount, total_cost, amount_paid, credit_amount, notes, performed_by_id, created_at)
       VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, 0, ?, NULL, ?)`,
      [restockId, businessId, reference, totalCost, totalCost, totalCost, notes, now],
    )

    const syncItems: Array<{ id: string; productId: string; quantity: number; unitCost?: number; movementId: string }> = []
    for (const line of lines) {
      // Direct product: add to its own quantity, then record the RESTOCK_IN movement.
      this.db.run(`UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ? AND business_id = ?`, [
        line.quantity,
        now,
        line.productId,
        businessId,
      ])
      const movementId =
        recordStockMovement(
          this.db,
          businessId,
          line.productId,
          line.quantity,
          { referenceType: 'restock', referenceId: restockId, notes: reference ? `Restock ${reference}` : 'Restock', type: 'RESTOCK_IN' },
          now,
        ) ?? randomUUID()
      this.db.run(
        `UPDATE inventory_levels SET last_restock_at = ?, updated_at = ? WHERE business_id = ? AND product_id = ? AND variant_id IS NULL`,
        [now, now, businessId, line.productId],
      )
      const itemId = randomUUID()
      this.db.run(
        `INSERT INTO restock_items (id, restock_record_id, product_id, quantity, unit_cost, new_quantity, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [itemId, restockId, line.productId, line.quantity, line.unitCost, line.before + line.quantity, now],
      )
      syncItems.push({ id: itemId, productId: line.productId, quantity: line.quantity, ...(line.unitCost != null ? { unitCost: line.unitCost } : {}), movementId })
    }

    this.enqueue('inventoryRestocks', restockId, businessId, { referenceNumber: reference, supplierId: null, supplierName: null, totalAmount: totalCost, totalCost, notes, createdAt: now, items: syncItems }, now)
    this.audit?.log({
      action: 'CREATE',
      entityType: 'restock',
      entityId: restockId,
      entityLabel: reference ?? `${lines.length} item(s)`,
      changes: { before: null, after: { items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost })), totalCost } },
    })
    this.onMutated()
  }

  /** Set reorder / low-stock thresholds. No movement. */
  setThreshold(productId: string, input: ThresholdInput): void {
    const businessId = this.requireBusinessId()
    const meta = this.requireProduct(productId, businessId)
    const low = normalizeThreshold(input.lowStockThreshold)
    const reorder = normalizeThreshold(input.reorderPoint)
    const now = new Date().toISOString()

    this.db.run(
      `UPDATE products SET low_stock_threshold = ?, reorder_point = ?, updated_at = ? WHERE id = ? AND business_id = ?`,
      [low ?? 0, reorder, now, productId, businessId],
    )
    // Keep the product-level inventory_level thresholds in step.
    this.db.run(
      `UPDATE inventory_levels SET low_stock_threshold = ?, reorder_point = ?, updated_at = ?
       WHERE business_id = ? AND product_id = ? AND variant_id IS NULL`,
      [low, reorder, now, businessId, productId],
    )
    this.enqueue('inventoryThresholds', productId, businessId, { productId, lowStockThreshold: low, reorderPoint: reorder }, now)
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'inventory',
      entityId: productId,
      entityLabel: meta.name,
      changes: { before: null, after: { lowStockThreshold: low, reorderPoint: reorder } },
    })
    this.onMutated()
  }

  /** Paginated stock-movement ledger for a product (newest first). */
  listMovements(productId: string, query: MovementsQuery = {}): PaginatedResult<LocalStockMovement> {
    const businessId = this.getBusinessId()
    if (!businessId) return toPaginated<LocalStockMovement>([], { total: 0, page: 1, limit: 20, totalPages: 1 })

    let where = 'business_id = ? AND product_id = ?'
    const params: unknown[] = [businessId, productId]
    if (query.type) {
      where += ' AND type = ?'
      params.push(query.type)
    }
    if (query.dateFrom) {
      where += ' AND created_at >= ?'
      params.push(query.dateFrom)
    }
    if (query.dateTo) {
      where += ' AND created_at <= ?'
      params.push(query.dateTo)
    }

    const { rows, ...meta } = paginateRows<MovementRow>(
      this.db,
      {
        from: 'inventory_movements',
        columns:
          'id, type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, performed_by_name, created_at',
        where,
        params,
        searchColumns: ['notes'],
        defaultSort: 'created_at DESC, rowid DESC',
        sortMap: { createdAt: 'created_at', type: 'type' },
      },
      query,
    )
    return toPaginated(
      rows.map((r) => ({
        id: r.id,
        type: r.type as StockMovementType,
        quantityChange: r.quantity_change,
        quantityBefore: r.quantity_before,
        quantityAfter: r.quantity_after,
        referenceType: r.reference_type,
        referenceId: r.reference_id,
        notes: r.notes,
        performedByName: r.performed_by_name,
        createdAt: r.created_at,
      })),
      meta,
    )
  }

  // ---- internals -----------------------------------------------------------

  private requireProduct(productId: string, businessId: string): ProductMeta {
    const row = this.db.get<{
      name: string
      track_inventory: number
      is_serialized: number
      has_variants: number
      stock: number | null
    }>(
      `SELECT p.name, p.track_inventory, p.is_serialized,
              EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_deleted = 0) AS has_variants,
              ${STOCK_EXPR} AS stock
       FROM products p WHERE p.id = ? AND p.business_id = ? AND p.is_deleted = 0`,
      [productId, businessId],
    )
    if (!row) throw new Error('Product not found.')
    return {
      name: row.name,
      trackInventory: row.track_inventory === 1,
      isSerialized: row.is_serialized === 1,
      hasVariants: row.has_variants === 1,
      stock: Math.max(0, row.stock ?? 0),
    }
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }

  private enqueue(
    entity: 'inventoryAdjustments' | 'inventoryThresholds' | 'inventoryRestocks',
    recordId: string,
    businessId: string,
    payload: Record<string, unknown>,
    now: string,
  ): void {
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, ?, ?, 'UPSERT', ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), entity, recordId, JSON.stringify({ id: recordId, businessId, ...payload }), now, now],
    )
  }
}

function toInventoryItem(r: InventoryRow): LocalInventoryItem {
  const stock = Math.max(0, r.effective_stock ?? 0)
  const threshold = r.reorder_point ?? r.low_stock_threshold ?? 0
  const stockStatus: LocalInventoryItem['stockStatus'] = stock <= 0 ? 'out' : threshold > 0 && stock <= threshold ? 'low' : 'in'
  return {
    productId: r.id,
    name: r.name,
    sku: r.sku,
    imageUrl: r.image_url,
    categoryName: r.category_name,
    unitAbbr: r.unit_abbr,
    currency: r.currency ?? 'XAF',
    currentStock: stock,
    lowStockThreshold: r.low_stock_threshold,
    reorderPoint: r.reorder_point,
    stockStatus,
    stockValueCost: (r.cost_price ?? 0) * stock,
    lastRestockAt: r.last_restock_at,
  }
}

function normalizeThreshold(v: number | null): number | null {
  if (v === null || v === undefined || !Number.isFinite(v) || v < 0) return null
  return v
}
