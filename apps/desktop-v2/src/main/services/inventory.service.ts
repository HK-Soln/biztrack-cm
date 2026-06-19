import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  AdjustStockInput,
  LocalStockMovement,
  MovementsQuery,
  PaginatedResult,
  StockMovementType,
  ThresholdInput,
} from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'
import { STOCK_EXPR, recordStockMovement } from './stock-ledger'
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
    entity: 'inventoryAdjustments' | 'inventoryThresholds',
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

function normalizeThreshold(v: number | null): number | null {
  if (v === null || v === undefined || !Number.isFinite(v) || v < 0) return null
  return v
}
