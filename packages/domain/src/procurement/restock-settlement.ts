// ---------------------------------------------------------------------------
// Receiving stock from a supplier: what the goods cost, the supplier's discounts and
// charges, what was paid and what is left on credit. One rule for the API (REST and the
// sync applier), the till, and the receive screen's running totals, which each used to
// work it out for themselves.
// ---------------------------------------------------------------------------

import { toWholeXaf } from '../money/whole-xaf'

/** A discount or charge given as a percentage of the goods, or as an amount. */
export function restockAdjustmentAmount(input: {
  kind: 'PERCENT' | 'FIXED'
  value: number
  /** The goods subtotal a percentage applies to. */
  subtotal: number
}): number {
  const value = Number.isFinite(input.value) ? input.value : 0
  const amount = input.kind === 'PERCENT' ? (input.subtotal * value) / 100 : value
  return toWholeXaf(Math.max(0, amount))
}

export interface RestockTotals {
  /** What the goods cost: Σ quantity × unit cost, or the invoice subtotal given. */
  subtotal: number
  discountAmount: number
  chargesAmount: number
  /** subtotal − discounts + charges, never below 0. */
  totalAmount: number
}

/** The invoice: goods, less the supplier's discounts, plus charges. */
export function restockTotals(input: {
  subtotal: number
  discounts?: ReadonlyArray<number> | null
  charges?: ReadonlyArray<number> | null
}): RestockTotals {
  const sum = (amounts: ReadonlyArray<number> | null | undefined): number =>
    toWholeXaf((amounts ?? []).reduce((total, amount) => total + Math.max(0, amount || 0), 0))
  const subtotal = toWholeXaf(Math.max(0, input.subtotal))
  const discountAmount = sum(input.discounts)
  const chargesAmount = sum(input.charges)
  return {
    subtotal,
    discountAmount,
    chargesAmount,
    totalAmount: Math.max(0, toWholeXaf(subtotal - discountAmount + chargesAmount)),
  }
}

export type RestockSettlementRejection =
  /** Some lines have no unit cost and no invoice subtotal was given. */
  | 'RESTOCK_TOTAL_AMOUNT_REQUIRED'
  /** The invoice subtotal given does not match the lines. */
  | 'RESTOCK_TOTAL_AMOUNT_MISMATCH'
  /** More was paid than the invoice total. */
  | 'RESTOCK_PAYMENT_EXCEEDS_TOTAL'

export type RestockSettlement =
  | ({ ok: true; amountPaid: number; creditAmount: number } & RestockTotals)
  | {
      ok: false
      code: RestockSettlementRejection
      details?: Record<string, number>
    }

/**
 * Settle a receipt of stock.
 *  - Goods: Σ quantity × unit cost when every line has a cost. An invoice subtotal given
 *    instead is used as it is, and must match the lines when they all have a cost.
 *  - Paid: the split payments when given (each above zero), else a single amount capped at
 *    the total, else paid in full.
 *  - Paying more than the invoice total is refused; what is not paid is on credit.
 */
export function settleRestock(input: {
  lines: ReadonlyArray<{ quantity: number; unitCost?: number | null }>
  /** The invoice's goods subtotal, when the caller has one. */
  subtotal?: number | null
  discounts?: ReadonlyArray<number> | null
  charges?: ReadonlyArray<number> | null
  /** Split payments. When given, they are what was paid. */
  payments?: ReadonlyArray<number> | null
  /** A single amount paid, used when there are no split payments. */
  amountPaid?: number | null
}): RestockSettlement {
  const allCosted = input.lines.every((line) => line.unitCost != null)
  const computed = allCosted
    ? toWholeXaf(
        input.lines.reduce((sum, line) => sum + line.quantity * Math.max(0, line.unitCost ?? 0), 0),
      )
    : null
  const given = input.subtotal != null ? toWholeXaf(input.subtotal) : null
  if (computed === null && given === null) {
    return { ok: false, code: 'RESTOCK_TOTAL_AMOUNT_REQUIRED' }
  }
  if (computed !== null && given !== null && computed !== given) {
    return {
      ok: false,
      code: 'RESTOCK_TOTAL_AMOUNT_MISMATCH',
      details: { computedTotal: computed, explicitTotal: given },
    }
  }

  const totals = restockTotals({
    subtotal: given ?? computed ?? 0,
    discounts: input.discounts,
    charges: input.charges,
  })
  const amountPaid =
    input.payments != null
      ? toWholeXaf(input.payments.reduce((sum, amount) => sum + Math.max(0, amount || 0), 0))
      : input.amountPaid != null && Number.isFinite(input.amountPaid)
        ? toWholeXaf(Math.max(0, Math.min(input.amountPaid, totals.totalAmount)))
        : totals.totalAmount
  if (amountPaid > totals.totalAmount) {
    return {
      ok: false,
      code: 'RESTOCK_PAYMENT_EXCEEDS_TOTAL',
      details: { amountPaid, totalAmount: totals.totalAmount },
    }
  }
  return {
    ok: true,
    ...totals,
    amountPaid,
    creditAmount: Math.max(0, toWholeXaf(totals.totalAmount - amountPaid)),
  }
}

export type RestockCreditRejection =
  | 'SUPPLIER_REQUIRED_FOR_CREDIT'
  /** A receipt on credit needs the supplier's invoice as proof. */
  | 'INVOICE_REQUIRED_FOR_CREDIT'

/** What a receipt left on credit needs: a supplier to owe, and the invoice as proof. */
export function checkRestockCredit(input: {
  creditAmount: number
  hasSupplier: boolean
  hasInvoiceFile: boolean
}): RestockCreditRejection | null {
  if (!(input.creditAmount > 0)) return null
  if (!input.hasSupplier) return 'SUPPLIER_REQUIRED_FOR_CREDIT'
  if (!input.hasInvoiceFile) return 'INVOICE_REQUIRED_FOR_CREDIT'
  return null
}
