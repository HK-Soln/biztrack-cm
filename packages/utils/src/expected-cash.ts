import { toWholeXaf } from './currency'

// ---------------------------------------------------------------------------
// Expected-cash calculator (BIZ-2.2) — the ONE definition of what a cash drawer
// should hold at close, shared by apps/api and apps/desktop-v2 so both runtimes
// agree by construction.
//
//   expected_cash = opening_float
//                 + Σ CASH sale_payments on non-voided sales   (tendered, NET of refunds)
//                 − Σ change_given on those sales              (dispensed from the drawer)
//                 + Σ cash_movements IN
//                 − Σ cash_movements OUT
//
// "Net of refunds" (BIZ-1.8): a partial/full refund writes a REFUND-kind CASH sale_payment
// (cash handed back), so the caller nets those out of cashPayments. Refunded sales stay IN the
// sum (their original tender is real drawer cash); only VOIDED sales — fully reversed — drop out.
//
// Why subtract change: a CASH payment is recorded at the amount TENDERED, and the
// overpayment is handed back from the drawer as change_given. Net cash into the
// drawer for a sale is therefore (cash tendered − change). Forgetting this makes
// every drawer read short by exactly the change given — a phantom shortage.
//
// "After discounts" is automatic: a discount lowers the sale total, so the
// customer tenders less cash, so Σ cash payments is already net of discounts. A
// heavy-discount shift reconciles to zero variance when the drawer is correct.
//
// cash_movements IN/OUT arrive with BIZ-2.3; until then callers pass 0.
// ---------------------------------------------------------------------------

export interface ExpectedCashInput {
  /** The float the drawer was opened with (whole XAF). */
  openingFloat: number
  /** Σ tendered CASH `sale_payments.amount` on non-voided sales in the session, NET of
   * REFUND-kind rows (BIZ-1.8). */
  cashPayments: number
  /** Σ `change_given` on those sales — cash handed back out of the drawer. */
  changeGiven: number
  /** Σ cash_movements IN (float top-ups, change-in). 0 until BIZ-2.3. */
  cashIn?: number
  /** Σ cash_movements OUT (expenses, supplier payments, owner draw, change-out). 0 until BIZ-2.3. */
  cashOut?: number
}

/**
 * The whole-XAF amount a drawer should physically hold at close. Every term is
 * whole XAF; the result is rounded through `toWholeXaf` as a belt-and-braces guard.
 */
export function computeExpectedCash(input: ExpectedCashInput): number {
  const cashIn = input.cashIn ?? 0
  const cashOut = input.cashOut ?? 0
  return toWholeXaf(input.openingFloat + input.cashPayments - input.changeGiven + cashIn - cashOut)
}

/**
 * Variance = counted − expected. Positive = drawer over, negative = drawer short.
 * A business's tolerance band (BIZ-2.6) is applied by the caller, not here.
 */
export function computeCashVariance(counted: number, expected: number): number {
  return toWholeXaf(counted - expected)
}
