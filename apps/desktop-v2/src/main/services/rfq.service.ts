import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  CreateRfqRequest,
  LocalRfqDetail,
  LocalRfqItem,
  LocalRfqListItem,
  LocalRfqSupplier,
  PaginatedResult,
  RecordRfqQuoteRequest,
  RfqDocument,
  RfqsQuery,
} from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'
import type { AuditLogger } from './audit.service'

interface RfqRow {
  id: string
  number: string
  title: string | null
  message_body: string | null
  status: string
  currency: string
  created_at: string
  updated_at: string
}
interface RfqListRow extends RfqRow {
  item_count: number
  supplier_count: number
  quote_count: number
}

const COLS = 'r.id, r.number, r.title, r.message_body, r.status, r.currency, r.created_at, r.updated_at'

/**
 * Offline-first Requests for Quotation. An RFQ has line items + a set of suppliers
 * it's sent to (each can return a quote). Reads from local SQLite; writes go local +
 * sync_outbox (entity `rfqs` → server `rfq`, items + suppliers nested in the payload)
 * and nudge a sync. Sending (PDF + WhatsApp/email) is handled by DocumentService;
 * this service builds the document view-model and flips statuses.
 */
export class RfqService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly onMutated: () => void,
    private readonly getActorId: () => string | null,
    private readonly audit?: AuditLogger,
  ) {}

  list(query: RfqsQuery = {}): PaginatedResult<LocalRfqListItem> {
    const businessId = this.getBusinessId()
    if (!businessId) return toPaginated<LocalRfqListItem>([], { total: 0, page: 1, limit: 20, totalPages: 1 })

    let where = 'r.business_id = ? AND r.is_deleted = 0'
    const params: unknown[] = [businessId]
    if (query.status) {
      where += ' AND r.status = ?'
      params.push(query.status)
    }
    if (query.supplierId) {
      where += ' AND EXISTS (SELECT 1 FROM rfq_suppliers rs WHERE rs.rfq_id = r.id AND rs.supplier_id = ?)'
      params.push(query.supplierId)
    }

    const { rows, ...meta } = paginateRows<RfqListRow>(
      this.db,
      {
        from: 'rfqs r',
        columns: `${COLS},
          (SELECT COUNT(*) FROM rfq_items ri WHERE ri.rfq_id = r.id) AS item_count,
          (SELECT COUNT(*) FROM rfq_suppliers rs WHERE rs.rfq_id = r.id) AS supplier_count,
          (SELECT COUNT(*) FROM rfq_suppliers rs WHERE rs.rfq_id = r.id AND rs.status = 'QUOTED') AS quote_count`,
        where,
        params,
        searchColumns: ['r.number', 'r.title'],
        defaultSort: 'r.created_at DESC',
        sortMap: { createdAt: 'r.created_at', number: 'r.number' },
      },
      query,
    )
    return toPaginated(
      rows.map((r) => ({ ...toLocalRfq(r), itemCount: r.item_count, supplierCount: r.supplier_count, quoteCount: r.quote_count })),
      meta,
    )
  }

  get(id: string): LocalRfqDetail | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<RfqRow>(`SELECT ${COLS} FROM rfqs r WHERE r.id = ? AND r.business_id = ? AND r.is_deleted = 0`, [id, businessId])
    if (!row) return null
    return { ...toLocalRfq(row), items: this.items(id), suppliers: this.suppliers(id) }
  }

  create(input: CreateRfqRequest): LocalRfqDetail {
    const businessId = this.requireBusinessId()
    if (!input.items?.length) throw new Error('Add at least one item to the request.')
    if (!input.supplierIds?.length) throw new Error('Select at least one supplier.')

    const id = randomUUID()
    const now = new Date().toISOString()
    const currency = input.currency || this.businessCurrency()
    const number = this.nextNumber(businessId)

    this.db.run(
      `INSERT INTO rfqs (id, business_id, number, title, message_body, status, currency, created_by_id, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, 0, ?, ?)`,
      [id, businessId, number, input.title?.trim() || null, input.messageBody?.trim() || null, currency, this.getActorId(), now, now],
    )
    for (const it of input.items) {
      this.db.run(
        `INSERT INTO rfq_items (id, rfq_id, product_id, variant_id, description, quantity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), id, it.productId, it.variantId ?? null, it.description?.trim() || this.describeProduct(it.productId, it.variantId ?? null), it.quantity, now],
      )
    }
    for (const supplierId of input.supplierIds) {
      this.db.run(
        `INSERT INTO rfq_suppliers (id, rfq_id, supplier_id, supplier_name, status, created_at) VALUES (?, ?, ?, ?, 'PENDING', ?)`,
        [randomUUID(), id, supplierId, this.contactName(supplierId), now],
      )
    }

    this.enqueue(id, businessId, now)
    this.onMutated()
    const created = this.get(id)!
    this.audit?.log({ action: 'CREATE', entityType: 'rfq', entityId: id, entityLabel: number, changes: { before: null, after: { number, items: created.items.length, suppliers: created.suppliers.length } } })
    return created
  }

  /** Record a supplier's quote (header-level total). Flips the supplier to QUOTED and
   * the RFQ to QUOTED. */
  recordQuote(rfqId: string, input: RecordRfqQuoteRequest): LocalRfqDetail {
    const businessId = this.requireBusinessId()
    const rfq = this.get(rfqId)
    if (!rfq) throw new Error('RFQ not found.')
    const supplier = this.db.get<{ id: string }>(`SELECT id FROM rfq_suppliers WHERE id = ? AND rfq_id = ?`, [input.rfqSupplierId, rfqId])
    if (!supplier) throw new Error('Supplier is not on this request.')
    const total = Number(input.quotedTotal)
    if (!Number.isFinite(total) || total < 0) throw new Error('Enter a valid quote amount.')

    const now = new Date().toISOString()
    this.db.run(
      `UPDATE rfq_suppliers SET status = 'QUOTED', quoted_total = ?, quote_notes = ?, quote_file_url = ?, responded_at = ? WHERE id = ?`,
      [total, input.quoteNotes?.trim() || null, input.quoteFileUrl ?? null, now, input.rfqSupplierId],
    )
    if (rfq.status === 'DRAFT' || rfq.status === 'SENT') {
      this.db.run(`UPDATE rfqs SET status = 'QUOTED', updated_at = ? WHERE id = ? AND business_id = ?`, [now, rfqId, businessId])
    } else {
      this.db.run(`UPDATE rfqs SET updated_at = ? WHERE id = ? AND business_id = ?`, [now, rfqId, businessId])
    }
    this.enqueue(rfqId, businessId, now)
    this.onMutated()
    this.audit?.log({ action: 'UPDATE', entityType: 'rfq', entityId: rfqId, entityLabel: rfq.number, changes: { before: null, after: { quote: total, supplier: input.rfqSupplierId } } })
    return this.get(rfqId)!
  }

  /** Mark the given suppliers (or all still PENDING) as SENT; flip the RFQ to SENT. */
  markSent(rfqId: string, supplierIds?: string[]): LocalRfqDetail {
    const businessId = this.requireBusinessId()
    const rfq = this.get(rfqId)
    if (!rfq) throw new Error('RFQ not found.')
    const now = new Date().toISOString()
    const targets = supplierIds?.length ? rfq.suppliers.filter((s) => supplierIds.includes(s.supplierId)) : rfq.suppliers.filter((s) => s.status === 'PENDING')
    for (const s of targets) {
      this.db.run(`UPDATE rfq_suppliers SET status = 'SENT' WHERE id = ? AND status = 'PENDING'`, [s.id])
    }
    if (rfq.status === 'DRAFT') {
      this.db.run(`UPDATE rfqs SET status = 'SENT', updated_at = ? WHERE id = ? AND business_id = ?`, [now, rfqId, businessId])
    } else {
      this.db.run(`UPDATE rfqs SET updated_at = ? WHERE id = ? AND business_id = ?`, [now, rfqId, businessId])
    }
    this.enqueue(rfqId, businessId, now)
    this.onMutated()
    this.audit?.log({ action: 'UPDATE', entityType: 'rfq', entityId: rfqId, entityLabel: rfq.number, changes: { before: { status: rfq.status }, after: { status: 'SENT', sentTo: targets.length } } })
    return this.get(rfqId)!
  }

  /** Mark an RFQ as CONVERTED (a PO was created from one of its quotes). */
  markConverted(rfqId: string): void {
    const businessId = this.requireBusinessId()
    const now = new Date().toISOString()
    this.db.run(`UPDATE rfqs SET status = 'CONVERTED', updated_at = ? WHERE id = ? AND business_id = ?`, [now, rfqId, businessId])
    this.enqueue(rfqId, businessId, now)
    this.onMutated()
  }

  /** Build the printable document view-model for an RFQ addressed to one supplier. */
  buildDocument(rfqId: string, supplierId: string): RfqDocument {
    const businessId = this.requireBusinessId()
    const row = this.db.get<RfqRow>(`SELECT ${COLS} FROM rfqs r WHERE r.id = ? AND r.business_id = ?`, [rfqId, businessId])
    if (!row) throw new Error('RFQ not found.')
    const biz = this.db.get<{ name: string; phone: string | null; email: string | null; address: string | null; logo_url: string | null }>(
      `SELECT name, phone, email, address, logo_url FROM local_businesses WHERE id = ?`,
      [businessId],
    )
    // Contacts carry a phone but no email column yet — WhatsApp is the primary channel;
    // email send opens the composer with a manually-entered recipient. (Adding a
    // contact email is a tracked follow-up.)
    const supplier = this.db.get<{ name: string; phone: string | null; address: string | null }>(
      `SELECT name, phone, address FROM contacts WHERE id = ? AND business_id = ?`,
      [supplierId, businessId],
    )
    const items = this.db.query<{ description: string; quantity: number; sku: string | null }>(
      `SELECT ri.description, ri.quantity, p.sku FROM rfq_items ri LEFT JOIN products p ON p.id = ri.product_id WHERE ri.rfq_id = ? ORDER BY ri.created_at ASC`,
      [rfqId],
    )
    return {
      number: row.number,
      title: row.title,
      issuedDate: new Date(row.created_at).toLocaleDateString(),
      currency: row.currency,
      business: { name: biz?.name ?? 'BizTrack', phone: biz?.phone, email: biz?.email, address: biz?.address, logoUrl: biz?.logo_url },
      supplier: { name: supplier?.name ?? '', phone: supplier?.phone, email: null, address: supplier?.address },
      items: items.map((i) => ({ description: i.description, sku: i.sku, quantity: i.quantity })),
      messageBody: row.message_body,
    }
  }

  // ---- internals -----------------------------------------------------------

  private items(rfqId: string): LocalRfqItem[] {
    return this.db
      .query<{ id: string; product_id: string; variant_id: string | null; description: string; quantity: number }>(
        `SELECT id, product_id, variant_id, description, quantity FROM rfq_items WHERE rfq_id = ? ORDER BY created_at ASC`,
        [rfqId],
      )
      .map((r) => ({ id: r.id, productId: r.product_id, variantId: r.variant_id, description: r.description, quantity: r.quantity }))
  }

  private suppliers(rfqId: string): LocalRfqSupplier[] {
    return this.db
      .query<{ id: string; supplier_id: string; supplier_name: string | null; status: string; quoted_total: number | null; quote_notes: string | null; quote_file_url: string | null; responded_at: string | null }>(
        `SELECT id, supplier_id, supplier_name, status, quoted_total, quote_notes, quote_file_url, responded_at FROM rfq_suppliers WHERE rfq_id = ? ORDER BY created_at ASC`,
        [rfqId],
      )
      .map((r) => ({
        id: r.id,
        supplierId: r.supplier_id,
        supplierName: r.supplier_name,
        status: r.status as LocalRfqSupplier['status'],
        quotedTotal: r.quoted_total,
        quoteNotes: r.quote_notes,
        quoteFileUrl: r.quote_file_url,
        respondedAt: r.responded_at,
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
    const row = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM rfqs WHERE business_id = ?`, [businessId])
    return `RFQ-${String((row?.n ?? 0) + 1).padStart(5, '0')}`
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }

  /** Enqueue the RFQ with its full current state (items + suppliers) — coalesced. */
  private enqueue(rfqId: string, businessId: string, now: string): void {
    const r = this.db.get<RfqRow & { created_by_id: string | null }>(
      `SELECT ${COLS}, r.created_by_id FROM rfqs r WHERE r.id = ?`,
      [rfqId],
    )
    if (!r) return
    const payload = {
      id: rfqId,
      businessId,
      number: r.number,
      title: r.title,
      messageBody: r.message_body,
      status: r.status,
      currency: r.currency,
      createdById: r.created_by_id,
      createdAt: r.created_at,
      updatedAt: now,
      items: this.items(rfqId).map((i) => ({ id: i.id, productId: i.productId, variantId: i.variantId, description: i.description, quantity: i.quantity })),
      suppliers: this.suppliers(rfqId).map((s) => ({ id: s.id, supplierId: s.supplierId, status: s.status, quotedTotal: s.quotedTotal, quoteNotes: s.quoteNotes, quoteFileUrl: s.quoteFileUrl, respondedAt: s.respondedAt })),
    }
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'rfqs', ?, 'UPSERT', ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), rfqId, JSON.stringify(payload), now, now],
    )
  }
}

function toLocalRfq(r: RfqRow): {
  id: string
  number: string
  title: string | null
  messageBody: string | null
  status: LocalRfqListItem['status']
  currency: string
  createdAt: string
  updatedAt: string
} {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    messageBody: r.message_body,
    status: r.status as LocalRfqListItem['status'],
    currency: r.currency,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
