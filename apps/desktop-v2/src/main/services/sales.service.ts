import { randomUUID } from 'crypto'
import { PaymentMethod } from '@biztrack/types'
import type { SaleReceipt } from '@biztrack/types'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  CashierPerformanceRow,
  DailySalesRow,
  LocalSale,
  LocalSaleDetail,
  LocalSaleItem,
  LocalSalePayment,
  LocalSalesSummary,
  PaginatedResult,
  RefundCashierRow,
  RefundReasonRow,
  SaleInput,
  SalesByPaymentRow,
  SalesByProductRow,
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
  source: string | null
  notes: string | null
  sold_at: string
  created_at: string
  item_count: number
  sync_status: string
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
  s.currency, s.payment_method, s.source, s.notes, s.sold_at, s.created_at,
  (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id AND si.is_deleted = 0) AS item_count,
  CASE WHEN EXISTS(SELECT 1 FROM sync_outbox o WHERE o.entity = 'sales' AND o.record_id = s.id) THEN 'pending' ELSE 'synced' END AS sync_status`

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
    const decrements: Array<{
      productId: string
      variantId: string | null
      quantity: number
      trackInventory: boolean
    }> = []
    const soldSerialIds: string[] = []

    for (const line of input.items) {
      const meta = this.requireProduct(line.productId, businessId)
      const unitPrice = round2(line.unitPrice)
      if (!Number.isFinite(unitPrice) || unitPrice < 0)
        throw new Error(`Invalid price for “${meta.name}”.`)
      const variantId = line.variantId ?? null
      let variantName = line.variantName ?? null
      let cost = line.costPrice ?? meta.cost
      if (variantId) {
        const v = this.db.get<{
          id: string
          name: string | null
          cost_price_override: number | null
        }>(
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
        if (serialIds.length === 0)
          throw new Error(`Pick the serial unit(s) sold for “${meta.name}”.`)
        for (const suId of serialIds) {
          const su = this.db.get<{ id: string; serial_number: string; variant_id: string | null }>(
            `SELECT id, serial_number, variant_id FROM product_serial_units
             WHERE id = ? AND product_id = ? AND business_id = ? AND is_deleted = 0 AND status = 'IN_STOCK'`,
            [suId, line.productId, businessId],
          )
          if (!su) throw new Error(`A chosen serial unit for “${meta.name}” is no longer in stock.`)
          emits.push({
            id: randomUUID(),
            productId: line.productId,
            productName: meta.name,
            productSku: meta.sku,
            unit: meta.unit,
            variantId: su.variant_id ?? variantId,
            variantName,
            serialUnitId: su.id,
            serialNumber: su.serial_number,
            quantity: 1,
            unitPrice,
            discountAmount: 0,
            lineTotal: unitPrice,
            costPrice: cost,
          })
          soldSerialIds.push(su.id)
        }
        decrements.push({
          productId: line.productId,
          variantId,
          quantity: serialIds.length,
          trackInventory: meta.trackInventory,
        })
      } else {
        const qty = line.quantity
        if (!Number.isFinite(qty) || qty <= 0)
          throw new Error(`Quantity for “${meta.name}” must be greater than 0.`)
        const lineDiscount = round2(Math.max(0, line.discountAmount ?? 0))
        const lineTotal = round2(Math.max(0, unitPrice * qty - lineDiscount))
        emits.push({
          id: randomUUID(),
          productId: line.productId,
          productName: meta.name,
          productSku: meta.sku,
          unit: meta.unit,
          variantId,
          variantName,
          serialUnitId: null,
          serialNumber: null,
          quantity: qty,
          unitPrice,
          discountAmount: lineDiscount,
          lineTotal,
          costPrice: cost,
        })
        if (meta.trackInventory)
          decrements.push({
            productId: line.productId,
            variantId,
            quantity: qty,
            trackInventory: true,
          })
      }
    }

    // --- settlement (tax 0; matches the API computeSale) ----------------------
    const subtotal = round2(emits.reduce((s, e) => s + e.lineTotal, 0))
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
    const discountAmount = round2(
      Math.min(
        subtotal,
        discountLines.reduce((s, d) => s + d.amount, 0),
      ),
    )
    const chargesAmount = round2(chargeLines.reduce((s, c) => s + c.amount, 0))
    const totalAmount = round2(Math.max(0, subtotal - discountAmount + chargesAmount))

    const paymentLines = (input.payments ?? []).filter(
      (p) => Number.isFinite(p.amount) && p.amount > 0,
    )
    const amountPaid = round2(paymentLines.reduce((s, p) => s + p.amount, 0))
    const creditAmount = round2(Math.max(0, totalAmount - amountPaid))
    const changeGiven = round2(Math.max(0, amountPaid - totalAmount))

    const customerId = input.customerId?.trim() || null
    if (creditAmount > 0 && !customerId)
      throw new Error('Credit sales must be linked to a registered customer.')

    // Deposit (savings) payments must reference an account with enough balance — validate
    // up front so a shortfall can never leave a half-written sale.
    const savingsNeed = new Map<string, number>()
    for (const p of paymentLines) {
      if (p.method === PaymentMethod.SAVINGS) {
        if (!p.savingsAccountId) throw new Error('Deposit payment is missing the savings account.')
        savingsNeed.set(
          p.savingsAccountId,
          round2((savingsNeed.get(p.savingsAccountId) ?? 0) + p.amount),
        )
      }
    }
    for (const [accId, amt] of savingsNeed) {
      const bal = this.savings.balanceOf(accId)
      if (bal == null) throw new Error('Deposit account not found.')
      if (bal < amt) throw new Error('Insufficient deposit balance.')
    }

    const customerName = customerId
      ? input.customerName?.trim() ||
        this.db.get<{ name: string }>(`SELECT name FROM contacts WHERE id = ?`, [customerId])
          ?.name ||
        null
      : input.customerName?.trim() || null
    const customerPhone = input.customerPhone?.trim() || null
    const notes = input.notes?.trim() || null
    const paymentMethod =
      paymentLines.length === 0
        ? null
        : paymentLines.length === 1
          ? paymentLines[0]!.method
          : 'MIXED'
    const momoReference =
      paymentLines.find((p) => p.mobileMoneyReference)?.mobileMoneyReference ?? null
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
        saleId,
        businessId,
        input.clientId,
        cashierId,
        this.getActorName(),
        saleNumber,
        saleNumber,
        subtotal,
        totalAmount,
        discountAmount,
        chargesAmount,
        totalAmount,
        amountPaid,
        creditAmount,
        changeGiven,
        paymentMethod,
        momoReference,
        customerId,
        customerName,
        customerPhone,
        notes,
        currency,
        soldAt.slice(0, 10),
        soldAt,
        now,
        now,
      ],
    )

    for (const e of emits) {
      this.db.run(
        `INSERT INTO sale_items
          (id, sale_id, business_id, product_id, product_name, product_sku, unit_of_measure, variant_id, variant_name,
           serial_unit_id, serial_number, quantity, unit_price, discount_amount, line_total, total_price, cost_price,
           is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          e.id,
          saleId,
          businessId,
          e.productId,
          e.productName,
          e.productSku,
          e.unit,
          e.variantId,
          e.variantName,
          e.serialUnitId,
          e.serialNumber,
          e.quantity,
          e.unitPrice,
          e.discountAmount,
          e.lineTotal,
          e.lineTotal,
          e.costPrice,
          now,
          now,
        ],
      )
    }
    for (const c of chargeLines) {
      this.db.run(
        `INSERT INTO sale_charges (id, sale_id, business_id, charge_type_id, name, rate_type, rate_value, amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c.id,
          saleId,
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
        `INSERT INTO sale_discounts (id, sale_id, sale_item_id, business_id, description, discount_type, rate, amount, created_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        [d.id, saleId, businessId, d.description, d.discountType, d.rate ?? null, d.amount, now],
      )
    }
    for (const p of paymentLines) {
      this.db.run(
        `INSERT INTO sale_payments (id, sale_id, business_id, method, amount, mobile_money_reference, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          saleId,
          businessId,
          p.method,
          round2(p.amount),
          p.mobileMoneyReference ?? null,
          now,
        ],
      )
    }

    // Draw down each deposit (savings) payment: decrements balance + records/pushes the usage.
    for (const p of paymentLines) {
      if (p.method === PaymentMethod.SAVINGS && p.savingsAccountId) {
        this.savings.recordSaleUsage({
          accountId: p.savingsAccountId,
          saleId,
          amount: round2(p.amount),
          now,
          recordedById: cashierId,
        })
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
        this.db.run(
          `UPDATE product_variants SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ?`,
          [d.quantity, now, d.variantId],
        )
      } else {
        this.db.run(
          `UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ? AND business_id = ?`,
          [d.quantity, now, d.productId, businessId],
        )
      }
      const movementId = recordStockMovement(
        this.db,
        businessId,
        d.productId,
        -d.quantity,
        { referenceType: 'sale', referenceId: saleId, notes: `Sale ${saleNumber}`, type: 'SALE' },
        now,
      )
      if (movementId) movementById.set(`${d.productId}:${d.variantId ?? ''}`, movementId)
    }

    // --- sync outbox: the full SaleSyncPayload the API already accepts --------
    this.enqueueSale(
      saleId,
      businessId,
      {
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
          id: randomUUID(),
          method: p.method,
          amount: round2(p.amount),
          mobileMoneyReference: p.mobileMoneyReference ?? null,
          savingsAccountId: p.savingsAccountId ?? null,
        })),
        items: emits.map((e) => ({
          id: e.id,
          productId: e.productId,
          variantId: e.variantId,
          variantName: e.variantName ?? undefined,
          serialUnitId: e.serialUnitId,
          serialNumber: e.serialNumber ?? undefined,
          quantity: e.quantity,
          unitPrice: e.unitPrice,
          discountAmount: e.discountAmount,
          costPrice: e.costPrice ?? undefined,
          movementId: movementById.get(`${e.productId}:${e.variantId ?? ''}`) ?? null,
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
      },
      now,
    )

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
      changes: {
        before: null,
        after: {
          subtotal,
          discountAmount,
          chargesAmount,
          totalAmount,
          amountPaid,
          creditAmount,
          changeGiven,
          customerId,
          items: emits.length,
        },
      },
    })
    this.onMutated()
    return this.get(saleId)!
  }

  /**
   * Void a completed sale (offline-first). Reverses the sale locally — restocks products
   * and variants (with a VOID_REVERSAL movement), releases sold serial units, refunds any
   * deposit draw-down, and (via the trg_sales_source_debt trigger) writes off any credit
   * receivable — then re-enqueues the sale to sync as VOIDED so the API performs its own
   * authoritative reversal. Role gating (OWNER/MANAGER) is enforced by the caller/UI.
   */
  voidSale(saleId: string, reason: string): LocalSaleDetail {
    const businessId = this.requireBusinessId()
    const trimmed = (reason ?? '').trim()
    if (trimmed.length < 10)
      throw new Error('Give a reason (at least 10 characters) to void this sale.')

    const actorId = this.getActorId()
    if (!actorId) throw new Error('No active session.')

    const sale = this.db.get<{ id: string; status: string; sale_number: string }>(
      `SELECT id, status, sale_number FROM sales WHERE id = ? AND business_id = ? AND is_deleted = 0`,
      [saleId, businessId],
    )
    if (!sale) throw new Error('Sale not found.')
    if (sale.status === 'VOIDED') throw new Error(`Sale ${sale.sale_number} is already voided.`)

    const now = new Date().toISOString()

    // 1) Flip to VOIDED. The trg_sales_source_debt trigger writes off any linked receivable.
    this.db.run(
      `UPDATE sales SET status = 'VOIDED', voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ? WHERE id = ?`,
      [now, actorId, trimmed, now, saleId],
    )

    // 2) Restock + reversing movement per (product, variant); release serial units.
    const items = this.db.query<{
      product_id: string
      variant_id: string | null
      serial_unit_id: string | null
      quantity: number
    }>(
      `SELECT product_id, variant_id, serial_unit_id, quantity FROM sale_items WHERE sale_id = ? AND is_deleted = 0`,
      [saleId],
    )
    const byKey = new Map<string, { productId: string; variantId: string | null; qty: number }>()
    const soldSerialIds: string[] = []
    for (const it of items) {
      if (it.serial_unit_id) soldSerialIds.push(it.serial_unit_id)
      const key = `${it.product_id}:${it.variant_id ?? ''}`
      const cur = byKey.get(key) ?? { productId: it.product_id, variantId: it.variant_id, qty: 0 }
      cur.qty += it.quantity
      byKey.set(key, cur)
    }
    for (const { productId, variantId, qty } of byKey.values()) {
      const meta = this.db.get<{ track_inventory: number }>(
        `SELECT track_inventory FROM products WHERE id = ? AND business_id = ?`,
        [productId, businessId],
      )
      if (!meta?.track_inventory) continue
      if (variantId) {
        this.db.run(
          `UPDATE product_variants SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?`,
          [qty, now, variantId],
        )
      } else {
        this.db.run(
          `UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ? AND business_id = ?`,
          [qty, now, productId, businessId],
        )
      }
      recordStockMovement(
        this.db,
        businessId,
        productId,
        qty,
        {
          referenceType: 'sale',
          referenceId: saleId,
          notes: `Void ${sale.sale_number}`,
          type: 'VOID_REVERSAL',
        },
        now,
      )
    }
    if (soldSerialIds.length > 0) {
      const ph = soldSerialIds.map(() => '?').join(', ')
      this.db.run(
        `UPDATE product_serial_units SET status = 'IN_STOCK', sale_id = NULL, sold_at = NULL, customer_id = NULL, updated_at = ?
         WHERE id IN (${ph})`,
        [now, ...soldSerialIds],
      )
    }

    // 3) Refund any deposit (savings) draw-down.
    this.savings.reverseSaleUsage(saleId, now, actorId)

    // 4) Re-enqueue the sale as VOIDED so the API reverses server-side. Coalesces the
    //    existing ('sales', saleId) outbox row if the create hasn't synced yet.
    this.enqueueSale(
      saleId,
      businessId,
      this.buildVoidPayload(saleId, businessId, actorId, trimmed, now),
      now,
    )

    this.audit?.log({
      action: 'VOID',
      entityType: 'sale',
      entityId: saleId,
      entityLabel: sale.sale_number,
      changes: {
        before: { status: 'COMPLETED' },
        after: { status: 'VOIDED', voidReason: trimmed },
      },
    })
    this.onMutated()
    return this.get(saleId)!
  }

  /** Rebuild the full SaleSyncPayload from stored rows, stamped VOIDED, for the outbox. */
  private buildVoidPayload(
    saleId: string,
    businessId: string,
    actorId: string,
    reason: string,
    now: string,
  ): Record<string, unknown> {
    const s = this.db.get<{
      client_id: string
      sale_number: string
      sold_at: string
      cashier_id: string | null
      cashier_name: string | null
      customer_id: string | null
      customer_name: string | null
      customer_phone: string | null
      notes: string | null
      discount_amount: number
      charges_amount: number
      credit_amount: number
    }>(
      `SELECT client_id, sale_number, sold_at, cashier_id, cashier_name, customer_id, customer_name,
              customer_phone, notes, discount_amount, charges_amount, credit_amount
       FROM sales WHERE id = ? AND business_id = ?`,
      [saleId, businessId],
    )!
    const items = this.db.query<{
      id: string
      product_id: string
      variant_id: string | null
      variant_name: string | null
      serial_unit_id: string | null
      serial_number: string | null
      quantity: number
      unit_price: number
      discount_amount: number
      cost_price: number | null
    }>(
      `SELECT id, product_id, variant_id, variant_name, serial_unit_id, serial_number, quantity, unit_price, discount_amount, cost_price
       FROM sale_items WHERE sale_id = ? AND is_deleted = 0`,
      [saleId],
    )
    const payments = this.db.query<{
      id: string
      method: string
      amount: number
      mobile_money_reference: string | null
    }>(`SELECT id, method, amount, mobile_money_reference FROM sale_payments WHERE sale_id = ?`, [
      saleId,
    ])
    const charges = this.db.query<{
      id: string
      charge_type_id: string | null
      name: string
      rate_type: string
      rate_value: number
      amount: number
    }>(
      `SELECT id, charge_type_id, name, rate_type, rate_value, amount FROM sale_charges WHERE sale_id = ?`,
      [saleId],
    )
    const discounts = this.db.query<{
      id: string
      description: string
      discount_type: string
      rate: number | null
      amount: number
    }>(
      `SELECT id, description, discount_type, rate, amount FROM sale_discounts WHERE sale_id = ?`,
      [saleId],
    )
    return {
      clientId: s.client_id,
      saleNumber: s.sale_number,
      soldAt: s.sold_at,
      cashierId: s.cashier_id,
      cashierName: s.cashier_name,
      customerId: s.customer_id,
      customerName: s.customer_name,
      customerPhone: s.customer_phone,
      notes: s.notes,
      discountAmount: s.discount_amount,
      chargesAmount: s.charges_amount,
      creditAmount: s.credit_amount,
      status: 'VOIDED',
      voidedAt: now,
      voidedById: actorId,
      voidReason: reason,
      payments: payments.map((p) => ({
        id: p.id,
        method: p.method,
        amount: round2(p.amount),
        mobileMoneyReference: p.mobile_money_reference,
        savingsAccountId: null,
      })),
      items: items.map((e) => ({
        id: e.id,
        productId: e.product_id,
        variantId: e.variant_id,
        variantName: e.variant_name ?? undefined,
        serialUnitId: e.serial_unit_id,
        serialNumber: e.serial_number ?? undefined,
        quantity: e.quantity,
        unitPrice: e.unit_price,
        discountAmount: e.discount_amount,
        costPrice: e.cost_price ?? undefined,
        movementId: null,
      })),
      charges: charges.map((c) => ({
        id: c.id,
        chargeTypeId: c.charge_type_id,
        name: c.name,
        rateType: c.rate_type,
        rateValue: c.rate_value,
        amount: c.amount,
      })),
      discounts: discounts.map((d) => ({
        id: d.id,
        description: d.description,
        discountType: d.discount_type,
        rate: d.rate,
        amount: d.amount,
      })),
    }
  }

  /** Paginated sales history (newest first). */
  list(query: SalesListQuery = {}): PaginatedResult<LocalSale> {
    const businessId = this.getBusinessId()
    if (!businessId)
      return toPaginated<LocalSale>([], { total: 0, page: 1, limit: 20, totalPages: 1 })
    const { where, params } = this.buildWhere(businessId, query)
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

  /** Every sale matching the filters (newest first, no pagination) — for CSV export. */
  listAll(query: SalesListQuery = {}): LocalSale[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const { where, params } = this.buildWhere(businessId, query)
    const search = query.search?.trim()
    let sql = `SELECT ${SALE_COLS} FROM sales s WHERE ${where}`
    const args = [...params]
    if (search) {
      sql += ' AND (s.sale_number LIKE ? OR s.customer_name LIKE ?)'
      args.push(`%${search}%`, `%${search}%`)
    }
    sql += ' ORDER BY s.sold_at DESC'
    return this.db.query<SaleRow>(sql, args).map(toLocalSale)
  }

  /** KPI strip totals over the filtered date range (revenue, basket, units, refunds). */
  summary(query: SalesListQuery = {}): LocalSalesSummary {
    const currency = (() => {
      const bid = this.getBusinessId()
      return bid ? this.businessCurrency(bid) : 'XAF'
    })()
    const empty: LocalSalesSummary = {
      revenue: 0,
      transactions: 0,
      averageBasket: 0,
      itemsSold: 0,
      refundCount: 0,
      refundAmount: 0,
      currency,
    }
    const businessId = this.getBusinessId()
    if (!businessId) return empty
    // Completed sales drive revenue/basket/units; voided sales are the "refunds".
    const { where, params } = this.buildWhere(businessId, { ...query, status: undefined })
    const agg = this.db.get<{ revenue: number; txns: number; units: number }>(
      `SELECT COALESCE(SUM(s.total_amount), 0) AS revenue, COUNT(*) AS txns,
              COALESCE((SELECT SUM(si.quantity) FROM sale_items si
                        JOIN sales s2 ON s2.id = si.sale_id
                        WHERE ${where.replace(/\bs\./g, 's2.')} AND s2.status = 'COMPLETED' AND si.is_deleted = 0), 0) AS units
       FROM sales s WHERE ${where} AND s.status = 'COMPLETED'`,
      [...params, ...params],
    )
    const refunds = this.db.get<{ n: number; amt: number }>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(s.total_amount), 0) AS amt FROM sales s WHERE ${where} AND s.status = 'VOIDED'`,
      params,
    )
    const transactions = agg?.txns ?? 0
    const revenue = round2(agg?.revenue ?? 0)
    return {
      revenue,
      transactions,
      averageBasket: transactions > 0 ? round2(revenue / transactions) : 0,
      itemsSold: agg?.units ?? 0,
      refundCount: refunds?.n ?? 0,
      refundAmount: round2(refunds?.amt ?? 0),
      currency,
    }
  }

  /**
   * Daily sales series (one row per calendar day) for the Daily Sales Summary report.
   * Groups by the `sale_date` column and derives the payment split from sale_payments —
   * identical logic + column to the API getDailySeries, so both tie out once synced.
   */
  dailySeries(query: SalesListQuery = {}): DailySalesRow[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const conds = ['s.business_id = ?', 's.is_deleted = 0']
    const params: unknown[] = [businessId]
    if (query.dateFrom) {
      conds.push('s.sale_date >= ?')
      params.push(query.dateFrom)
    }
    if (query.dateTo) {
      conds.push('s.sale_date <= ?')
      params.push(query.dateTo)
    }
    const where = conds.join(' AND ')
    // Two grouped subqueries (sales-level totals + payment split) so a sale with multiple
    // payment rows doesn't multiply its total. `?` params are positional in SQLite → pass twice.
    const rows = this.db.query<{
      date: string
      txns: number
      total: number
      credit: number
      cash: number
      momo: number
      card: number
    }>(
      `SELECT d.sale_date AS date, d.txns, d.total, d.credit,
              COALESCE(p.cash, 0) AS cash, COALESCE(p.momo, 0) AS momo, COALESCE(p.card, 0) AS card
       FROM (
         SELECT s.sale_date, COUNT(*) AS txns,
                COALESCE(SUM(s.total_amount), 0) AS total,
                COALESCE(SUM(s.credit_amount), 0) AS credit
         FROM sales s WHERE ${where} AND s.status = 'COMPLETED'
         GROUP BY s.sale_date
       ) d
       LEFT JOIN (
         SELECT s.sale_date,
                SUM(CASE WHEN sp.method = 'CASH' THEN sp.amount ELSE 0 END) AS cash,
                SUM(CASE WHEN sp.method IN ('MTN_MOMO','ORANGE_MONEY') THEN sp.amount ELSE 0 END) AS momo,
                SUM(CASE WHEN sp.method = 'CARD' THEN sp.amount ELSE 0 END) AS card
         FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
         WHERE ${where} AND s.status = 'COMPLETED'
         GROUP BY s.sale_date
       ) p ON p.sale_date = d.sale_date
       ORDER BY d.sale_date ASC`,
      [...params, ...params],
    )
    return rows.map((r) => ({
      date: String(r.date).slice(0, 10),
      transactions: Number(r.txns ?? 0),
      total: round2(Number(r.total ?? 0)),
      cash: round2(Number(r.cash ?? 0)),
      momo: round2(Number(r.momo ?? 0)),
      card: round2(Number(r.card ?? 0)),
      credit: round2(Number(r.credit ?? 0)),
    }))
  }

  /**
   * Cashier performance roster (one row per cashier) for the range — mirrors the API
   * getCashierRoster (shifts = distinct sale_date days; refunds = VOIDED totals; discounts =
   * sale-level discount_amount) so both sides return identical rows once fully synced.
   */
  cashierRoster(query: SalesListQuery = {}): CashierPerformanceRow[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const conds = ['s.business_id = ?', 's.is_deleted = 0']
    const params: unknown[] = [businessId]
    if (query.dateFrom) {
      conds.push('s.sale_date >= ?')
      params.push(query.dateFrom)
    }
    if (query.dateTo) {
      conds.push('s.sale_date <= ?')
      params.push(query.dateTo)
    }
    const where = conds.join(' AND ')
    const rows = this.db.query<{
      cashier_id: string
      name: string | null
      shifts: number
      transactions: number
      sales: number
      refunds: number
      discounts: number
    }>(
      `SELECT s.cashier_id AS cashier_id, s.cashier_name AS name,
              COUNT(DISTINCT CASE WHEN s.status = 'COMPLETED' THEN s.sale_date END) AS shifts,
              COUNT(CASE WHEN s.status = 'COMPLETED' THEN 1 END) AS transactions,
              COALESCE(SUM(CASE WHEN s.status = 'COMPLETED' THEN s.total_amount ELSE 0 END), 0) AS sales,
              COALESCE(SUM(CASE WHEN s.status = 'VOIDED' THEN s.total_amount ELSE 0 END), 0) AS refunds,
              COALESCE(SUM(CASE WHEN s.status = 'COMPLETED' THEN s.discount_amount ELSE 0 END), 0) AS discounts
       FROM sales s
       WHERE ${where}
       GROUP BY s.cashier_id, s.cashier_name
       ORDER BY sales DESC`,
      params,
    )
    return rows.map((r) => ({
      cashierId: r.cashier_id,
      name: r.name || '—',
      shifts: Number(r.shifts ?? 0),
      transactions: Number(r.transactions ?? 0),
      sales: round2(Number(r.sales ?? 0)),
      refunds: round2(Number(r.refunds ?? 0)),
      discounts: round2(Number(r.discounts ?? 0)),
    }))
  }

  /** Shared sale_date-range WHERE for the report aggregations (parity with the API). */
  private reportWhere(
    businessId: string,
    query: SalesListQuery,
  ): { where: string; params: unknown[] } {
    const conds = ['s.business_id = ?', 's.is_deleted = 0']
    const params: unknown[] = [businessId]
    if (query.dateFrom) {
      conds.push('s.sale_date >= ?')
      params.push(query.dateFrom)
    }
    if (query.dateTo) {
      conds.push('s.sale_date <= ?')
      params.push(query.dateTo)
    }
    return { where: conds.join(' AND '), params }
  }

  /**
   * Sales by product (per-product revenue/COGS/margin) for the range — mirrors the API
   * getSalesByProduct (same sale_items aggregation + category join) so both tie out.
   */
  byProduct(query: SalesListQuery = {}): SalesByProductRow[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const { where, params } = this.reportWhere(businessId, query)
    const rows = this.db.query<{
      productId: string
      name: string
      category: string | null
      quantity: number
      revenue: number
      cogs: number
    }>(
      `SELECT si.product_id AS productId, si.product_name AS name, c.name AS category,
              COALESCE(SUM(si.quantity), 0) AS quantity,
              COALESCE(SUM(si.line_total), 0) AS revenue,
              COALESCE(SUM(COALESCE(si.cost_price, 0) * si.quantity), 0) AS cogs
       FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         LEFT JOIN products p ON p.id = si.product_id
         LEFT JOIN product_categories c ON c.id = p.category_id
       WHERE ${where} AND s.status = 'COMPLETED' AND si.is_deleted = 0
       GROUP BY si.product_id, si.product_name, c.name
       ORDER BY revenue DESC`,
      params,
    )
    return rows.map((r) => ({
      productId: r.productId,
      name: r.name,
      category: r.category ?? null,
      quantity: Number(r.quantity ?? 0),
      revenue: round2(Number(r.revenue ?? 0)),
      cogs: round2(Number(r.cogs ?? 0)),
    }))
  }

  /** Sales split by payment method for the range — mirrors the API getSalesByPaymentMethod. */
  byPaymentMethod(query: SalesListQuery = {}): SalesByPaymentRow[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const { where, params } = this.reportWhere(businessId, query)
    const rows = this.db.query<{ method: string; transactions: number; amount: number }>(
      `SELECT sp.method AS method, COUNT(DISTINCT sp.sale_id) AS transactions, COALESCE(SUM(sp.amount), 0) AS amount
       FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
       WHERE ${where} AND s.status = 'COMPLETED'
       GROUP BY sp.method
       ORDER BY amount DESC`,
      params,
    )
    return rows.map((r) => ({
      method: r.method,
      transactions: Number(r.transactions ?? 0),
      amount: round2(Number(r.amount ?? 0)),
    }))
  }

  /** Refunds & returns (VOIDED sales by reason + by cashier + gross sales) — mirrors the API. */
  refunds(query: SalesListQuery = {}): {
    byReason: RefundReasonRow[]
    byCashier: RefundCashierRow[]
    grossSales: number
  } {
    const businessId = this.getBusinessId()
    if (!businessId) return { byReason: [], byCashier: [], grossSales: 0 }
    const { where, params } = this.reportWhere(businessId, query)
    const byReason = this.db.query<{ reason: string | null; count: number; amount: number }>(
      `SELECT s.void_reason AS reason, COUNT(*) AS count, COALESCE(SUM(s.total_amount), 0) AS amount
       FROM sales s WHERE ${where} AND s.status = 'VOIDED'
       GROUP BY s.void_reason ORDER BY amount DESC`,
      params,
    )
    const byCashier = this.db.query<{
      cashierId: string
      name: string | null
      refunds: number
      sales: number
    }>(
      `SELECT s.cashier_id AS cashierId, s.cashier_name AS name,
              COALESCE(SUM(CASE WHEN s.status = 'VOIDED' THEN s.total_amount ELSE 0 END), 0) AS refunds,
              COALESCE(SUM(CASE WHEN s.status = 'COMPLETED' THEN s.total_amount ELSE 0 END), 0) AS sales
       FROM sales s
       WHERE ${where} AND s.status IN ('VOIDED', 'COMPLETED')
       GROUP BY s.cashier_id, s.cashier_name
       HAVING SUM(CASE WHEN s.status = 'VOIDED' THEN 1 ELSE 0 END) > 0
       ORDER BY refunds DESC`,
      params,
    )
    const gross = this.db.get<{ gross: number }>(
      `SELECT COALESCE(SUM(s.total_amount), 0) AS gross FROM sales s WHERE ${where} AND s.status = 'COMPLETED'`,
      params,
    )
    return {
      byReason: byReason.map((r) => ({
        reason: r.reason ?? null,
        count: Number(r.count ?? 0),
        amount: round2(Number(r.amount ?? 0)),
      })),
      byCashier: byCashier.map((r) => ({
        cashierId: r.cashierId,
        name: r.name || '—',
        refunds: round2(Number(r.refunds ?? 0)),
        sales: round2(Number(r.sales ?? 0)),
      })),
      grossSales: round2(Number(gross?.gross ?? 0)),
    }
  }

  /** Product revenue (Σ line totals) + COGS for completed sales — feeds the Income Statement. */
  grossProfit(query: SalesListQuery = {}): { revenue: number; cogs: number } {
    const businessId = this.getBusinessId()
    if (!businessId) return { revenue: 0, cogs: 0 }
    const { where, params } = this.reportWhere(businessId, query)
    const row = this.db.get<{ revenue: number; cogs: number }>(
      `SELECT COALESCE(SUM(si.line_total), 0) AS revenue,
              COALESCE(SUM(COALESCE(si.cost_price, 0) * si.quantity), 0) AS cogs
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE ${where} AND s.status = 'COMPLETED' AND si.is_deleted = 0`,
      params,
    )
    return { revenue: round2(Number(row?.revenue ?? 0)), cogs: round2(Number(row?.cogs ?? 0)) }
  }

  /** Shared WHERE for list/listAll/summary (excludes free-text search, which list() adds). */
  private buildWhere(
    businessId: string,
    query: SalesListQuery,
  ): { where: string; params: unknown[] } {
    let where = 's.business_id = ? AND s.is_deleted = 0'
    const params: unknown[] = [businessId]
    if (query.customerId) {
      where += ' AND s.customer_id = ?'
      params.push(query.customerId)
    }
    if (query.status) {
      where += ' AND s.status = ?'
      params.push(query.status)
    }
    // Channel filter (online vs in-store). Treat a null source as IN_STORE (pre-migration rows).
    if (query.source === 'ONLINE') where += " AND s.source = 'ONLINE'"
    else if (query.source === 'IN_STORE')
      where += " AND (s.source = 'IN_STORE' OR s.source IS NULL)"
    if (query.paymentMethod) {
      // "Credit" isn't a payment method (those rows have a null/charged method) — filter by
      // an outstanding balance instead; everything else is a straight method match.
      if (query.paymentMethod === 'CREDIT') where += ' AND s.credit_amount > 0'
      else {
        where += ' AND s.payment_method = ?'
        params.push(query.paymentMethod)
      }
    }
    // Compare on the LOCAL calendar day of sold_at (sale_date is stored as the UTC date, so
    // a straight string compare drops sales near the day boundary / in non-UTC zones).
    if (query.dateFrom) {
      where += " AND date(s.sold_at, 'localtime') >= ?"
      params.push(query.dateFrom)
    }
    if (query.dateTo) {
      where += " AND date(s.sold_at, 'localtime') <= ?"
      params.push(query.dateTo)
    }
    return { where, params }
  }

  get(id: string): LocalSaleDetail | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<SaleRow>(
      `SELECT ${SALE_COLS} FROM sales s WHERE s.id = ? AND s.business_id = ?`,
      [id, businessId],
    )
    if (!row) return null
    const items = this.db.query<{
      id: string
      product_id: string
      product_name: string
      variant_id: string | null
      variant_name: string | null
      serial_number: string | null
      quantity: number
      unit_price: number
      discount_amount: number
      line_total: number
    }>(
      `SELECT id, product_id, product_name, variant_id, variant_name, serial_number, quantity, unit_price, discount_amount, line_total
       FROM sale_items WHERE sale_id = ? AND is_deleted = 0 ORDER BY created_at ASC`,
      [id],
    )
    const payments = this.db.query<{
      id: string
      method: string
      amount: number
      mobile_money_reference: string | null
    }>(
      `SELECT id, method, amount, mobile_money_reference FROM sale_payments WHERE sale_id = ? ORDER BY created_at ASC`,
      [id],
    )
    return {
      ...toLocalSale(row),
      items: items.map<LocalSaleItem>((i) => ({
        id: i.id,
        productId: i.product_id,
        productName: i.product_name,
        variantId: i.variant_id,
        variantName: i.variant_name,
        serialNumber: i.serial_number,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        discountAmount: i.discount_amount,
        lineTotal: i.line_total,
      })),
      payments: payments.map<LocalSalePayment>((p) => ({
        id: p.id,
        method: p.method as LocalSalePayment['method'],
        amount: p.amount,
        mobileMoneyReference: p.mobile_money_reference,
      })),
    }
  }

  /** Build the shareable receipt view-model + the customer's contact channels (for send). */
  buildReceipt(
    saleId: string,
  ): { receipt: SaleReceipt; phone: string | null; email: string | null } | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const sale = this.get(saleId)
    if (!sale) return null
    const biz = this.db.get<{
      name: string
      phone: string | null
      email: string | null
      address: string | null
      city: string | null
    }>(`SELECT name, phone, email, address, city FROM local_businesses WHERE id = ?`, [businessId])
    let email: string | null = null
    let phone = sale.customerPhone
    if (sale.customerId) {
      const c = this.db.get<{ email: string | null; phone: string | null }>(
        `SELECT email, phone FROM contacts WHERE id = ?`,
        [sale.customerId],
      )
      email = c?.email ?? null
      phone = phone ?? c?.phone ?? null
    }
    const receipt: SaleReceipt = {
      businessName: biz?.name ?? 'BizTrack',
      businessPhone: biz?.phone ?? null,
      businessAddress: [biz?.address, biz?.city].filter(Boolean).join(', ') || null,
      saleNumber: sale.saleNumber,
      soldAt: sale.soldAt,
      cashierName: '',
      customerName: sale.customerId ? sale.customerName : null,
      customerPhone: sale.customerPhone,
      items: sale.items.map((i) => ({
        name: `${i.productName}${i.variantName ? ' · ' + i.variantName : ''}${i.serialNumber ? ' · ' + i.serialNumber : ''}`,
        qty: i.quantity,
        unitPrice: i.unitPrice,
        total: i.lineTotal,
      })),
      subtotal: sale.subtotal,
      discountAmount: sale.discountAmount,
      chargesAmount: sale.chargesAmount,
      totalAmount: sale.totalAmount,
      amountPaid: sale.amountPaid,
      creditAmount: sale.creditAmount,
      changeGiven: sale.changeGiven,
      currency: sale.currency,
      payments: sale.payments.map((p) => ({ method: p.method as PaymentMethod, amount: p.amount })),
    }
    return { receipt, phone, email }
  }

  // ---- internals -----------------------------------------------------------

  private requireProduct(productId: string, businessId: string): ProductMeta {
    const row = this.db.get<{
      name: string
      sku: string | null
      unit: string | null
      price: number
      cost_price: number | null
      is_serialized: number
      has_variants: number
      track_inventory: number
    }>(
      `SELECT p.name, p.sku, p.price, p.cost_price, p.is_serialized, p.track_inventory,
              (SELECT abbreviation FROM unit_of_measures u WHERE u.id = p.unit_of_measure_id) AS unit,
              EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_deleted = 0) AS has_variants
       FROM products p WHERE p.id = ? AND p.business_id = ? AND p.is_deleted = 0`,
      [productId, businessId],
    )
    if (!row) throw new Error('Product not found.')
    return {
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      price: row.price,
      cost: row.cost_price,
      isSerialized: row.is_serialized === 1,
      hasVariants: row.has_variants === 1,
      trackInventory: row.track_inventory === 1,
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
    const seq =
      this.db.get<{ last_sequence: number }>(
        `SELECT last_sequence FROM sale_number_sequences WHERE business_id = ? AND sale_date = ?`,
        [businessId, date],
      )?.last_sequence ?? 1
    return `VTE-${date.replace(/-/g, '')}-${String(seq).padStart(4, '0')}`
  }

  private businessCurrency(businessId: string): string {
    return (
      this.db.get<{ currency: string }>(`SELECT currency FROM local_businesses WHERE id = ?`, [
        businessId,
      ])?.currency ?? 'XAF'
    )
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }

  private enqueueSale(
    recordId: string,
    businessId: string,
    payload: Record<string, unknown>,
    now: string,
  ): void {
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'sales', ?, 'UPSERT', ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [
        randomUUID(),
        recordId,
        JSON.stringify({ saleId: recordId, businessId, ...payload }),
        now,
        now,
      ],
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
    source: r.source,
    notes: r.notes,
    soldAt: r.sold_at,
    createdAt: r.created_at,
    itemCount: r.item_count,
    syncStatus: r.sync_status === 'pending' ? 'pending' : 'synced',
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
