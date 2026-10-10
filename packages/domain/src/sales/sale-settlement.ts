// ---------------------------------------------------------------------------
// Sale settlement — how a sale was paid, what is still owed, and what a return
// gives back. `priceSale` says what a sale is worth; these functions say how it is
// settled. Every runtime (API REST, the sync applier, desktop, mobile) uses them, so
// paid, credit, change and refund amounts cannot differ between the till and the server.
// ---------------------------------------------------------------------------

import { PaymentMethod, SalePaymentKind, SaleStatus } from '@biztrack/types'
import { toWholeXaf } from '../money/whole-xaf'
import { roundQuantity } from './sale-pricing'

export interface SalePaymentLine {
  method: PaymentMethod
  amount: number
}

/** Payment lines that actually carry money: a finite, positive amount. */
export function effectivePaymentLines<T extends { amount: number }>(payments: readonly T[]): T[] {
  return payments.filter((payment) => Number.isFinite(payment.amount) && payment.amount > 0)
}

export interface SaleSettlement {
  /** Everything tendered at checkout (includes any cash handed back as change). */
  amountPaid: number
  /** The unpaid balance, which becomes the customer's receivable. Never negative. */
  creditAmount: number
  /** Money handed back when more was tendered than the total. Never negative. */
  changeGiven: number
}

/** Settle a checkout: what was tendered against the total, the credit left, the change due. */
export function settleSale(input: {
  totalAmount: number
  payments: ReadonlyArray<{ amount: number }>
}): SaleSettlement {
  const amountPaid = toWholeXaf(
    effectivePaymentLines(input.payments).reduce((sum, payment) => sum + payment.amount, 0),
  )
  return {
    amountPaid,
    creditAmount: toWholeXaf(Math.max(0, input.totalAmount - amountPaid)),
    changeGiven: toWholeXaf(Math.max(0, amountPaid - input.totalAmount)),
  }
}

/**
 * The single payment method stored on the sale row: the method when every payment line
 * uses the same one, else MIXED. A sale with no payment at all (fully on credit) is MIXED.
 */
export function storedPaymentMethod(payments: ReadonlyArray<SalePaymentLine>): PaymentMethod {
  const methods = new Set(effectivePaymentLines(payments).map((payment) => payment.method))
  if (methods.size !== 1) return PaymentMethod.MIXED
  return [...methods][0]!
}

export type SaleCreditRejection = 'SALE_CREDIT_AMOUNT_MISMATCH' | 'CUSTOMER_REQUIRED_FOR_CREDIT'

/**
 * Whether a sale's credit portion is acceptable: a credit sale must be linked to a
 * customer, and a credit amount claimed by a device must equal the computed unpaid
 * balance. Returns the rejection code, or null when the sale may proceed.
 */
export function checkSaleCredit(input: {
  creditAmount: number
  hasCustomer: boolean
  /** The credit amount a device computed, when the sale arrives through sync. */
  expectedCreditAmount?: number | null
}): SaleCreditRejection | null {
  if (
    input.expectedCreditAmount !== undefined &&
    input.expectedCreditAmount !== null &&
    toWholeXaf(input.expectedCreditAmount) !== input.creditAmount
  ) {
    return 'SALE_CREDIT_AMOUNT_MISMATCH'
  }
  if (input.creditAmount > 0 && !input.hasCustomer) return 'CUSTOMER_REQUIRED_FOR_CREDIT'
  return null
}

/**
 * Re-settle a sale from its signed payment ledger: Σ(PAYMENT) − Σ(REFUND), never below 0,
 * against the sale total. Used after a later payment or a refund.
 */
export function settleSaleFromLedger(input: {
  totalAmount: number
  entries: ReadonlyArray<{ kind: SalePaymentKind | `${SalePaymentKind}`; amount: number }>
}): { amountPaid: number; creditAmount: number } {
  const net = input.entries.reduce(
    (sum, entry) =>
      sum + (entry.kind === SalePaymentKind.REFUND ? -Number(entry.amount) : Number(entry.amount)),
    0,
  )
  const amountPaid = toWholeXaf(Math.max(0, net))
  return { amountPaid, creditAmount: toWholeXaf(Math.max(0, input.totalAmount - amountPaid)) }
}

