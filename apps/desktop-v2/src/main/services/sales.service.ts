import { randomUUID } from 'crypto'
import { PaymentMethod } from '@biztrack/types'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  LocalSale,
  LocalSaleDetail,
  LocalSaleItem,
  LocalSalePayment,
  PaginatedResult,
  SaleInput,
  SalesListQuery,
} from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'
import { recordStockMovement } from './stock-ledger'
import type { AuditLogger } from './audit.service'
import type { DebtsService } from './debts.service'
import type { SavingsService } from './savings.service'

interface SaleRow {
  id: string
  sale_number: string
  receipt_number: string
  status: string
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  subtotal: number
  discount_amount: number
  charges_amount: number
  total_amount: number
  amount_paid: number
  credit_amount: number
  change_given: number
  currency: string
  payment_method: string | null
  notes: string | null
  sold_at: string
  created_at: string
  item_count: number
}

interface ProductMeta {
  name: string
  sku: string | null
  unit: string | null
  price: number
  cost: number | null
  isSerialized: boolean
  hasVariants: boolean
  trackInventory: boolean
}

const SALE_COLS = `s.id, s.sale_number, s.receipt_number, s.status, s.customer_id, s.customer_name, s.customer_phone,
  s.subtotal, s.discount_amount, s.charges_amount, s.total_amount, s.amount_paid, s.credit_amount, s.change_given,
  s.currency, s.payment_method, s.notes, s.sold_at, s.created_at,
  (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id AND si.is_deleted = 0) AS item_count`

/**
 * Offline-first sales (POS checkout). Mirrors inventory.service.restock()'s settlement
 * pattern: compute subtotal − discounts + charges = total, settle by split payments, raise
 * a receivable on credit, decrement stock, and enqueue ONE outbox row carrying the full
 * SaleSyncPayload the API already accepts. No tax line (prices are inclusive) — matches the
 * API's sale computation so totals never drift on sync. The credit→debt receivable is created
 * by the existing `trg_sales_source_debt` DB trigger; `debts.createSourceDebt` is called too
 * (it no-ops on the trigger-created row) so behaviour matches restock exactly.
 */
