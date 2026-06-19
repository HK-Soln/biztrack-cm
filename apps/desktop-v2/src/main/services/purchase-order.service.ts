import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  ConvertRfqToPoRequest,
  CreatePurchaseOrderRequest,
  LocalPurchaseOrderDetail,
  LocalPurchaseOrderItem,
  LocalPurchaseOrderListItem,
  PaginatedResult,
  PurchaseOrderDocument,
  PurchaseOrdersQuery,
} from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'
import type { AuditLogger } from './audit.service'
import type { RfqService } from './rfq.service'

interface PoRow {
  id: string
  number: string
  rfq_id: string | null
  supplier_id: string
  supplier_name: string | null
  title: string | null
  message_body: string | null
  status: string
  currency: string
  expected_date: string | null
  total_amount: number
  sent_at: string | null
  created_at: string
  updated_at: string
}
interface PoListRow extends PoRow {
  item_count: number
  ordered_qty: number
  received_qty: number
}

const COLS = `p.id, p.number, p.rfq_id, p.supplier_id, p.supplier_name, p.title, p.message_body, p.status,
  p.currency, p.expected_date, p.total_amount, p.sent_at, p.created_at, p.updated_at`

/**
 * Offline-first Purchase Orders. A PO is the formal order to one supplier with agreed
 * unit prices; created from scratch or from a chosen RFQ quote. Reads from local SQLite;
 * writes go local + sync_outbox (entity `purchaseOrders` → server `purchase_order`, items
 * nested) and nudge a sync. Sending (PDF + WhatsApp/email) is handled by DocumentService.
 */