export interface RefundableSaleLine {
  id: string
  quantity: number
  /** The line's discounted total (after its line and cart-discount share). */
  lineTotal: number
}

export interface SaleReturnRequestLine {
  saleItemId: string
  quantity: number
}

export interface SaleReturnLine {
  saleItemId: string
  /** Quantity returned: at most three decimals, capped at the quantity sold. */
  quantity: number
  /** Index into the requested lines this came from; null on a full return. */
  requestIndex: number | null
}

export type SaleRefundRejection = 'RETURN_ITEM_NOT_FOUND' | 'NOTHING_TO_RETURN'

export type SaleRefundDecision =
  | {
      ok: true
      lines: SaleReturnLine[]
      /** Every sold line came back in full. */
      isFullReturn: boolean
      /** Value of the returned goods at their discounted per-unit price. */
      goodsValue: number
      /** Money to hand back: the requested amount (default the goods value), capped at what was paid. */
      refundAmount: number
      status: SaleStatus.REFUNDED | SaleStatus.PARTIALLY_REFUNDED
    }
  | { ok: false; code: SaleRefundRejection }

/**
 * Decide a return of a sale. With no requested lines every line is returned in full.
 * Money returned defaults to the goods value of the returned lines and is capped at what
 * was actually paid, so charges stay and an unpaid credit sale refunds nothing.
 */
export function decideSaleRefund(input: {
  items: ReadonlyArray<RefundableSaleLine>
  /** Lines to return; omitted or empty means a full return. */
  returns?: ReadonlyArray<SaleReturnRequestLine> | null
  /** Money the cashier chose to return; defaults to the goods value. */
  requestedAmount?: number | null
  /** What the sale has been paid so far (net of earlier refunds). */
  amountPaid: number
}): SaleRefundDecision {
  const itemsById = new Map(input.items.map((item) => [item.id, item]))
  const requested = input.returns && input.returns.length > 0 ? input.returns : null

  const lines: SaleReturnLine[] = []
  if (requested) {
    for (const [requestIndex, request] of requested.entries()) {
      const item = itemsById.get(request.saleItemId)
      if (!item) return { ok: false, code: 'RETURN_ITEM_NOT_FOUND' }
      const quantity = Math.min(Math.max(0, roundQuantity(request.quantity)), item.quantity)
      if (quantity > 0) lines.push({ saleItemId: item.id, quantity, requestIndex })
    }
  } else {
    for (const item of input.items) {
      if (item.quantity > 0) {
        lines.push({ saleItemId: item.id, quantity: item.quantity, requestIndex: null })
      }
    }
  }
  if (lines.length === 0) return { ok: false, code: 'NOTHING_TO_RETURN' }

  const returnedByItem = new Map<string, number>()
  for (const line of lines) {
    returnedByItem.set(line.saleItemId, (returnedByItem.get(line.saleItemId) ?? 0) + line.quantity)
  }
  const isFullReturn =
    !requested || input.items.every((item) => (returnedByItem.get(item.id) ?? 0) >= item.quantity)

  const goodsValue = toWholeXaf(
    lines.reduce((sum, line) => {
      const item = itemsById.get(line.saleItemId)!
      const perUnit = item.quantity > 0 ? item.lineTotal / item.quantity : item.lineTotal
      return sum + perUnit * line.quantity
    }, 0),
  )
  const requestedAmount =
    input.requestedAmount != null ? toWholeXaf(input.requestedAmount) : goodsValue
  const refundAmount = toWholeXaf(Math.min(Math.max(0, requestedAmount), input.amountPaid))

  return {
    ok: true,
    lines,
    isFullReturn,
    goodsValue,
    refundAmount,
    status: isFullReturn ? SaleStatus.REFUNDED : SaleStatus.PARTIALLY_REFUNDED,
  }
}
