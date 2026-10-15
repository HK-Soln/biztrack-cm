// ---------------------------------------------------------------------------
// The state of a debt, from what was owed and what has been paid. One rule for the API
// (payments, opening balances, the sync applier) and the till (payments, offsets, the
// sync pull), which each used to work it out for themselves.
// ---------------------------------------------------------------------------

import { DebtStatus } from '@biztrack/types'
import { toWholeXaf } from '../money/whole-xaf'

export interface DebtStanding {
  status: DebtStatus
  /** Paid so far, in whole francs. */
  paidAmount: number
  /** Still owed, never below zero. */
  outstandingAmount: number
  settled: boolean
}

/**
 * Where a debt stands.
 *  - A written-off debt stays written off whatever is paid afterwards.
 *  - Paid in full (to the franc) → SETTLED.
 *  - Something paid → PARTIALLY_PAID; nothing paid → OUTSTANDING.
 */
export function debtStanding(input: {
  originalAmount: number
  /** The sum of every payment recorded against the debt. */
  paidAmount: number
  writtenOff?: boolean
}): DebtStanding {
  const original = toWholeXaf(Math.max(0, input.originalAmount))
  const paidAmount = toWholeXaf(Math.max(0, input.paidAmount))
  const outstandingAmount = Math.max(0, toWholeXaf(original - paidAmount))
  const settled = outstandingAmount <= 0
  const status = input.writtenOff
    ? DebtStatus.WRITTEN_OFF
    : settled
      ? DebtStatus.SETTLED
      : paidAmount > 0
        ? DebtStatus.PARTIALLY_PAID
        : DebtStatus.OUTSTANDING
  return { status, paidAmount, outstandingAmount, settled }
}

/**
 * When a debt was settled: the moment it first became settled is kept, a debt that is no
 * longer settled has none.
 */
export function debtSettledAt<T>(
  standing: Pick<DebtStanding, 'status'>,
  current: T | null | undefined,
  at: T,
): T | null {
  return standing.status === DebtStatus.SETTLED ? (current ?? at) : null
}

/**
 * Whether cancelling a debt's source (a voided sale, everything returned) writes the debt
 * off. A debt already paid in full stays settled: the money was received (ruling R11).
 * One already written off is left alone.
 */
export function debtCanBeWrittenOff(status: DebtStatus | `${DebtStatus}`): boolean {
  return status !== DebtStatus.SETTLED && status !== DebtStatus.WRITTEN_OFF
}

/**
 * A debt after part of what it was for came back (ruling R10): the amount owed for is
 * reduced, never below what has already been paid against it, and the standing follows.
 */
export function reduceDebt(input: {
  originalAmount: number
  paidAmount: number
  /** Value taken off the debt. */
  reduction: number
}): { originalAmount: number; standing: DebtStanding } {
  const paid = toWholeXaf(Math.max(0, input.paidAmount))
  const originalAmount = Math.max(
    paid,
    toWholeXaf(Math.max(0, input.originalAmount) - Math.max(0, input.reduction)),
  )
  return { originalAmount, standing: debtStanding({ originalAmount, paidAmount: paid }) }
}

export type DebtPaymentRejection =
  /** The payment is nothing, negative or not a number. */
  | 'DEBT_PAYMENT_AMOUNT_INVALID'
  /** The payment is more than what is still owed. */
  | 'DEBT_PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING'

/** A payment on a debt: in whole francs, above zero, and no more than what is still owed. */
export function checkDebtPayment(input: {
  amount: number
  outstanding: number
}): { ok: true; amount: number } | { ok: false; code: DebtPaymentRejection } {
  const amount = Number.isFinite(input.amount) ? toWholeXaf(input.amount) : 0
  if (amount <= 0) return { ok: false, code: 'DEBT_PAYMENT_AMOUNT_INVALID' }
  if (amount > toWholeXaf(input.outstanding)) {
    return { ok: false, code: 'DEBT_PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING' }
  }
  return { ok: true, amount }
}

/**
 * Netting what a contact owes against what is owed to them. The smaller of the two open
 * totals is paid off on both sides, oldest debt first, as cash-neutral contra payments.
 * Debts must be given oldest first; only those with something still owed take part.
 */
export function planDebtOffset<D extends { outstanding: number }>(input: {
  receivables: ReadonlyArray<D>
  payables: ReadonlyArray<D>
}):
  | {
      ok: true
      offsetAmount: number
      receivableTotal: number
      payableTotal: number
      allocations: Array<{ debt: D; amount: number }>
    }
  | { ok: false; code: 'DEBT_OFFSET_NOTHING' } {
  const open = (debts: ReadonlyArray<D>) => debts.filter((d) => toWholeXaf(d.outstanding) > 0)
  const total = (debts: ReadonlyArray<D>) =>
    toWholeXaf(debts.reduce((sum, d) => sum + toWholeXaf(d.outstanding), 0))
  const receivables = open(input.receivables)
  const payables = open(input.payables)
  const receivableTotal = total(receivables)
  const payableTotal = total(payables)
  const offsetAmount = Math.min(receivableTotal, payableTotal)
  if (offsetAmount <= 0) return { ok: false, code: 'DEBT_OFFSET_NOTHING' }

  const allocations: Array<{ debt: D; amount: number }> = []
  const allocate = (debts: D[]) => {
    let remaining = offsetAmount
    for (const debt of debts) {
      if (remaining <= 0) break
      const amount = Math.min(remaining, toWholeXaf(debt.outstanding))
      if (amount <= 0) continue
      allocations.push({ debt, amount })
      remaining = toWholeXaf(remaining - amount)
    }
  }
  allocate(receivables)
  allocate(payables)
  return { ok: true, offsetAmount, receivableTotal, payableTotal, allocations }
}