export class SalesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly onMutated: () => void,
    private readonly getActorId: () => string | null,
    private readonly getActorName: () => string | null,
    private readonly debts: DebtsService,
    private readonly savings: SavingsService,
    private readonly audit?: AuditLogger,
  ) {}

  createSale(input: SaleInput): LocalSaleDetail {
    const businessId = this.requireBusinessId()
    if (!input.clientId?.trim()) throw new Error('Missing checkout id.')
    if (!input.items?.length) throw new Error('Add at least one item to the sale.')

    // Idempotency: a retried checkout with the same clientId returns the saved sale.
    const dup = this.db.get<{ id: string }>(
      `SELECT id FROM sales WHERE business_id = ? AND client_id = ? AND is_deleted = 0`,
      [businessId, input.clientId],
    )
    if (dup) return this.get(dup.id)!

    const cashierId = this.getActorId()
    if (!cashierId) throw new Error('No active cashier session.')
    const now = new Date().toISOString()
    const soldAt = input.soldAt?.trim() || now
    const saleId = randomUUID()
    const currency = this.businessCurrency(businessId)

    // --- expand cart lines into persisted sale items (one per serial unit) ----
    type Emit = {
      id: string
      productId: string
      productName: string
      productSku: string | null
      unit: string | null
      variantId: string | null
      variantName: string | null
      serialUnitId: string | null
      serialNumber: string | null
      quantity: number
      unitPrice: number
      discountAmount: number
      lineTotal: number
      costPrice: number | null
    }
    const emits: Emit[] = []
    // stock to decrement per (product, variant): qty
    const decrements: Array<{ productId: string; variantId: string | null; quantity: number; trackInventory: boolean }> = []
    const soldSerialIds: string[] = []

    for (const line of input.items) {
      const meta = this.requireProduct(line.productId, businessId)
      const unitPrice = round2(line.unitPrice)
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`Invalid price for “${meta.name}”.`)
      const variantId = line.variantId ?? null
      let variantName = line.variantName ?? null
      let cost = line.costPrice ?? meta.cost
      if (variantId) {
        const v = this.db.get<{ id: string; name: string | null; cost_price_override: number | null }>(
          `SELECT id, name, cost_price_override FROM product_variants WHERE id = ? AND product_id = ? AND is_deleted = 0`,
          [variantId, line.productId],
        )
        if (!v) throw new Error(`Variant not found for “${meta.name}”.`)
        variantName = variantName ?? v.name
        if (line.costPrice == null && v.cost_price_override != null) cost = v.cost_price_override
      } else if (meta.hasVariants && !meta.isSerialized) {
        throw new Error(`Select a variant for “${meta.name}”.`)
      }

      if (meta.isSerialized) {
        const serialIds = [...new Set((line.serialUnitIds ?? []).filter(Boolean))]
        if (serialIds.length === 0) throw new Error(`Pick the serial unit(s) sold for “${meta.name}”.`)
        for (const suId of serialIds) {
          const su = this.db.get<{ id: string; serial_number: string; variant_id: string | null }>(
            `SELECT id, serial_number, variant_id FROM product_serial_units
             WHERE id = ? AND product_id = ? AND business_id = ? AND is_deleted = 0 AND status = 'IN_STOCK'`,
            [suId, line.productId, businessId],
          )
          if (!su) throw new Error(`A chosen serial unit for “${meta.name}” is no longer in stock.`)
          emits.push({
            id: randomUUID(), productId: line.productId, productName: meta.name, productSku: meta.sku, unit: meta.unit,
            variantId: su.variant_id ?? variantId, variantName, serialUnitId: su.id, serialNumber: su.serial_number,
            quantity: 1, unitPrice, discountAmount: 0, lineTotal: unitPrice, costPrice: cost,
          })
          soldSerialIds.push(su.id)
        }
        decrements.push({ productId: line.productId, variantId, quantity: serialIds.length, trackInventory: meta.trackInventory })
      } else {
        const qty = line.quantity
        if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Quantity for “${meta.name}” must be greater than 0.`)
        const lineDiscount = round2(Math.max(0, line.discountAmount ?? 0))
        const lineTotal = round2(Math.max(0, unitPrice * qty - lineDiscount))
        emits.push({
          id: randomUUID(), productId: line.productId, productName: meta.name, productSku: meta.sku, unit: meta.unit,
          variantId, variantName, serialUnitId: null, serialNumber: null,
          quantity: qty, unitPrice, discountAmount: lineDiscount, lineTotal, costPrice: cost,
        })
        if (meta.trackInventory) decrements.push({ productId: line.productId, variantId, quantity: qty, trackInventory: true })
      }
    }

    // --- settlement (tax 0; matches the API computeSale) ----------------------
    const subtotal = round2(emits.reduce((s, e) => s + e.lineTotal, 0))
    const discountLines = (input.discounts ?? []).map((d) => ({ ...d, id: d.id ?? randomUUID(), amount: round2(Math.max(0, d.amount)) }))
    const chargeLines = (input.charges ?? []).map((c) => ({ ...c, id: c.id ?? randomUUID(), amount: round2(Math.max(0, c.amount)) }))
    const discountAmount = round2(Math.min(subtotal, discountLines.reduce((s, d) => s + d.amount, 0)))
    const chargesAmount = round2(chargeLines.reduce((s, c) => s + c.amount, 0))
    const totalAmount = round2(Math.max(0, subtotal - discountAmount + chargesAmount))

    const paymentLines = (input.payments ?? []).filter((p) => Number.isFinite(p.amount) && p.amount > 0)
    const amountPaid = round2(paymentLines.reduce((s, p) => s + p.amount, 0))
    const creditAmount = round2(Math.max(0, totalAmount - amountPaid))
    const changeGiven = round2(Math.max(0, amountPaid - totalAmount))

    const customerId = input.customerId?.trim() || null
    if (creditAmount > 0 && !customerId) throw new Error('Credit sales must be linked to a registered customer.')

    // Deposit (savings) payments must reference an account with enough balance — validate
    // up front so a shortfall can never leave a half-written sale.
    const savingsNeed = new Map<string, number>()
    for (const p of paymentLines) {
      if (p.method === PaymentMethod.SAVINGS) {
        if (!p.savingsAccountId) throw new Error('Deposit payment is missing the savings account.')
        savingsNeed.set(p.savingsAccountId, round2((savingsNeed.get(p.savingsAccountId) ?? 0) + p.amount))
      }
    }
    for (const [accId, amt] of savingsNeed) {
      const bal = this.savings.balanceOf(accId)
      if (bal == null) throw new Error('Deposit account not found.')
      if (bal < amt) throw new Error('Insufficient deposit balance.')
    }

    const customerName = customerId
      ? input.customerName?.trim() || this.db.get<{ name: string }>(`SELECT name FROM contacts WHERE id = ?`, [customerId])?.name || null
      : input.customerName?.trim() || null
    const customerPhone = input.customerPhone?.trim() || null
    const notes = input.notes?.trim() || null
    const paymentMethod = paymentLines.length === 0 ? null : paymentLines.length === 1 ? paymentLines[0]!.method : 'MIXED'
    const momoReference = paymentLines.find((p) => p.mobileMoneyReference)?.mobileMoneyReference ?? null
    const saleNumber = this.nextSaleNumber(businessId, soldAt)

    // --- persist parent + children -------------------------------------------
    this.db.run(
      `INSERT INTO sales
        (id, business_id, client_id, cashier_id, cashier_name, sale_number, receipt_number, subtotal, total_amount,
         discount_amount, charges_amount, tax_amount, net_amount, amount_paid, credit_amount, change_given,
         payment_method, momo_reference, customer_id, customer_name, customer_phone, notes, currency, sale_date,
         sold_at, status, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', 0, ?, ?)`,
      [
        saleId, businessId, input.clientId, cashierId, this.getActorName(), saleNumber, saleNumber, subtotal, totalAmount,
        discountAmount, chargesAmount, totalAmount, amountPaid, creditAmount, changeGiven,
        paymentMethod, momoReference, customerId, customerName, customerPhone, notes, currency, soldAt.slice(0, 10),
        soldAt, now, now,
      ],
    )

    for (const e of emits) {
      this.db.run(
        `INSERT INTO sale_items
          (id, sale_id, business_id, product_id, product_name, product_sku, unit_of_measure, variant_id, variant_name,
           serial_unit_id, serial_number, quantity, unit_price, discount_amount, line_total, total_price, cost_price,
           is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [e.id, saleId, businessId, e.productId, e.productName, e.productSku, e.unit, e.variantId, e.variantName,
         e.serialUnitId, e.serialNumber, e.quantity, e.unitPrice, e.discountAmount, e.lineTotal, e.lineTotal, e.costPrice, now, now],
      )
    }
    for (const c of chargeLines) {
      this.db.run(
        `INSERT INTO sale_charges (id, sale_id, business_id, charge_type_id, name, rate_type, rate_value, amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [c.id, saleId, businessId, c.chargeTypeId ?? null, c.name, c.rateType, c.rateValue, c.amount, now],
      )
    }
    for (const d of discountLines) {
      this.db.run(
        `INSERT INTO sale_discounts (id, sale_id, sale_item_id, business_id, description, discount_type, rate, amount, created_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        [d.id, saleId, businessId, d.description, d.discountType, d.rate ?? null, d.amount, now],
      )
    }
    for (const p of paymentLines) {
      this.db.run(
        `INSERT INTO sale_payments (id, sale_id, business_id, method, amount, mobile_money_reference, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), saleId, businessId, p.method, round2(p.amount), p.mobileMoneyReference ?? null, now],
      )
    }

    // Draw down each deposit (savings) payment: decrements balance + records/pushes the usage.
    for (const p of paymentLines) {
      if (p.method === PaymentMethod.SAVINGS && p.savingsAccountId) {
        this.savings.recordSaleUsage({ accountId: p.savingsAccountId, saleId, amount: round2(p.amount), now, recordedById: cashierId })
      }
    }

    // --- decrement stock + mark serials SOLD ---------------------------------
    if (soldSerialIds.length > 0) {
      const ph = soldSerialIds.map(() => '?').join(', ')
      this.db.run(
        `UPDATE product_serial_units SET status = 'SOLD', sale_id = ?, sold_at = ?, customer_id = ?, updated_at = ?
         WHERE id IN (${ph})`,
        [saleId, soldAt, customerId, now, ...soldSerialIds],
      )
    }
    const movementById = new Map<string, string>()
    for (const d of decrements) {
      if (!d.trackInventory) continue
      if (d.variantId) {
        this.db.run(`UPDATE product_variants SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ?`, [d.quantity, now, d.variantId])
      } else {
        this.db.run(`UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ? AND business_id = ?`, [d.quantity, now, d.productId, businessId])
      }
      const movementId = recordStockMovement(
        this.db, businessId, d.productId, -d.quantity,
        { referenceType: 'sale', referenceId: saleId, notes: `Sale ${saleNumber}`, type: 'SALE' }, now,
      )
      if (movementId) movementById.set(`${d.productId}:${d.variantId ?? ''}`, movementId)
    }

    // --- sync outbox: the full SaleSyncPayload the API already accepts --------
    this.enqueueSale(saleId, businessId, {
      clientId: input.clientId,
      saleNumber,
      soldAt,
      cashierId,
      cashierName: this.getActorName(),
      customerId,
      customerName,
      customerPhone,
      notes,
      discountAmount,
      chargesAmount,
      creditAmount,
      status: 'COMPLETED',
      payments: paymentLines.map((p) => ({
        id: randomUUID(), method: p.method, amount: round2(p.amount),
        mobileMoneyReference: p.mobileMoneyReference ?? null, savingsAccountId: p.savingsAccountId ?? null,
      })),
      items: emits.map((e) => ({
        id: e.id, productId: e.productId, variantId: e.variantId, variantName: e.variantName ?? undefined,
        serialUnitId: e.serialUnitId, serialNumber: e.serialNumber ?? undefined, quantity: e.quantity,
        unitPrice: e.unitPrice, discountAmount: e.discountAmount, costPrice: e.costPrice ?? undefined,
        movementId: movementById.get(`${e.productId}:${e.variantId ?? ''}`) ?? null,
      })),
      charges: chargeLines.map((c) => ({ id: c.id, chargeTypeId: c.chargeTypeId ?? null, name: c.name, rateType: c.rateType, rateValue: c.rateValue, amount: c.amount })),
      discounts: discountLines.map((d) => ({ id: d.id, description: d.description, discountType: d.discountType, rate: d.rate ?? null, amount: d.amount })),
    }, now)

    // Credit → receivable. The trg_sales_source_debt trigger already created it; this
    // no-ops on the existing row (idempotent per source), mirroring restock.
    if (creditAmount > 0 && customerId) {
      this.debts.createSourceDebt({
        contactId: customerId,
        direction: 'RECEIVABLE',
        sourceType: 'SALE',
        sourceId: saleId,
        sourceReference: saleNumber,
        originalAmount: creditAmount,
        notes,
        createdAt: soldAt,
      })
    }

    this.audit?.log({
      action: 'CREATE',
      entityType: 'sale',
      entityId: saleId,
      entityLabel: saleNumber,
      changes: { before: null, after: { subtotal, discountAmount, chargesAmount, totalAmount, amountPaid, creditAmount, changeGiven, customerId, items: emits.length } },
    })
    this.onMutated()
    return this.get(saleId)!
  }

  /** Paginated sales history (newest first). */
  list(query: SalesListQuery = {}): PaginatedResult<LocalSale> {
    const businessId = this.getBusinessId()
    if (!businessId) return toPaginated<LocalSale>([], { total: 0, page: 1, limit: 20, totalPages: 1 })
    let where = 's.business_id = ? AND s.is_deleted = 0'
    const params: unknown[] = [businessId]
    if (query.customerId) { where += ' AND s.customer_id = ?'; params.push(query.customerId) }
    if (query.status) { where += ' AND s.status = ?'; params.push(query.status) }
    if (query.dateFrom) { where += ' AND s.sale_date >= ?'; params.push(query.dateFrom) }
    if (query.dateTo) { where += ' AND s.sale_date <= ?'; params.push(query.dateTo) }
    const { rows, ...meta } = paginateRows<SaleRow>(
      this.db,
      {
        from: 'sales s',
        columns: SALE_COLS,
        where,
        params,
        searchColumns: ['s.sale_number', 's.customer_name'],
        defaultSort: 's.sold_at DESC',
        sortMap: { soldAt: 's.sold_at', total: 's.total_amount', createdAt: 's.created_at' },
      },
      query,
    )
    return toPaginated(rows.map(toLocalSale), meta)
  }

  get(id: string): LocalSaleDetail | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<SaleRow>(`SELECT ${SALE_COLS} FROM sales s WHERE s.id = ? AND s.business_id = ?`, [id, businessId])
    if (!row) return null
    const items = this.db.query<{
      id: string; product_id: string; product_name: string; variant_id: string | null; variant_name: string | null
      serial_number: string | null; quantity: number; unit_price: number; discount_amount: number; line_total: number
    }>(
      `SELECT id, product_id, product_name, variant_id, variant_name, serial_number, quantity, unit_price, discount_amount, line_total
       FROM sale_items WHERE sale_id = ? AND is_deleted = 0 ORDER BY created_at ASC`,
      [id],
    )
    const payments = this.db.query<{ id: string; method: string; amount: number; mobile_money_reference: string | null }>(
      `SELECT id, method, amount, mobile_money_reference FROM sale_payments WHERE sale_id = ? ORDER BY created_at ASC`,
      [id],
    )
    return {
      ...toLocalSale(row),
      items: items.map<LocalSaleItem>((i) => ({
        id: i.id, productId: i.product_id, productName: i.product_name, variantId: i.variant_id, variantName: i.variant_name,
        serialNumber: i.serial_number, quantity: i.quantity, unitPrice: i.unit_price, discountAmount: i.discount_amount, lineTotal: i.line_total,
      })),
      payments: payments.map<LocalSalePayment>((p) => ({
        id: p.id, method: p.method as LocalSalePayment['method'], amount: p.amount, mobileMoneyReference: p.mobile_money_reference,
      })),
    }
  }

  // ---- internals -----------------------------------------------------------

  private requireProduct(productId: string, businessId: string): ProductMeta {
    const row = this.db.get<{
      name: string; sku: string | null; unit: string | null; price: number; cost_price: number | null
      is_serialized: number; has_variants: number; track_inventory: number
    }>(
      `SELECT p.name, p.sku, p.price, p.cost_price, p.is_serialized, p.track_inventory,
              (SELECT abbreviation FROM unit_of_measures u WHERE u.id = p.unit_of_measure_id) AS unit,
              EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_deleted = 0) AS has_variants
       FROM products p WHERE p.id = ? AND p.business_id = ? AND p.is_deleted = 0`,
      [productId, businessId],
    )
    if (!row) throw new Error('Product not found.')
    return {
      name: row.name, sku: row.sku, unit: row.unit, price: row.price, cost: row.cost_price,
      isSerialized: row.is_serialized === 1, hasVariants: row.has_variants === 1, trackInventory: row.track_inventory === 1,
    }
  }

  /** Atomically increment the per-day sale sequence and format VTE-YYYYMMDD-XXXX. */
  private nextSaleNumber(businessId: string, soldAt: string): string {
    const date = soldAt.slice(0, 10) // YYYY-MM-DD
    this.db.run(
      `INSERT INTO sale_number_sequences (business_id, sale_date, last_sequence) VALUES (?, ?, 1)
       ON CONFLICT(business_id, sale_date) DO UPDATE SET last_sequence = last_sequence + 1`,
      [businessId, date],
    )
    const seq = this.db.get<{ last_sequence: number }>(
      `SELECT last_sequence FROM sale_number_sequences WHERE business_id = ? AND sale_date = ?`,
      [businessId, date],
    )?.last_sequence ?? 1
    return `VTE-${date.replace(/-/g, '')}-${String(seq).padStart(4, '0')}`
  }

  private businessCurrency(businessId: string): string {
    return this.db.get<{ currency: string }>(`SELECT currency FROM local_businesses WHERE id = ?`, [businessId])?.currency ?? 'XAF'
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }

  private enqueueSale(recordId: string, businessId: string, payload: Record<string, unknown>, now: string): void {
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'sales', ?, 'UPSERT', ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), recordId, JSON.stringify({ saleId: recordId, businessId, ...payload }), now, now],
    )
  }
}

function toLocalSale(r: SaleRow): LocalSale {
  return {
    id: r.id,
    saleNumber: r.sale_number,
    receiptNumber: r.receipt_number,
    status: r.status,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    subtotal: r.subtotal,
    discountAmount: r.discount_amount,
    chargesAmount: r.charges_amount,
    totalAmount: r.total_amount,
    amountPaid: r.amount_paid,
    creditAmount: r.credit_amount,
    changeGiven: r.change_given,
    currency: r.currency,
    paymentMethod: r.payment_method,
    notes: r.notes,
    soldAt: r.sold_at,
    createdAt: r.created_at,
    itemCount: r.item_count,
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
