import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  AdjustStockInput,
  DeadStockRow,
  InventoryListQuery,
  InventoryStats,
  InventoryTurnoverRow,
  LocalInventoryItem,
  LocalReorderSuggestion,
  LocalStockMovement,
  MovementsQuery,
  PaginatedResult,
  RestockInput,
  SerialType,
  StockMovementType,
  SupplierPriceRow,
  ThresholdInput,
} from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'
import { COST_EXPR, STOCK_EXPR, effectiveStock, recordStockMovement } from './stock-ledger'
import type { AuditLogger } from './audit.service'
import type { ProductsService } from './products.service'
import type { DebtsService } from './debts.service'
import type { PurchaseOrderService } from './purchase-order.service'

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

interface AllMovementRow extends MovementRow {
  product_id: string
  product_name: string | null
}

interface ProductMeta {
  name: string
  trackInventory: boolean
  isSerialized: boolean
  serialType: SerialType | null
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
    private readonly products: ProductsService,
    private readonly debts: DebtsService,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly audit?: AuditLogger,
  ) {}

  /** Tracked products with stock levels + thresholds (paginated). */
  list(query: InventoryListQuery = {}): PaginatedResult<LocalInventoryItem> {
    const businessId = this.getBusinessId()
    if (!businessId)
      return toPaginated<LocalInventoryItem>([], { total: 0, page: 1, limit: 20, totalPages: 1 })

    let where = 'p.business_id = ? AND p.is_deleted = 0 AND p.track_inventory = 1'
    const params: unknown[] = [businessId]
    if (query.categoryId) {
      where += ' AND p.category_id = ?'
      params.push(query.categoryId)
    }
    if (query.stockStatus && query.stockStatus !== 'all') {
      if (query.stockStatus === 'out') where += ` AND ${STOCK_EXPR} <= 0`
      else if (query.stockStatus === 'low')
        where += ` AND ${STOCK_EXPR} > 0 AND ${INV_THRESHOLD} > 0 AND ${STOCK_EXPR} <= ${INV_THRESHOLD}`
      else if (query.stockStatus === 'in')
        where += ` AND ${STOCK_EXPR} > 0 AND (${INV_THRESHOLD} = 0 OR ${STOCK_EXPR} > ${INV_THRESHOLD})`
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
    const empty: InventoryStats = {
      trackedSkus: 0,
      unitsOnHand: 0,
      stockValueCost: 0,
      lowStock: 0,
      outOfStock: 0,
    }
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

  /** Products at/below their reorder threshold, with a suggested restock qty.
   * Drives the "needs reordering" banner + the Generate-PO (auto-filled restock).
   * Covers all product types (matching the API's low-stock alerts):
   *  - simple / serialized → the product's effective stock vs its product-level threshold
   *  - variant             → flagged when ANY variant is out of stock or at/below its own
   *                          threshold; the shown target is the sum of the variants' thresholds. */
  reorderSuggestions(): LocalReorderSuggestion[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const hasVariants = `EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_deleted = 0)`
    // A single variant is low when it's out of stock, or at/below its own threshold (when set).
    const variantLow = `pv.stock_quantity <= 0 OR (COALESCE(pv.low_stock_threshold, 0) > 0 AND pv.stock_quantity <= COALESCE(pv.low_stock_threshold, 0))`
    const anyVariantLow = `EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_deleted = 0 AND (${variantLow}))`
    // Displayed reorder point: sum of the variants' thresholds for variant products, else the product-level threshold.
    const targetExpr = `CASE WHEN ${hasVariants}
        THEN (SELECT COALESCE(SUM(COALESCE(pv.low_stock_threshold, 0)), 0) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_deleted = 0)
        ELSE ${INV_THRESHOLD} END`
    const rows = this.db.query<{
      id: string
      name: string
      sku: string | null
      cost_price: number | null
      currency: string | null
      stock: number | null
      target: number | null
    }>(
      `SELECT p.id, p.name, p.sku, p.cost_price, p.currency, ${STOCK_EXPR} AS stock, (${targetExpr}) AS target
       FROM products p
       WHERE p.business_id = ? AND p.is_deleted = 0 AND p.track_inventory = 1
         AND (
           (${hasVariants} AND ${anyVariantLow})
           OR (NOT ${hasVariants} AND (${STOCK_EXPR} <= 0 OR (${INV_THRESHOLD} > 0 AND ${STOCK_EXPR} <= ${INV_THRESHOLD})))
         )
       ORDER BY ${STOCK_EXPR} ASC`,
      [businessId],
    )
    return rows.map((r) => {
      const stock = Math.max(0, r.stock ?? 0)
      const target = r.target ?? 0
      // Restock to a par level of 2× the reorder point so the order actually clears
      // the alert (restocking to exactly the reorder point leaves it still flagged).
      const suggestedQty = target > 0 ? Math.max(target * 2 - stock, 1) : 1
      return {
        productId: r.id,
        name: r.name,
        sku: r.sku,
        currentStock: stock,
        target,
        suggestedQty,
        unitCost: r.cost_price ?? null,
        currency: r.currency ?? 'XAF',
      }
    })
  }

  /** Manually adjust stock. Direct products adjust the product's own stock; passing a
   * variantId adjusts that (non-serialized) variant's stock. Serialized stock is changed
   * by adding/removing serial units, not here. */
  adjust(productId: string, input: AdjustStockInput): void {
    const businessId = this.requireBusinessId()
    const meta = this.requireProduct(productId, businessId)
    if (!meta.trackInventory) throw new Error('This product does not track stock.')

    const notes = input.notes.trim()
    if (notes.length < 3) throw new Error('A reason (at least 3 characters) is required.')
    if (!Number.isFinite(input.quantity)) throw new Error('Quantity is invalid.')
    if ((input.type === 'ADD' || input.type === 'REMOVE') && input.quantity <= 0)
      throw new Error('Quantity must be greater than 0.')
    if (input.type === 'SET' && input.quantity < 0) throw new Error('Quantity cannot be negative.')

    const variantId = input.variantId ?? null
    if (variantId) {
      this.adjustVariant(businessId, productId, meta, variantId, input, notes)
      return
    }
    if (meta.isSerialized || meta.hasVariants) {
      throw new Error(
        'Adjust applies to direct products only; manage variant/serial stock from their panels.',
      )
    }

    const current = meta.stock
    const next =
      input.type === 'ADD'
        ? current + input.quantity
        : input.type === 'REMOVE'
          ? current - input.quantity
          : input.quantity
    if (next < 0) throw new Error('Not enough stock for this adjustment.')

    const change = next - current
    if (change === 0) return // no-op (e.g. SET to the current value)

    const now = new Date().toISOString()
    this.db.run(
      `UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ? AND business_id = ?`,
      [next, now, productId, businessId],
    )
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
    this.enqueue(
      'inventoryAdjustments',
      movementId,
      businessId,
      { productId, type: input.type, quantity: input.quantity, notes, createdAt: now },
      now,
    )
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'inventory',
      entityId: productId,
      entityLabel: meta.name,
      changes: {
        before: { stock: current },
        after: { stock: next, adjust: input.type, quantity: input.quantity, reason: notes },
      },
    })
    this.onMutated()
  }

  /** Adjust a single non-serialized variant's stock (product_variants.stock_quantity),
   * recording a product-level movement referencing the variant so it ties out with the API. */
  private adjustVariant(
    businessId: string,
    productId: string,
    meta: ProductMeta,
    variantId: string,
    input: AdjustStockInput,
    notes: string,
  ): void {
    if (meta.isSerialized) {
      throw new Error('Serialized stock is changed by adding or removing serial units.')
    }
    const variant = this.db.get<{ id: string; name: string; stock_quantity: number }>(
      `SELECT id, name, stock_quantity FROM product_variants WHERE id = ? AND product_id = ? AND business_id = ? AND is_deleted = 0`,
      [variantId, productId, businessId],
    )
    if (!variant) throw new Error('Variant not found.')

    const current = Number(variant.stock_quantity ?? 0)
    const next =
      input.type === 'ADD'
        ? current + input.quantity
        : input.type === 'REMOVE'
          ? current - input.quantity
          : input.quantity
    if (next < 0) throw new Error('Not enough stock for this adjustment.')

    const change = next - current
    if (change === 0) return // no-op

    const now = new Date().toISOString()
    this.db.run(
      `UPDATE product_variants SET stock_quantity = ?, updated_at = ? WHERE id = ? AND business_id = ?`,
      [next, now, variantId, businessId],
    )
    const movementId =
      recordStockMovement(
        this.db,
        businessId,
        productId,
        change,
        {
          referenceType: 'product_variant',
          referenceId: variantId,
          notes,
          type: 'MANUAL_ADJUSTMENT',
        },
        now,
      ) ?? randomUUID()

    this.enqueue(
      'inventoryAdjustments',
      movementId,
      businessId,
      { productId, variantId, type: input.type, quantity: input.quantity, notes, createdAt: now },
      now,
    )
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'inventory',
      entityId: productId,
      entityLabel: `${meta.name} — ${variant.name}`,
      changes: {
        before: { stock: current },
        after: { stock: next, adjust: input.type, quantity: input.quantity, reason: notes },
      },
    })
    this.onMutated()
  }

  /**
   * Restock (a goods receipt that adds stock). Handles direct, variant and serialized
   * products; optionally fulfils a purchase order and/or is on supplier credit. Each
   * item adds stock the right way (product qty / variant qty / new serial units),
   * records a RESTOCK_IN movement, and links the restock record. A PO link updates
   * received quantities + status; credit (amountPaid < total) creates a supplier payable.
   */
  restock(input: RestockInput): void {
    const businessId = this.requireBusinessId()
    if (!input.items?.length) throw new Error('Add at least one item to restock.')
    const now = new Date().toISOString()
    const restockId = randomUUID()

    type Line =
      | {
          kind: 'direct'
          productId: string
          name: string
          quantity: number
          unitCost: number | null
        }
      | {
          kind: 'variant'
          productId: string
          name: string
          variantId: string
          quantity: number
          unitCost: number | null
        }
      | {
          kind: 'serial'
          productId: string
          name: string
          variantId: string | null
          serialType: SerialType
          serials: string[]
          quantity: number
          unitCost: number | null
        }

    // Validate + classify everything before writing.
    const lines: Line[] = input.items.map((item) => {
      const meta = this.requireProduct(item.productId, businessId)
      if (!meta.trackInventory) throw new Error(`“${meta.name}” does not track stock.`)
      const unitCost =
        item.unitCost != null && Number.isFinite(item.unitCost) && item.unitCost >= 0
          ? item.unitCost
          : null
      if (meta.isSerialized) {
        const serials = (item.serialNumbers ?? []).map((s) => s.trim()).filter(Boolean)
        if (serials.length === 0)
          throw new Error(`Add the serial numbers received for “${meta.name}”.`)
        return {
          kind: 'serial',
          productId: item.productId,
          name: meta.name,
          variantId: item.variantId ?? null,
          serialType: meta.serialType ?? 'SERIAL_NUMBER',
          serials,
          quantity: serials.length,
          unitCost,
        }
      }
      const qty = item.quantity ?? 0
      if (!Number.isFinite(qty) || qty <= 0)
        throw new Error(`Quantity for “${meta.name}” must be greater than 0.`)
      if (meta.hasVariants) {
        if (!item.variantId) throw new Error(`Select a variant for “${meta.name}”.`)
        const variant = this.db.get<{ id: string }>(
          `SELECT id FROM product_variants WHERE id = ? AND product_id = ? AND is_deleted = 0`,
          [item.variantId, item.productId],
        )
        if (!variant) throw new Error(`Variant not found for “${meta.name}”.`)
        return {
          kind: 'variant',
          productId: item.productId,
          name: meta.name,
          variantId: item.variantId,
          quantity: qty,
          unitCost,
        }
      }
      return { kind: 'direct', productId: item.productId, name: meta.name, quantity: qty, unitCost }
    })

    // Settlement: goods subtotal − discounts + charges = invoice total, settled by payments.
    const subtotal = round2(lines.reduce((sum, l) => sum + l.quantity * (l.unitCost ?? 0), 0))
    const discountLines = (input.discounts ?? []).map((d) => ({
      ...d,
      id: d.id ?? randomUUID(),
      amount: round2(Math.max(0, d.amount)),
    }))
    const chargeLines = (input.charges ?? []).map((c) => ({
      ...c,
      id: c.id ?? randomUUID(),
      amount: round2(Math.max(0, c.amount)),
    }))
    const discountAmount = round2(discountLines.reduce((s, d) => s + d.amount, 0))
    const chargesAmount = round2(chargeLines.reduce((s, c) => s + c.amount, 0))
    const totalAmount = round2(Math.max(0, subtotal - discountAmount + chargesAmount))

    const paymentLines = (input.payments ?? []).filter(
      (p) => Number.isFinite(p.amount) && p.amount > 0,
    )
    const amountPaid =
      input.payments != null
        ? round2(paymentLines.reduce((s, p) => s + p.amount, 0))
        : input.amountPaid != null && Number.isFinite(input.amountPaid)
          ? Math.max(0, Math.min(input.amountPaid, totalAmount))
          : totalAmount
    const creditAmount = round2(Math.max(0, totalAmount - amountPaid))
    if (creditAmount > 0 && !input.supplierId)
      throw new Error('Select a supplier for a restock on credit.')
    const invoiceFileUrl = input.invoiceFileUrl?.trim() || null
    if (creditAmount > 0 && !invoiceFileUrl)
      throw new Error('Attach the supplier invoice for a receipt on credit.')

    const reference = input.reference?.trim() || null
    const notes = input.notes?.trim() || null
    const invoiceNumber = input.invoiceNumber?.trim() || null
    const invoiceDate = input.invoiceDate?.trim() || null
    const supplierName = input.supplierId
      ? (this.db.get<{ name: string }>(`SELECT name FROM contacts WHERE id = ?`, [input.supplierId])
          ?.name ?? null)
      : null
    const movementNote = reference ? `Restock ${reference}` : 'Restock'

    this.db.run(
      `INSERT INTO restock_records (id, business_id, reference_number, supplier_id, supplier_name, purchase_order_id, total_amount, total_cost, discount_amount, charges_amount, amount_paid, credit_amount, invoice_number, invoice_date, invoice_file_url, notes, performed_by_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        restockId,
        businessId,
        reference,
        input.supplierId ?? null,
        supplierName,
        input.purchaseOrderId ?? null,
        totalAmount,
        subtotal,
        discountAmount,
        chargesAmount,
        amountPaid,
        creditAmount,
        invoiceNumber,
        invoiceDate,
        invoiceFileUrl,
        notes,
        now,
      ],
    )

    // Settlement children (charges, discounts, split payments).
    for (const c of chargeLines) {
      this.db.run(
        `INSERT INTO restock_charges (id, restock_record_id, business_id, charge_type_id, name, rate_type, rate_value, amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c.id,
          restockId,
          businessId,
          c.chargeTypeId ?? null,
          c.name,
          c.rateType,
          c.rateValue,
          c.amount,
          now,
        ],
      )
    }
    for (const d of discountLines) {
      this.db.run(
        `INSERT INTO restock_discounts (id, restock_record_id, business_id, description, discount_type, rate, amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.id, restockId, businessId, d.description, d.discountType, d.rate ?? null, d.amount, now],
      )
    }
    for (const p of paymentLines) {
      this.db.run(
        `INSERT INTO restock_payments (id, restock_record_id, business_id, method, amount, mobile_money_reference, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          restockId,
          businessId,
          p.method,
          round2(p.amount),
          p.mobileMoneyReference ?? null,
          now,
        ],
      )
    }

    const syncItems: Array<{
      id: string
      productId: string
      variantId?: string | null
      quantity: number
      unitCost?: number
      movementId: string
    }> = []
    const receipts: Array<{ productId: string; variantId: string | null; quantity: number }> = []

    for (const line of lines) {
      let movementId: string
      if (line.kind === 'serial') {
        // Reuse the serial-add path: inserts in-stock units (stable ids), enqueues
        // product_serial_unit events, and records a stock movement.
        this.products.addSerialUnits(
          line.productId,
          line.serials.map((sn) => ({
            serialNumber: sn,
            serialType: line.serialType,
            variantId: line.variantId,
          })),
          movementNote,
          'RESTOCK_IN',
        )
        movementId = randomUUID()
      } else if (line.kind === 'variant') {
        this.db.run(
          `UPDATE product_variants SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?`,
          [line.quantity, now, line.variantId],
        )
        movementId =
          recordStockMovement(
            this.db,
            businessId,
            line.productId,
            line.quantity,
            {
              referenceType: 'restock',
              referenceId: restockId,
              notes: movementNote,
              type: 'RESTOCK_IN',
            },
            now,
          ) ?? randomUUID()
      } else {
        this.db.run(
          `UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ? AND business_id = ?`,
          [line.quantity, now, line.productId, businessId],
        )
        movementId =
          recordStockMovement(
            this.db,
            businessId,
            line.productId,
            line.quantity,
            {
              referenceType: 'restock',
              referenceId: restockId,
              notes: movementNote,
              type: 'RESTOCK_IN',
            },
            now,
          ) ?? randomUUID()
      }
      const variantId = line.kind === 'direct' ? null : line.variantId
      this.db.run(
        `INSERT INTO restock_items (id, restock_record_id, product_id, variant_id, quantity, unit_cost, new_quantity, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          restockId,
          line.productId,
          variantId,
          line.quantity,
          line.unitCost,
          effectiveStock(this.db, line.productId),
          now,
        ],
      )
      const itemId = randomUUID()
      syncItems.push({
        id: itemId,
        productId: line.productId,
        ...(variantId ? { variantId } : {}),
        quantity: line.quantity,
        ...(line.unitCost != null ? { unitCost: line.unitCost } : {}),
        movementId,
      })
      receipts.push({ productId: line.productId, variantId, quantity: line.quantity })
    }

    this.enqueue(
      'inventoryRestocks',
      restockId,
      businessId,
      {
        referenceNumber: reference,
        supplierId: input.supplierId ?? null,
        supplierName,
        purchaseOrderId: input.purchaseOrderId ?? null,
        subtotalAmount: subtotal,
        discountAmount,
        chargesAmount,
        totalAmount,
        totalCost: subtotal,
        amountPaid,
        invoiceNumber,
        invoiceDate,
        invoiceFileUrl,
        notes,
        createdAt: now,
        payments: paymentLines.map((p) => ({
          method: p.method,
          amount: round2(p.amount),
          ...(p.mobileMoneyReference ? { mobileMoneyReference: p.mobileMoneyReference } : {}),
        })),
        charges: chargeLines.map((c) => ({
          id: c.id,
          chargeTypeId: c.chargeTypeId ?? null,
          name: c.name,
          rateType: c.rateType,
          rateValue: c.rateValue,
          amount: c.amount,
        })),
        discounts: discountLines.map((d) => ({
          id: d.id,
          description: d.description,
          discountType: d.discountType,
          rate: d.rate ?? null,
          amount: d.amount,
        })),
        items: syncItems,
      },
      now,
    )

    // Credit → a supplier payable (idempotent per restock source).
    if (creditAmount > 0 && input.supplierId) {
      this.debts.createSourceDebt({
        contactId: input.supplierId,
        direction: 'PAYABLE',
        sourceType: 'RESTOCK',
        sourceId: restockId,
        sourceReference: reference ?? restockId,
        originalAmount: creditAmount,
        notes,
        createdAt: now,
      })
    }

    // Fulfil the PO: bump received quantities + status.
    if (input.purchaseOrderId) this.purchaseOrders.applyReceipt(input.purchaseOrderId, receipts)

    this.audit?.log({
      action: 'CREATE',
      entityType: 'restock',
      entityId: restockId,
      entityLabel: reference ?? `${lines.length} item(s)`,
      changes: {
        before: null,
        after: {
          items: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitCost: l.unitCost,
          })),
          subtotal,
          discountAmount,
          chargesAmount,
          totalAmount,
          amountPaid,
          creditAmount,
          purchaseOrderId: input.purchaseOrderId ?? null,
        },
      },
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
    this.enqueue(
      'inventoryThresholds',
      productId,
      businessId,
      { productId, lowStockThreshold: low, reorderPoint: reorder },
      now,
    )
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
  listMovements(
    productId: string,
    query: MovementsQuery = {},
  ): PaginatedResult<LocalStockMovement> {
    const businessId = this.getBusinessId()
    if (!businessId)
      return toPaginated<LocalStockMovement>([], { total: 0, page: 1, limit: 20, totalPages: 1 })

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

  /**
   * Paginated stock-movement ledger across ALL products (for the Stock Movements report).
   * Mirrors the API InventoryService.getAllMovements (same filters: type, dateFrom, dateTo;
   * newest first) and joins the product name so a fully-synced desktop and the cloud produce
   * the same report.
   */
  listAllMovements(query: MovementsQuery = {}): PaginatedResult<LocalStockMovement> {
    const businessId = this.getBusinessId()
    if (!businessId)
      return toPaginated<LocalStockMovement>([], { total: 0, page: 1, limit: 20, totalPages: 1 })

    let where = 'm.business_id = ?'
    const params: unknown[] = [businessId]
    if (query.type) {
      where += ' AND m.type = ?'
      params.push(query.type)
    }
    if (query.dateFrom) {
      where += ' AND m.created_at >= ?'
      params.push(query.dateFrom)
    }
    if (query.dateTo) {
      where += ' AND m.created_at <= ?'
      params.push(query.dateTo)
    }

    const { rows, ...meta } = paginateRows<AllMovementRow>(
      this.db,
      {
        from: 'inventory_movements m LEFT JOIN products p ON p.id = m.product_id',
        columns:
          'm.id, m.product_id, p.name AS product_name, m.type, m.quantity_change, m.quantity_before, m.quantity_after, m.reference_type, m.reference_id, m.notes, m.performed_by_name, m.created_at',
        where,
        params,
        searchColumns: ['m.notes', 'p.name'],
        defaultSort: 'm.created_at DESC, m.rowid DESC',
        sortMap: { createdAt: 'm.created_at', type: 'm.type' },
      },
      query,
    )
    return toPaginated(
      rows.map((r) => ({
        id: r.id,
        productId: r.product_id,
        productName: r.product_name,
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

  /**
   * Inventory turnover (current stock value at cost + annualised COGS) per tracked, in-stock
   * product. Same two aggregations + merge as the API getInventoryTurnover (STOCK_EXPR/COST_EXPR
   * mirror the API stock/cost expressions) so both tie out once synced.
   */
  turnover(query: MovementsQuery = {}): InventoryTurnoverRow[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const stockRows = this.db.query<{ productId: string; name: string; avgStockCost: number }>(
      `SELECT p.id AS productId, p.name AS name, COALESCE(${COST_EXPR}, 0) * ${STOCK_EXPR} AS avgStockCost
       FROM products p
       WHERE p.business_id = ? AND p.is_deleted = 0 AND p.track_inventory = 1 AND ${STOCK_EXPR} > 0`,
      [businessId],
    )
    const conds = [
      's.business_id = ?',
      's.is_deleted = 0',
      "s.status = 'COMPLETED'",
      'si.is_deleted = 0',
    ]
    const params: unknown[] = [businessId]
    if (query.dateFrom) {
      conds.push('s.sale_date >= ?')
      params.push(query.dateFrom)
    }
    if (query.dateTo) {
      conds.push('s.sale_date <= ?')
      params.push(query.dateTo)
    }
    const cogsRows = this.db.query<{ productId: string; cogs: number }>(
      `SELECT si.product_id AS productId, COALESCE(SUM(COALESCE(si.cost_price, 0) * si.quantity), 0) AS cogs
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE ${conds.join(' AND ')}
       GROUP BY si.product_id`,
      params,
    )
    const cogsById = new Map(cogsRows.map((r) => [r.productId, Number(r.cogs ?? 0)]))
    const factor = annualiseFactor(query.dateFrom, query.dateTo)
    return stockRows
      .map((r) => ({
        productId: r.productId,
        name: r.name,
        avgStockCost: round2(Number(r.avgStockCost ?? 0)),
        annualCogs: round2((cogsById.get(r.productId) ?? 0) * factor),
      }))
      .sort((a, b) => b.avgStockCost - a.avgStockCost)
  }

  /**
   * Dead / slow-moving stock: tracked in-stock products with no completed sale in 60+ days (or
   * never). Mirrors the API getDeadStock (last-sale via MAX(sold_at); days computed in JS).
   */
  deadStock(): { rows: DeadStockRow[]; stockCostTotal: number } {
    const businessId = this.getBusinessId()
    if (!businessId) return { rows: [], stockCostTotal: 0 }
    const stockRows = this.db.query<{
      productId: string
      name: string
      sku: string | null
      qty: number
      costValue: number
    }>(
      `SELECT p.id AS productId, p.name AS name, p.sku AS sku,
              ${STOCK_EXPR} AS qty, COALESCE(${COST_EXPR}, 0) * ${STOCK_EXPR} AS costValue
       FROM products p
       WHERE p.business_id = ? AND p.is_deleted = 0 AND p.track_inventory = 1 AND ${STOCK_EXPR} > 0`,
      [businessId],
    )
    const lastRows = this.db.query<{ productId: string; lastSoldAt: string | null }>(
      `SELECT si.product_id AS productId, MAX(s.sold_at) AS lastSoldAt
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE s.business_id = ? AND s.is_deleted = 0 AND s.status = 'COMPLETED'
       GROUP BY si.product_id`,
      [businessId],
    )
    const lastById = new Map(lastRows.map((r) => [r.productId, r.lastSoldAt]))
    const stockCostTotal = round2(stockRows.reduce((s, r) => s + Number(r.costValue ?? 0), 0))
    const rows = stockRows
      .map((r) => ({
        productId: r.productId,
        name: r.name,
        sku: r.sku ?? null,
        quantity: Number(r.qty ?? 0),
        costValue: round2(Number(r.costValue ?? 0)),
        daysSinceLastSale: daysSince(lastById.get(r.productId) ?? null),
      }))
      .filter((r) => r.daysSinceLastSale === null || r.daysSinceLastSale >= 60)
    return { rows, stockCostTotal }
  }

  /**
   * Supplier price trend: restock unit cost most recently / ~3mo / ~6mo per product + latest
   * supplier. Same fetch + JS bucketing as the API getSupplierPriceTrend.
   */
  supplierPriceTrend(): SupplierPriceRow[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const rows = this.db.query<{
      productId: string
      name: string
      supplier: string | null
      unitCost: number | null
      createdAt: string
    }>(
      `SELECT ri.product_id AS productId, p.name AS name, rr.supplier_name AS supplier,
              ri.unit_cost AS unitCost, rr.created_at AS createdAt
       FROM restock_items ri
         JOIN restock_records rr ON rr.id = ri.restock_record_id
         JOIN products p ON p.id = ri.product_id
       WHERE rr.business_id = ? AND ri.unit_cost IS NOT NULL
       ORDER BY rr.created_at ASC`,
      [businessId],
    )
    return bucketSupplierPrices(rows)
  }

  // ---- internals -----------------------------------------------------------

  private requireProduct(productId: string, businessId: string): ProductMeta {
    const row = this.db.get<{
      name: string
      track_inventory: number
      is_serialized: number
      serial_type: string | null
      has_variants: number
      stock: number | null
    }>(
      `SELECT p.name, p.track_inventory, p.is_serialized, p.serial_type,
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
      serialType: (row.serial_type as SerialType | null) ?? null,
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
      [
        randomUUID(),
        entity,
        recordId,
        JSON.stringify({ id: recordId, businessId, ...payload }),
        now,
        now,
      ],
    )
  }
}

