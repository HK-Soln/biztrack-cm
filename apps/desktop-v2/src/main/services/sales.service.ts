import { randomUUID } from 'crypto'
import { PaymentMethod } from '@biztrack/types'
import {
  allocateProRata,
  evaluateDiscountAuthorization,
  isBelowCost,
  toWholeXaf,
  type RoleDiscountLimits,
} from '@biztrack/utils'
import type { SaleReceipt } from '@biztrack/types'
import type { DatabaseService } from '@biztrack/electron-core'
import { localBusinessDate } from './business-calendar'
import type {
  CashierPerformanceRow,
  DailySalesRow,
  DiscountSummary,
  DiscountByCashierRow,
  DiscountByProductRow,
  FlaggedDiscountRow,
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
    /** The device's live cash session id, for tagging the sale to a shift (BIZ-2.2).
     * Null when no shift is open ("vente hors caisse"). */
    private readonly getOpenCashSessionId: () => string | null = () => null,
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
    // Tag the sale to the open shift (BIZ-2.2). NULL = rung outside a session
    // ("vente hors caisse"). Drives the expected-cash reconciliation.
    const cashSessionId = this.getOpenCashSessionId()
    // Local trading day (BIZ-5.1): a sale rung in an open shift inherits that shift's day (so a
    // shift straddling midnight stays one day); otherwise compute from the local calendar.
    let businessDate = localBusinessDate(soldAt)
    if (cashSessionId) {
      const shift = this.db.get<{ business_date: string | null }>(
        `SELECT business_date FROM cash_sessions WHERE id = ?`,
        [cashSessionId],
      )
      if (shift?.business_date) businessDate = shift.business_date
    }

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
      unitPriceListed: number
      cartDiscountAlloc: number
      discountAmount: number
      lineTotal: number
      costPrice: number | null
      reasonCode: string | null
      reasonNote: string | null
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
      const unitPrice = toWholeXaf(line.unitPrice)
      if (!Number.isFinite(unitPrice) || unitPrice < 0)
        throw new Error(`Invalid price for “${meta.name}”.`)
      // Catalogue price snapshot; the charged price is the fallback when the cart did
      // not capture a separate listed price. cart_discount_alloc is 0 until BIZ-1.3.
      const unitPriceListed = toWholeXaf(line.unitPriceListed ?? unitPrice)
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
            unitPriceListed,
            cartDiscountAlloc: 0,
            discountAmount: 0,
            lineTotal: unitPrice,
            costPrice: cost,
            reasonCode: line.reasonCode ?? null,
            reasonNote: line.reasonNote ?? null,
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
        const lineDiscount = toWholeXaf(Math.max(0, line.discountAmount ?? 0))
        const cartDiscountAlloc = 0
        const lineTotal = toWholeXaf(
          Math.max(0, unitPrice * qty - lineDiscount - cartDiscountAlloc),
        )
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
          unitPriceListed,
          cartDiscountAlloc,
          discountAmount: lineDiscount,
          lineTotal,
          costPrice: cost,
          reasonCode: line.reasonCode ?? null,
          reasonNote: line.reasonNote ?? null,
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

    // BIZ-1.2 OVERRIDE model: rung at the listed price, with any bargain folded into
    // discount_amount + a LINE-scoped sale_discounts row, so each line's discount_amount
    // reconciles with its discount rows. lineTotal is unchanged (listed*qty − discount ===
    // charged*qty − explicit). A charged price at/above listed stays a markup, no override.
    const lineDiscountRows: Array<{
      id: string
      saleItemId: string
      description: string
      discountType: string
      amount: number
      reasonCode: string | null
      reasonNote: string | null
    }> = []
    for (const e of emits) {
      const explicit = e.discountAmount
      const overrideGap =
        e.unitPrice < e.unitPriceListed
          ? toWholeXaf((e.unitPriceListed - e.unitPrice) * e.quantity)
          : 0
      if (overrideGap > 0) {
        e.unitPrice = e.unitPriceListed
        e.discountAmount = toWholeXaf(overrideGap + explicit)
        lineDiscountRows.push({
          id: randomUUID(),
          saleItemId: e.id,
          description: 'Prix négocié',
          discountType: 'OVERRIDE',
          amount: overrideGap,
          reasonCode: e.reasonCode ?? 'NEGOTIATED',
          reasonNote: e.reasonNote,
        })
      }
      if (explicit > 0) {
        lineDiscountRows.push({
          id: randomUUID(),
          saleItemId: e.id,
          description: 'Remise',
          discountType: 'FIXED_AMOUNT',
          amount: explicit,
          reasonCode: null,
          reasonNote: null,
        })
      }
    }

    // --- settlement (tax 0; matches the API computeSale) ----------------------
    const subtotal = toWholeXaf(emits.reduce((s, e) => s + e.lineTotal, 0))
    const discountLines = (input.discounts ?? []).map((d) => ({
      ...d,
      id: d.id ?? randomUUID(),
      amount: toWholeXaf(Math.max(0, d.amount)),
    }))
    const chargeLines = (input.charges ?? []).map((c) => ({
      ...c,
      id: c.id ?? randomUUID(),
      amount: toWholeXaf(Math.max(0, c.amount)),
    }))
    const discountAmount = toWholeXaf(
      Math.min(
        subtotal,
        discountLines.reduce((s, d) => s + d.amount, 0),
      ),
    )
    const chargesAmount = toWholeXaf(chargeLines.reduce((s, c) => s + c.amount, 0))
    const totalAmount = toWholeXaf(Math.max(0, subtotal - discountAmount + chargesAmount))

    // BIZ-1.3: allocate the cart-level discount across lines (weight = line total),
    // remainder to the largest line, folding each share into that line's total. Uses
    // the same shared helper as the API so both runtimes agree.
    if (discountAmount > 0 && emits.length > 0) {
      const allocations = allocateProRata(
        discountAmount,
        emits.map((e) => e.lineTotal),
      )
      emits.forEach((e, i) => {
        e.cartDiscountAlloc = allocations[i] ?? 0
        e.lineTotal = toWholeXaf(Math.max(0, e.lineTotal - e.cartDiscountAlloc))
      })
    }

    // BIZ-1.4: evaluate the cashier's role discount limits (offline, from the synced
    // roles table). Over-limit discounts still complete (APPROVE) but are flagged
    // unauthorized unless a manager authorized them via step-up. Same shared evaluator
    // as the API, so both runtimes agree.
    const authorizedBy = input.authorizedByUserId ?? null
    const { overLimit } = evaluateDiscountAuthorization(this.roleLimits(businessId, cashierId), {
      lines: emits.map((e) => ({
        discountAmount: e.discountAmount,
        listedLineValue: toWholeXaf(e.unitPriceListed * e.quantity),
      })),
      cartDiscount: discountAmount,
      subtotal,
    })
    // BIZ-1.5: a line sold below its cost needs the same authorization unless the role
    // may sell below cost. The effective charged unit price nets the line discount; a
    // null cost is skipped. Cost stays in main — it never reaches the renderer.
    const belowCost = isBelowCost(
      emits.map((e) => ({
        chargedUnitPrice:
          e.quantity > 0 ? (e.unitPrice * e.quantity - e.discountAmount) / e.quantity : 0,
        cost: e.costPrice,
      })),
    )
    const discountUnauthorized =
      (overLimit || (belowCost && !this.roleAllowsBelowCost(businessId, cashierId))) &&
      !authorizedBy

    const paymentLines = (input.payments ?? []).filter(
      (p) => Number.isFinite(p.amount) && p.amount > 0,
    )
    const amountPaid = toWholeXaf(paymentLines.reduce((s, p) => s + p.amount, 0))
    const creditAmount = toWholeXaf(Math.max(0, totalAmount - amountPaid))
    const changeGiven = toWholeXaf(Math.max(0, amountPaid - totalAmount))

    // One stable id per payment, shared by the local sale_payments row AND the sync payload.
    // If the payload minted fresh ids, the pushed sale echoing back on pull would upsert on
    // an id the local row doesn't have and INSERT a second payment — double-counting the
    // cash it represents in the drawer's expected total. Same id on both sides = idempotent.
    const paymentRows = paymentLines.map((p) => ({ ...p, id: randomUUID() }))

    const customerId = input.customerId?.trim() || null
    if (creditAmount > 0 && !customerId)
      throw new Error('Credit sales must be linked to a registered customer.')
    // Optional expected payment date for the credit portion; when omitted the debt falls
    // back to created_at + the business's default credit period (D9).
    const creditDueDate = input.creditDueDate?.trim() || null

    // Deposit (savings) payments must reference an account with enough balance — validate
    // up front so a shortfall can never leave a half-written sale.
    const savingsNeed = new Map<string, number>()
    for (const p of paymentLines) {
      if (p.method === PaymentMethod.SAVINGS) {
        if (!p.savingsAccountId) throw new Error('Deposit payment is missing the savings account.')
        savingsNeed.set(
          p.savingsAccountId,
          toWholeXaf((savingsNeed.get(p.savingsAccountId) ?? 0) + p.amount),
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
         sold_at, cash_session_id, business_date, status, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', 0, ?, ?)`,
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
        cashSessionId,
        businessDate,
        now,
        now,
      ],
    )

    for (const e of emits) {
      this.db.run(
        `INSERT INTO sale_items
          (id, sale_id, business_id, product_id, product_name, product_sku, unit_of_measure, variant_id, variant_name,
           serial_unit_id, serial_number, quantity, unit_price, unit_price_listed, cart_discount_alloc, discount_amount,
           line_total, total_price, cost_price, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
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
          e.unitPriceListed,
          e.cartDiscountAlloc,
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
        `INSERT INTO sale_discounts
          (id, sale_id, sale_item_id, business_id, description, discount_type, rate, amount,
           reason_code, reason_note, applied_by, authorized_by, unauthorized, below_cost, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          d.id,
          saleId,
          d.saleItemId ?? null,
          businessId,
          d.description,
          d.discountType,
          d.rate ?? null,
          d.amount,
          d.reasonCode ?? null,
          d.reasonNote ?? null,
          cashierId,
          authorizedBy,
          discountUnauthorized ? 1 : 0,
          belowCost ? 1 : 0,
          now,
        ],
      )
    }
    for (const d of lineDiscountRows) {
      this.db.run(
        `INSERT INTO sale_discounts
          (id, sale_id, sale_item_id, business_id, description, discount_type, rate, amount,
           reason_code, reason_note, applied_by, authorized_by, unauthorized, below_cost, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          d.id,
          saleId,
          d.saleItemId,
          businessId,
          d.description,
          d.discountType,
          d.amount,
          d.reasonCode,
          d.reasonNote,
          cashierId,
          authorizedBy,
          discountUnauthorized ? 1 : 0,
          belowCost ? 1 : 0,
          now,
        ],
      )
    }
    for (const p of paymentRows) {
      this.db.run(
        `INSERT INTO sale_payments (id, sale_id, business_id, method, amount, mobile_money_reference, business_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          saleId,
          businessId,
          p.method,
          toWholeXaf(p.amount),
          p.mobileMoneyReference ?? null,
          businessDate,
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
          amount: toWholeXaf(p.amount),
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
        {
          referenceType: 'sale',
          referenceId: saleId,
          variantId: d.variantId ?? null,
          notes: `Sale ${saleNumber}`,
          type: 'SALE',
        },
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
        cashSessionId,
        cashierId,
        cashierName: this.getActorName(),
        customerId,
        customerName,
        customerPhone,
        notes,
        discountAmount,
        chargesAmount,
        creditAmount,
        creditDueDate,
        status: 'COMPLETED',
        payments: paymentRows.map((p) => ({
          id: p.id,
          method: p.method,
          amount: toWholeXaf(p.amount),
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
        discounts: [
          ...discountLines.map((d) => ({
            id: d.id,
            description: d.description,
            discountType: d.discountType,
            rate: d.rate ?? null,
            amount: d.amount,
            saleItemId: d.saleItemId ?? null,
            reasonCode: d.reasonCode ?? null,
            reasonNote: d.reasonNote ?? null,
            appliedBy: cashierId,
            authorizedBy,
            unauthorized: discountUnauthorized,
            belowCost,
          })),
          ...lineDiscountRows.map((d) => ({
            id: d.id,
            description: d.description,
            discountType: d.discountType,
            rate: null,
            amount: d.amount,
            saleItemId: d.saleItemId,
            reasonCode: d.reasonCode,
            reasonNote: d.reasonNote,
            appliedBy: cashierId,
            authorizedBy,
            unauthorized: discountUnauthorized,
            belowCost,
          })),
        ],
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
        dueDate: creditDueDate,
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
    // BIZ-2.9: a flagged discount (unauthorized or below-cost) is separately auditable.
    if (discountUnauthorized || belowCost) {
      this.audit?.log({
        action: 'DISCOUNT_APPLIED',
        entityType: 'sale',
        entityId: saleId,
        entityLabel: saleNumber,
        amount: toWholeXaf(discountAmount + emits.reduce((sum, e) => sum + e.discountAmount, 0)),
        changes: { before: null, after: { unauthorized: discountUnauthorized, belowCost } },
      })
    }
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

    const sale = this.db.get<{
      id: string
      status: string
      sale_number: string
      total_amount: number
    }>(
      `SELECT id, status, sale_number, total_amount FROM sales WHERE id = ? AND business_id = ? AND is_deleted = 0`,
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
          variantId,
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
      action: 'SALE_VOIDED',
      entityType: 'sale',
      entityId: saleId,
      entityLabel: sale.sale_number,
      amount: sale.total_amount,
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
        amount: toWholeXaf(p.amount),
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
    const revenue = toWholeXaf(agg?.revenue ?? 0)
    return {
      revenue,
      transactions,
      averageBasket: transactions > 0 ? toWholeXaf(revenue / transactions) : 0,
      itemsSold: agg?.units ?? 0,
      refundCount: refunds?.n ?? 0,
      refundAmount: toWholeXaf(refunds?.amt ?? 0),
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
    // BIZ-5.1: bucket by the local trading day (business_date), fallback to the UTC sale_date
    // for pre-migration rows. Kept identical to the API getDailySeries so synced rows tie out.
    const day = 'COALESCE(s.business_date, s.sale_date)'
    const conds = ['s.business_id = ?', 's.is_deleted = 0']
    const params: unknown[] = [businessId]
    if (query.dateFrom) {
      conds.push(`${day} >= ?`)
      params.push(query.dateFrom)
    }
    if (query.dateTo) {
      conds.push(`${day} <= ?`)
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
      `SELECT d.bday AS date, d.txns, d.total, d.credit,
              COALESCE(p.cash, 0) AS cash, COALESCE(p.momo, 0) AS momo, COALESCE(p.card, 0) AS card
       FROM (
         SELECT ${day} AS bday, COUNT(*) AS txns,
                COALESCE(SUM(s.total_amount), 0) AS total,
                COALESCE(SUM(s.credit_amount), 0) AS credit
         FROM sales s WHERE ${where} AND s.status = 'COMPLETED'
         GROUP BY ${day}
       ) d
       LEFT JOIN (
         SELECT ${day} AS bday,
                SUM(CASE WHEN sp.method = 'CASH' THEN sp.amount ELSE 0 END) AS cash,
                SUM(CASE WHEN sp.method IN ('MTN_MOMO','ORANGE_MONEY') THEN sp.amount ELSE 0 END) AS momo,
                SUM(CASE WHEN sp.method = 'CARD' THEN sp.amount ELSE 0 END) AS card
         FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
         WHERE ${where} AND s.status = 'COMPLETED'
         GROUP BY ${day}
       ) p ON p.bday = d.bday
       ORDER BY d.bday ASC`,
      [...params, ...params],
    )
    return rows.map((r) => ({
      date: String(r.date).slice(0, 10),
      transactions: Number(r.txns ?? 0),
      total: toWholeXaf(Number(r.total ?? 0)),
      cash: toWholeXaf(Number(r.cash ?? 0)),
      momo: toWholeXaf(Number(r.momo ?? 0)),
      card: toWholeXaf(Number(r.card ?? 0)),
      credit: toWholeXaf(Number(r.credit ?? 0)),
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
    // BIZ-5.1: trading day = business_date (fallback sale_date). "shifts" = distinct days.
    const day = 'COALESCE(s.business_date, s.sale_date)'
    const conds = ['s.business_id = ?', 's.is_deleted = 0']
    const params: unknown[] = [businessId]
    if (query.dateFrom) {
      conds.push(`${day} >= ?`)
      params.push(query.dateFrom)
    }
    if (query.dateTo) {
      conds.push(`${day} <= ?`)
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
              COUNT(DISTINCT CASE WHEN s.status = 'COMPLETED' THEN ${day} END) AS shifts,
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
      sales: toWholeXaf(Number(r.sales ?? 0)),
      refunds: toWholeXaf(Number(r.refunds ?? 0)),
      discounts: toWholeXaf(Number(r.discounts ?? 0)),
    }))
  }

  /** Shared trading-day-range WHERE for the report aggregations (parity with the API):
   *  business_date, falling back to the UTC sale_date for pre-migration rows (BIZ-5.1). */
  private reportWhere(
    businessId: string,
    query: SalesListQuery,
  ): { where: string; params: unknown[] } {
    const day = 'COALESCE(s.business_date, s.sale_date)'
    const conds = ['s.business_id = ?', 's.is_deleted = 0']
    const params: unknown[] = [businessId]
    if (query.dateFrom) {
      conds.push(`${day} >= ?`)
      params.push(query.dateFrom)
    }
    if (query.dateTo) {
      conds.push(`${day} <= ?`)
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
      revenue: toWholeXaf(Number(r.revenue ?? 0)),
      cogs: toWholeXaf(Number(r.cogs ?? 0)),
    }))
  }

  // ── Discount reports (BIZ-1.7) ────────────────────────────────────────────
  // All read the LOCAL sale_discounts rows written at checkout, joined to sales for
  // the sale_date period filter (parity with the other report methods). Gross sales
  // is booked net revenue (SUM(total_amount)); the discount rate is discount / gross.

  /** Headline discount figures for the range (Discount Summary report). */
  discountSummary(query: SalesListQuery = {}): DiscountSummary {
    const empty: DiscountSummary = {
      totalDiscount: 0,
      grossSales: 0,
      saleCount: 0,
      discountedSaleCount: 0,
      unauthorizedCount: 0,
      belowCostCount: 0,
      byReason: [],
    }
    const businessId = this.getBusinessId()
    if (!businessId) return empty
    const { where, params } = this.reportWhere(businessId, query)

    const disc = this.db.get<{
      total: number
      discountedSales: number
      unauthorized: number
      belowCost: number
    }>(
      `SELECT COALESCE(SUM(sd.amount), 0) AS total,
              COUNT(DISTINCT sd.sale_id) AS discountedSales,
              COALESCE(SUM(sd.unauthorized), 0) AS unauthorized,
              COALESCE(SUM(sd.below_cost), 0) AS belowCost
       FROM sale_discounts sd JOIN sales s ON s.id = sd.sale_id
       WHERE ${where} AND s.status = 'COMPLETED'`,
      params,
    )
    const gross = this.db.get<{ gross: number; saleCount: number }>(
      `SELECT COALESCE(SUM(s.total_amount), 0) AS gross, COUNT(*) AS saleCount
       FROM sales s WHERE ${where} AND s.status = 'COMPLETED'`,
      params,
    )
    const byReason = this.db.query<{ reasonCode: string | null; count: number; amount: number }>(
      `SELECT sd.reason_code AS reasonCode, COUNT(*) AS count, COALESCE(SUM(sd.amount), 0) AS amount
       FROM sale_discounts sd JOIN sales s ON s.id = sd.sale_id
       WHERE ${where} AND s.status = 'COMPLETED'
       GROUP BY sd.reason_code
       ORDER BY amount DESC`,
      params,
    )
    return {
      totalDiscount: toWholeXaf(Number(disc?.total ?? 0)),
      grossSales: toWholeXaf(Number(gross?.gross ?? 0)),
      saleCount: Number(gross?.saleCount ?? 0),
      discountedSaleCount: Number(disc?.discountedSales ?? 0),
      unauthorizedCount: Number(disc?.unauthorized ?? 0),
      belowCostCount: Number(disc?.belowCost ?? 0),
      byReason: byReason.map((r) => ({
        reasonCode: r.reasonCode ?? null,
        count: Number(r.count ?? 0),
        amount: toWholeXaf(Number(r.amount ?? 0)),
      })),
    }
  }

  /** Discount total + gross + flagged count per cashier (Discounts by Cashier report). */
  discountsByCashier(query: SalesListQuery = {}): DiscountByCashierRow[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const { where, params } = this.reportWhere(businessId, query)
    // Discount and gross are aggregated separately to avoid a join fan-out (a sale
    // with N discount rows would multiply its total_amount N times), then merged.
    const disc = this.db.query<{
      cashierId: string
      cashierName: string | null
      discountTotal: number
      unauthorized: number
      discountCount: number
    }>(
      `SELECT s.cashier_id AS cashierId, s.cashier_name AS cashierName,
              COALESCE(SUM(sd.amount), 0) AS discountTotal,
              COALESCE(SUM(sd.unauthorized), 0) AS unauthorized,
              COUNT(*) AS discountCount
       FROM sale_discounts sd JOIN sales s ON s.id = sd.sale_id
       WHERE ${where} AND s.status = 'COMPLETED'
       GROUP BY s.cashier_id, s.cashier_name`,
      params,
    )
    const gross = this.db.query<{ cashierId: string; grossSales: number }>(
      `SELECT s.cashier_id AS cashierId, COALESCE(SUM(s.total_amount), 0) AS grossSales
       FROM sales s WHERE ${where} AND s.status = 'COMPLETED'
       GROUP BY s.cashier_id`,
      params,
    )
    const grossBy = new Map(gross.map((g) => [g.cashierId, toWholeXaf(Number(g.grossSales ?? 0))]))
    return disc.map((r) => ({
      cashierId: r.cashierId,
      cashierName: r.cashierName ?? '—',
      discountTotal: toWholeXaf(Number(r.discountTotal ?? 0)),
      grossSales: grossBy.get(r.cashierId) ?? 0,
      unauthorizedCount: Number(r.unauthorized ?? 0),
      discountCount: Number(r.discountCount ?? 0),
    }))
  }

  /** Discount total + margin-after-discount per product (Discounts by Product report).
   * Only LINE-scoped discounts map to a product (sale_item_id → sale_items → products);
   * cart-level discounts have no product and are excluded. */
  discountsByProduct(query: SalesListQuery = {}): DiscountByProductRow[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const { where, params } = this.reportWhere(businessId, query)
    // Discount per product from the line-scoped discount rows…
    const disc = this.db.query<{
      productId: string
      name: string
      category: string | null
      discountTotal: number
      discountCount: number
    }>(
      `SELECT si.product_id AS productId, si.product_name AS name, c.name AS category,
              COALESCE(SUM(sd.amount), 0) AS discountTotal, COUNT(*) AS discountCount
       FROM sale_discounts sd
         JOIN sale_items si ON si.id = sd.sale_item_id
         JOIN sales s ON s.id = sd.sale_id
         LEFT JOIN products p ON p.id = si.product_id
         LEFT JOIN product_categories c ON c.id = p.category_id
       WHERE ${where} AND s.status = 'COMPLETED' AND sd.sale_item_id IS NOT NULL
       GROUP BY si.product_id, si.product_name, c.name`,
      params,
    )
    // …and revenue/COGS per product from the line totals, merged in for margin.
    const rev = this.db.query<{ productId: string; revenue: number; cogs: number }>(
      `SELECT si.product_id AS productId,
              COALESCE(SUM(si.line_total), 0) AS revenue,
              COALESCE(SUM(COALESCE(si.cost_price, 0) * si.quantity), 0) AS cogs
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE ${where} AND s.status = 'COMPLETED' AND si.is_deleted = 0
       GROUP BY si.product_id`,
      params,
    )
    const revBy = new Map(
      rev.map((r) => [
        r.productId,
        { revenue: toWholeXaf(Number(r.revenue ?? 0)), cogs: toWholeXaf(Number(r.cogs ?? 0)) },
      ]),
    )
    return disc.map((r) => ({
      productId: r.productId,
      name: r.name,
      category: r.category ?? null,
      discountTotal: toWholeXaf(Number(r.discountTotal ?? 0)),
      discountCount: Number(r.discountCount ?? 0),
      revenue: revBy.get(r.productId)?.revenue ?? 0,
      cogs: revBy.get(r.productId)?.cogs ?? 0,
    }))
  }

  /** Over-limit (unauthorized) and below-cost discount rows, most recent first
   * (Flagged Discounts report — the owner's red list). */
  flaggedDiscounts(query: SalesListQuery = {}): FlaggedDiscountRow[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const { where, params } = this.reportWhere(businessId, query)
    const rows = this.db.query<{
      id: string
      saleId: string
      saleNumber: string
      soldAt: string
      cashierName: string | null
      amount: number
      reasonCode: string | null
      unauthorized: number
      belowCost: number
      authorizedBy: string | null
    }>(
      `SELECT sd.id AS id, s.id AS saleId, s.sale_number AS saleNumber, s.sold_at AS soldAt,
              s.cashier_name AS cashierName, sd.amount AS amount, sd.reason_code AS reasonCode,
              sd.unauthorized AS unauthorized, sd.below_cost AS belowCost,
              sd.authorized_by AS authorizedBy
       FROM sale_discounts sd JOIN sales s ON s.id = sd.sale_id
       WHERE ${where} AND s.status = 'COMPLETED' AND (sd.unauthorized = 1 OR sd.below_cost = 1)
       ORDER BY s.sold_at DESC
       LIMIT 300`,
      params,
    )
    return rows.map((r) => ({
      id: r.id,
      saleId: r.saleId,
      saleNumber: r.saleNumber,
      soldAt: r.soldAt,
      cashierName: r.cashierName ?? null,
      amount: toWholeXaf(Number(r.amount ?? 0)),
      reasonCode: r.reasonCode ?? null,
      unauthorized: !!r.unauthorized,
      belowCost: !!r.belowCost,
      authorized: !!r.authorizedBy,
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
      amount: toWholeXaf(Number(r.amount ?? 0)),
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
        amount: toWholeXaf(Number(r.amount ?? 0)),
      })),
      byCashier: byCashier.map((r) => ({
        cashierId: r.cashierId,
        name: r.name || '—',
        refunds: toWholeXaf(Number(r.refunds ?? 0)),
        sales: toWholeXaf(Number(r.sales ?? 0)),
      })),
      grossSales: toWholeXaf(Number(gross?.gross ?? 0)),
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
    return {
      revenue: toWholeXaf(Number(row?.revenue ?? 0)),
      cogs: toWholeXaf(Number(row?.cogs ?? 0)),
    }
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
    // BIZ-5.1: filter by the local trading day (business_date, computed with the business
    // timezone + cutover), falling back to the UTC sale_date for pre-migration rows. This
    // replaces the old machine-localtime approximation on sold_at.
    if (query.dateFrom) {
      where += ' AND COALESCE(s.business_date, s.sale_date) >= ?'
      params.push(query.dateFrom)
    }
    if (query.dateTo) {
      where += ' AND COALESCE(s.business_date, s.sale_date) <= ?'
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
      unit_price_listed: number | null
      discount_amount: number
      line_total: number
    }>(
      `SELECT id, product_id, product_name, variant_id, variant_name, serial_number, quantity, unit_price, unit_price_listed, discount_amount, line_total
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
        unitPriceListed: i.unit_price_listed,
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
  /**
   * Record a receipt REPRINT (BIZ-2.9). Reprinting a completed sale's receipt is a known
   * fraud vector (a second cash copy), so it's audited. The initial print at checkout passes
   * reprint=false and does not reach here.
   */
  logReceiptReprint(saleId: string): void {
    const businessId = this.getBusinessId()
    if (!businessId) return
    const row = this.db.get<{ sale_number: string; total_amount: number }>(
      `SELECT sale_number, total_amount FROM sales WHERE id = ? AND business_id = ? AND is_deleted = 0`,
      [saleId, businessId],
    )
    if (!row) return
    this.audit?.log({
      action: 'RECEIPT_REPRINTED',
      entityType: 'sale',
      entityId: saleId,
      entityLabel: row.sale_number,
      amount: row.total_amount,
    })
  }

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
        unitPriceListed: i.unitPriceListed,
        discountAmount: i.discountAmount,
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

  /** The current cashier's role discount limits — for the renderer to detect an
   * over-limit discount at checkout and prompt manager step-up before submitting. */
  myDiscountLimits(): RoleDiscountLimits {
    return this.roleLimits(this.requireBusinessId(), this.getActorId())
  }

  /**
   * Whether any cart line would sell below cost AND the cashier's role may not — i.e.
   * the sale needs manager authorization on margin grounds (BIZ-1.5). Resolves cost
   * entirely in the main process and returns only a boolean, so the cost figure NEVER
   * reaches the renderer/cashier. Returns false when the role allows below-cost sales.
   */
  belowCostNeedsAuth(
    lines: Array<{ productId: string; variantId?: string | null; unitPrice: number }>,
  ): boolean {
    const businessId = this.requireBusinessId()
    if (this.roleAllowsBelowCost(businessId, this.getActorId())) return false
    const withCost = lines.map((l) => {
      const product = this.db.get<{ cost_price: number | null }>(
        `SELECT cost_price FROM products WHERE id = ? AND business_id = ? AND is_deleted = 0`,
        [l.productId, businessId],
      )
      let cost = product?.cost_price ?? null
      if (l.variantId) {
        const v = this.db.get<{ cost_price_override: number | null }>(
          `SELECT cost_price_override FROM product_variants WHERE id = ? AND product_id = ? AND is_deleted = 0`,
          [l.variantId, l.productId],
        )
        if (v?.cost_price_override != null) cost = v.cost_price_override
      }
      return { chargedUnitPrice: l.unitPrice, cost }
    })
    return isBelowCost(withCost)
  }

  /** Whether the cashier's role may sell below cost without a manager PIN (BIZ-1.5).
   * Resolved in main from the synced roles table; cost never reaches the renderer. */
  private roleAllowsBelowCost(businessId: string, userId: string | null): boolean {
    if (!userId) return false
    const row = this.db.get<{ allow_below_cost: number }>(
      `SELECT r.allow_below_cost
         FROM business_members m
         JOIN roles r ON r.id = m.role_id AND r.is_deleted = 0
        WHERE m.business_id = ? AND m.user_id = ? AND m.is_deleted = 0
        LIMIT 1`,
      [businessId, userId],
    )
    return !!row?.allow_below_cost
  }

  /** The cashier's role discount limits from the synced roles table (null = no limit,
   * so a role-less member or a member on a limitless role is unrestricted). */
  private roleLimits(businessId: string, userId: string | null): RoleDiscountLimits {
    const none: RoleDiscountLimits = {
      maxDiscountPercent: null,
      maxCartDiscountPercent: null,
      maxDiscountAmountXaf: null,
    }
    if (!userId) return none
    const row = this.db.get<{
      max_discount_percent: number | null
      max_cart_discount_percent: number | null
      max_discount_amount_xaf: number | null
    }>(
      `SELECT r.max_discount_percent, r.max_cart_discount_percent, r.max_discount_amount_xaf
         FROM business_members m
         JOIN roles r ON r.id = m.role_id AND r.is_deleted = 0
        WHERE m.business_id = ? AND m.user_id = ? AND m.is_deleted = 0
        LIMIT 1`,
      [businessId, userId],
    )
    if (!row) return none
    return {
      maxDiscountPercent: row.max_discount_percent,
      maxCartDiscountPercent: row.max_cart_discount_percent,
      maxDiscountAmountXaf: row.max_discount_amount_xaf,
    }
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