export class PurchaseOrderService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly onMutated: () => void,
    private readonly getActorId: () => string | null,
    private readonly rfqs: RfqService,
    private readonly audit?: AuditLogger,
  ) {}

  list(query: PurchaseOrdersQuery = {}): PaginatedResult<LocalPurchaseOrderListItem> {
    const businessId = this.getBusinessId()
    if (!businessId) return toPaginated<LocalPurchaseOrderListItem>([], { total: 0, page: 1, limit: 20, totalPages: 1 })

    let where = 'p.business_id = ? AND p.is_deleted = 0'
    const params: unknown[] = [businessId]
    if (query.status) {
      where += ' AND p.status = ?'
      params.push(query.status)
    }
    if (query.supplierId) {
      where += ' AND p.supplier_id = ?'
      params.push(query.supplierId)
    }
    if (query.rfqId) {
      where += ' AND p.rfq_id = ?'
      params.push(query.rfqId)
    }

    const { rows, ...meta } = paginateRows<PoListRow>(
      this.db,
      {
        from: 'purchase_orders p',
        columns: `${COLS},
          (SELECT COUNT(*) FROM purchase_order_items i WHERE i.purchase_order_id = p.id) AS item_count,
          COALESCE((SELECT SUM(i.quantity) FROM purchase_order_items i WHERE i.purchase_order_id = p.id), 0) AS ordered_qty,
          COALESCE((SELECT SUM(i.received_quantity) FROM purchase_order_items i WHERE i.purchase_order_id = p.id), 0) AS received_qty`,
        where,
        params,
        searchColumns: ['p.number', 'p.title', 'p.supplier_name'],
        defaultSort: 'p.created_at DESC',
        sortMap: { createdAt: 'p.created_at', number: 'p.number' },
      },
      query,
    )
    return toPaginated(
      rows.map((r) => ({
        ...toLocalPo(r),
        itemCount: r.item_count,
        receivedRatio: r.ordered_qty > 0 ? Math.min(1, r.received_qty / r.ordered_qty) : 0,
      })),
      meta,
    )
  }

  get(id: string): LocalPurchaseOrderDetail | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<PoRow>(`SELECT ${COLS} FROM purchase_orders p WHERE p.id = ? AND p.business_id = ? AND p.is_deleted = 0`, [id, businessId])
    if (!row) return null
    return { ...toLocalPo(row), items: this.items(id) }
  }

  create(input: CreatePurchaseOrderRequest): LocalPurchaseOrderDetail {
    const businessId = this.requireBusinessId()
    if (!input.supplierId) throw new Error('Select a supplier.')
    if (!input.items?.length) throw new Error('Add at least one item.')
    const lines = input.items.map((it) => ({
      productId: it.productId,
      variantId: it.variantId ?? null,
      description: it.description?.trim() || this.describeProduct(it.productId, it.variantId ?? null),
      quantity: it.quantity,
      unitPrice: it.unitPrice ?? 0,
    }))
    return this.insert(businessId, {
      rfqId: input.rfqId ?? null,
      supplierId: input.supplierId,
      title: input.title ?? null,
      messageBody: input.messageBody ?? null,
      currency: input.currency || this.businessCurrency(),
      expectedDate: input.expectedDate ?? null,
      lines,
    })
  }

  /** Create a PO from a chosen RFQ supplier quote; marks the RFQ converted. */
  createFromRfq(rfqId: string, input: ConvertRfqToPoRequest): LocalPurchaseOrderDetail {
    const businessId = this.requireBusinessId()
    const rfq = this.db.get<{ currency: string; title: string | null; message_body: string | null }>(
      `SELECT currency, title, message_body FROM rfqs WHERE id = ? AND business_id = ? AND is_deleted = 0`,
      [rfqId, businessId],
    )
    if (!rfq) throw new Error('RFQ not found.')
    const supplier = this.db.get<{ supplier_id: string }>(`SELECT supplier_id FROM rfq_suppliers WHERE id = ? AND rfq_id = ?`, [input.rfqSupplierId, rfqId])
    if (!supplier) throw new Error('Supplier is not on this request.')
    const items = this.db.query<{ id: string; product_id: string; variant_id: string | null; description: string; quantity: number }>(
      `SELECT id, product_id, variant_id, description, quantity FROM rfq_items WHERE rfq_id = ? ORDER BY created_at ASC`,
      [rfqId],
    )
    if (!items.length) throw new Error('This request has no items.')

    const lines = items.map((it) => ({
      productId: it.product_id,
      variantId: it.variant_id,
      description: it.description,
      quantity: it.quantity,
      unitPrice: input.unitPrices?.[it.id] ?? 0,
    }))
    const po = this.insert(businessId, {
      rfqId,
      supplierId: supplier.supplier_id,
      title: rfq.title,
      messageBody: rfq.message_body,
      currency: rfq.currency,
      expectedDate: input.expectedDate ?? null,
      lines,
    })
    this.rfqs.markConverted(rfqId)
    return po
  }

  /** Flip the PO to SENT (called after the share composer opens). */
  markSent(poId: string): LocalPurchaseOrderDetail {
    const businessId = this.requireBusinessId()
    const po = this.get(poId)
    if (!po) throw new Error('Purchase order not found.')
    const now = new Date().toISOString()
    this.db.run(`UPDATE purchase_orders SET status = CASE WHEN status = 'DRAFT' THEN 'SENT' ELSE status END, sent_at = ?, updated_at = ? WHERE id = ? AND business_id = ?`, [now, now, poId, businessId])
    this.enqueue(poId, businessId, now)
    this.onMutated()
    this.audit?.log({ action: 'UPDATE', entityType: 'purchase_order', entityId: poId, entityLabel: po.number, changes: { before: { status: po.status }, after: { status: 'SENT' } } })
    return this.get(poId)!
  }

  cancel(poId: string): LocalPurchaseOrderDetail {
    const businessId = this.requireBusinessId()
    const po = this.get(poId)
    if (!po) throw new Error('Purchase order not found.')
    if (po.status === 'RECEIVED' || po.status === 'PARTIALLY_RECEIVED') throw new Error('A received purchase order cannot be cancelled.')
    const now = new Date().toISOString()
    this.db.run(`UPDATE purchase_orders SET status = 'CANCELLED', updated_at = ? WHERE id = ? AND business_id = ?`, [now, poId, businessId])
    this.enqueue(poId, businessId, now)
    this.onMutated()
    this.audit?.log({ action: 'UPDATE', entityType: 'purchase_order', entityId: poId, entityLabel: po.number, changes: { before: { status: po.status }, after: { status: 'CANCELLED' } } })
    return this.get(poId)!
  }

  buildDocument(poId: string): PurchaseOrderDocument {
    const businessId = this.requireBusinessId()
    const po = this.db.get<PoRow>(`SELECT ${COLS} FROM purchase_orders p WHERE p.id = ? AND p.business_id = ?`, [poId, businessId])
    if (!po) throw new Error('Purchase order not found.')
    const biz = this.db.get<{ name: string; phone: string | null; email: string | null; address: string | null; logo_url: string | null }>(
      `SELECT name, phone, email, address, logo_url FROM local_businesses WHERE id = ?`,
      [businessId],
    )
    const supplier = this.db.get<{ name: string; phone: string | null; address: string | null }>(
      `SELECT name, phone, address FROM contacts WHERE id = ? AND business_id = ?`,
      [po.supplier_id, businessId],
    )
    const items = this.db.query<{ description: string; quantity: number; unit_price: number; sku: string | null }>(
      `SELECT i.description, i.quantity, i.unit_price, pr.sku FROM purchase_order_items i LEFT JOIN products pr ON pr.id = i.product_id WHERE i.purchase_order_id = ? ORDER BY i.created_at ASC`,
      [poId],
    )
    const docItems = items.map((i) => ({ description: i.description, sku: i.sku, quantity: i.quantity, unitPrice: i.unit_price, lineTotal: i.quantity * i.unit_price }))
    const subtotal = docItems.reduce((s, i) => s + i.lineTotal, 0)
    return {
      number: po.number,
      title: po.title,
      status: po.status as PurchaseOrderDocument['status'],
      issuedDate: new Date(po.created_at).toLocaleDateString(),
      expectedDate: po.expected_date ? new Date(po.expected_date).toLocaleDateString() : null,
      currency: po.currency,
      business: { name: biz?.name ?? 'BizTrack', phone: biz?.phone, email: biz?.email, address: biz?.address, logoUrl: biz?.logo_url },
      supplier: { name: supplier?.name ?? po.supplier_name ?? '', phone: supplier?.phone, email: null, address: supplier?.address },
      items: docItems,
      subtotal,
      total: po.total_amount,
      messageBody: po.message_body,
    }
  }

  // ---- internals -----------------------------------------------------------

  private insert(
    businessId: string,
    data: {
      rfqId: string | null
      supplierId: string
      title: string | null
      messageBody: string | null
      currency: string
      expectedDate: string | null
      lines: Array<{ productId: string; variantId: string | null; description: string; quantity: number; unitPrice: number }>
    },
  ): LocalPurchaseOrderDetail {
    const id = randomUUID()
    const now = new Date().toISOString()
    const number = this.nextNumber(businessId)
    const total = data.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)

    this.db.run(
      `INSERT INTO purchase_orders (id, business_id, number, rfq_id, supplier_id, supplier_name, title, message_body, status, currency, expected_date, total_amount, sent_at, created_by_id, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, NULL, ?, 0, ?, ?)`,
      [id, businessId, number, data.rfqId, data.supplierId, this.contactName(data.supplierId), data.title, data.messageBody, data.currency, data.expectedDate, total, this.getActorId(), now, now],
    )
    for (const l of data.lines) {
      this.db.run(
        `INSERT INTO purchase_order_items (id, purchase_order_id, product_id, variant_id, description, quantity, unit_price, received_quantity, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [randomUUID(), id, l.productId, l.variantId, l.description, l.quantity, l.unitPrice, now],
      )
    }
    this.enqueue(id, businessId, now)
    this.onMutated()
    const created = this.get(id)!
    this.audit?.log({ action: 'CREATE', entityType: 'purchase_order', entityId: id, entityLabel: number, changes: { before: null, after: { number, supplierId: data.supplierId, total, items: data.lines.length } } })
    return created
  }

  private items(poId: string): LocalPurchaseOrderItem[] {
    return this.db
      .query<{ id: string; product_id: string; variant_id: string | null; description: string; quantity: number; unit_price: number; received_quantity: number }>(
        `SELECT id, product_id, variant_id, description, quantity, unit_price, received_quantity FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY created_at ASC`,
        [poId],
      )
      .map((r) => ({
        id: r.id,
        productId: r.product_id,
        variantId: r.variant_id,
        description: r.description,
        quantity: r.quantity,
        unitPrice: r.unit_price,
        receivedQuantity: r.received_quantity,
      }))
  }

  private describeProduct(productId: string, variantId: string | null): string {
    const p = this.db.get<{ name: string }>(`SELECT name FROM products WHERE id = ?`, [productId])
    const base = p?.name ?? 'Item'
    if (variantId) {
      const v = this.db.get<{ name: string }>(`SELECT name FROM product_variants WHERE id = ?`, [variantId])
      if (v?.name) return `${base} — ${v.name}`
    }
    return base
  }

  private contactName(contactId: string): string | null {
    return this.db.get<{ name: string }>(`SELECT name FROM contacts WHERE id = ?`, [contactId])?.name ?? null
  }

  private businessCurrency(): string {
    const businessId = this.getBusinessId()
    if (!businessId) return 'XAF'
    return this.db.get<{ currency: string }>(`SELECT currency FROM local_businesses WHERE id = ?`, [businessId])?.currency ?? 'XAF'
  }

  private nextNumber(businessId: string): string {
    const row = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM purchase_orders WHERE business_id = ?`, [businessId])
    return `PO-${String((row?.n ?? 0) + 1).padStart(5, '0')}`
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }

  /** Enqueue the PO with its full current state (items nested) — coalesced. */
  private enqueue(poId: string, businessId: string, now: string): void {
    const p = this.db.get<PoRow & { created_by_id: string | null }>(`SELECT ${COLS}, p.created_by_id FROM purchase_orders p WHERE p.id = ?`, [poId])
    if (!p) return
    const payload = {
      id: poId,
      businessId,
      number: p.number,
      rfqId: p.rfq_id,
      supplierId: p.supplier_id,
      supplierName: p.supplier_name,
      title: p.title,
      messageBody: p.message_body,
      status: p.status,
      currency: p.currency,
      expectedDate: p.expected_date,
      totalAmount: p.total_amount,
      sentAt: p.sent_at,
      createdById: p.created_by_id,
      createdAt: p.created_at,
      updatedAt: now,
      items: this.items(poId).map((i) => ({ id: i.id, productId: i.productId, variantId: i.variantId, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, receivedQuantity: i.receivedQuantity })),
    }
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'purchaseOrders', ?, 'UPSERT', ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), poId, JSON.stringify(payload), now, now],
    )
  }
}

function toLocalPo(r: PoRow): {
  id: string
  number: string
  rfqId: string | null
  supplierId: string
  supplierName: string | null
  title: string | null
  messageBody: string | null
  status: LocalPurchaseOrderListItem['status']
  currency: string
  expectedDate: string | null
  totalAmount: number
  sentAt: string | null
  createdAt: string
  updatedAt: string
} {
  return {
    id: r.id,
    number: r.number,
    rfqId: r.rfq_id,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    title: r.title,
    messageBody: r.message_body,
    status: r.status as LocalPurchaseOrderListItem['status'],
    currency: r.currency,
    expectedDate: r.expected_date,
    totalAmount: r.total_amount,
    sentAt: r.sent_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