function toInventoryItem(r: InventoryRow): LocalInventoryItem {
  const stock = Math.max(0, r.effective_stock ?? 0)
  const threshold = r.reorder_point ?? r.low_stock_threshold ?? 0
  const stockStatus: LocalInventoryItem['stockStatus'] =
    stock <= 0 ? 'out' : threshold > 0 && stock <= threshold ? 'low' : 'in'
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

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

const MS_PER_DAY = 86400000

// ── Report helpers — kept VERBATIM in sync with apps/api inventory.service.ts so the
//    offline (SQLite) and online (API) turnover/dead-stock/supplier-price reports tie out. ──

/** Annualise a period COGS by 365 / periodDays (inclusive). */
function annualiseFactor(dateFrom?: string, dateTo?: string): number {
  if (!dateFrom || !dateTo) return 1
  const days = Math.max(
    1,
    Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / MS_PER_DAY) + 1,
  )
  return 365 / days
}

/** Whole days between a last-sale timestamp and now; null when never sold. */
function daysSince(ts: string | Date | null): number | null {
  if (!ts) return null
  const t = ts instanceof Date ? ts.getTime() : new Date(ts).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / MS_PER_DAY))
}

/** Bucket a product's restock history into current / ~3mo / ~6mo unit cost. */
function bucketSupplierPrices(
  rows: Array<{
    productId: string
    name: string
    supplier: string | null
    unitCost: string | number | null
    createdAt: string | Date
  }>,
): SupplierPriceRow[] {
  const now = Date.now()
  const cut3 = now - 90 * MS_PER_DAY
  const cut6 = now - 180 * MS_PER_DAY
  const byProduct = new Map<
    string,
    { name: string; supplier: string | null; entries: Array<{ cost: number; t: number }> }
  >()
  for (const r of rows) {
    if (r.unitCost === null) continue
    const t = r.createdAt instanceof Date ? r.createdAt.getTime() : new Date(r.createdAt).getTime()
    const cost = Number(r.unitCost)
    if (!Number.isFinite(t) || !Number.isFinite(cost)) continue
    const g = byProduct.get(r.productId) ?? { name: r.name, supplier: r.supplier, entries: [] }
    g.name = r.name
    g.supplier = r.supplier // rows arrive ASC by created_at → last write is the latest supplier
    g.entries.push({ cost, t })
    byProduct.set(r.productId, g)
  }
  const pick = (entries: Array<{ cost: number; t: number }>, before: number): number | null => {
    let best: { cost: number; t: number } | null = null
    for (const e of entries) if (e.t <= before && (!best || e.t > best.t)) best = e
    return best ? round2(best.cost) : null
  }
  const out: SupplierPriceRow[] = []
  for (const [productId, g] of byProduct) {
    const sorted = g.entries.slice().sort((a, b) => a.t - b.t)
    const current = sorted.length ? round2(sorted[sorted.length - 1]!.cost) : null
    out.push({
      productId,
      name: g.name,
      supplier: g.supplier,
      cost6mo: pick(sorted, cut6),
      cost3mo: pick(sorted, cut3),
      current,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function normalizeThreshold(v: number | null): number | null {
  if (v === null || v === undefined || !Number.isFinite(v) || v < 0) return null
  return v
}
