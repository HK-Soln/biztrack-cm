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
  /** Still owed, never below zero. A written-off debt owes nothing. */
  outstandingAmount: number
  /** What was not paid of the debt, written off or not (the amount a write-off cancelled). */
  unpaidAmount: number
  settled: boolean
}

/** The statuses of a debt that still has something owed on it. */
export const OPEN_DEBT_STATUSES: readonly DebtStatus[] = [
  DebtStatus.OUTSTANDING,
  DebtStatus.PARTIALLY_PAID,
]

/** Whether a debt is open: something is owed on it and it can take payments. */
export function debtIsOpen(status: DebtStatus | `${DebtStatus}`): boolean {
  return (OPEN_DEBT_STATUSES as readonly string[]).includes(status)
}

/** SQL condition: the debt whose status is in `statusColumn` is open (Postgres and SQLite). */
export function openDebtSql(statusColumn: string): string {
  return `${statusColumn} IN (${OPEN_DEBT_STATUSES.map((s) => `'${s}'`).join(', ')})`
}

/**
 * SQL expression: what is still owed on a debt, in whole francs (Postgres and SQLite). An
 * open debt owes what was not paid, never below zero; a settled or written-off one nothing.
 * `original` and `paid` are SQL expressions for the amount owed for and the payments' sum.
 */
export function debtOutstandingSql(e: { status: string; original: string; paid: string }): string {
  return `(CASE WHEN ${openDebtSql(e.status)} AND (${e.original}) - (${e.paid}) > 0 THEN ROUND((${e.original}) - (${e.paid})) ELSE 0 END)`
}

/**
 * Where a debt stands.
 *  - A written-off debt stays written off whatever is paid afterwards, and owes nothing.
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
  const unpaidAmount = Math.max(0, toWholeXaf(original - paidAmount))
  const settled = unpaidAmount <= 0
  const status = input.writtenOff
    ? DebtStatus.WRITTEN_OFF
    : settled
      ? DebtStatus.SETTLED
      : paidAmount > 0
        ? DebtStatus.PARTIALLY_PAID
        : DebtStatus.OUTSTANDING
  const outstandingAmount = input.writtenOff ? 0 : unpaidAmount
  return { status, paidAmount, outstandingAmount, unpaidAmount, settled }
}

/** Where a stored debt stands: `debtStanding` with "written off" read from its status. */
export function debtBalance(input: {
  originalAmount: number
  paidAmount: number
  status: DebtStatus | `${DebtStatus}`
}): DebtStanding {
  return debtStanding({
    originalAmount: input.originalAmount,
    paidAmount: input.paidAmount,
    writtenOff: input.status === DebtStatus.WRITTEN_OFF,
  })
}

/**
 * A debt after its payments or the amount owed for changed: its standing, status and
 * settlement date. A written-off debt stays written off, with no settlement date.
 */
export function debtAfterChange<T>(input: {
  originalAmount: number
  paidAmount: number
  status: DebtStatus | `${DebtStatus}`
  settledAt: T | null | undefined
  at: T
}): { standing: DebtStanding; status: DebtStatus; settledAt: T | null } {
  const standing = debtBalance(input)
  return {
    standing,
    status: standing.status,
    settledAt: debtSettledAt(standing, input.settledAt, input.at),
  }
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
  /** The debt is settled or written off. */
  | 'DEBT_PAYMENT_LOCKED'
  /** The payment is nothing, negative or not a number. */
  | 'DEBT_PAYMENT_AMOUNT_INVALID'
  /** The payment is dated before the debt was created. */
  | 'DEBT_PAYMENT_DATE_INVALID'
  /** The payment is more than what is still owed. */
  | 'DEBT_PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING'

/**
 * A payment on a debt: only on an open debt (when its `status` is given), in whole francs,
 * above zero, not dated before the debt was created (when both dates are given, as
 * YYYY-MM-DD), and no more than what is still owed.
 */
export function checkDebtPayment(input: {
  amount: number
  outstanding: number
  status?: DebtStatus | `${DebtStatus}`
  paymentDate?: string | null
  debtCreatedDate?: string | null
}): { ok: true; amount: number } | { ok: false; code: DebtPaymentRejection } {
  if (input.status !== undefined && !debtIsOpen(input.status)) {
    return { ok: false, code: 'DEBT_PAYMENT_LOCKED' }
  }
  const amount = Number.isFinite(input.amount) ? toWholeXaf(input.amount) : 0
  if (amount <= 0) return { ok: false, code: 'DEBT_PAYMENT_AMOUNT_INVALID' }
  if (
    input.paymentDate &&
    input.debtCreatedDate &&
    input.paymentDate.slice(0, 10) < input.debtCreatedDate.slice(0, 10)
  ) {
    return { ok: false, code: 'DEBT_PAYMENT_DATE_INVALID' }
  }
  if (amount > toWholeXaf(input.outstanding)) {
    return { ok: false, code: 'DEBT_PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING' }
  }
  return { ok: true, amount }
}

/**
 * Money collected on a sale's balance (or a restock's) going to its debt: what the debt takes
 * is at most what is still owed on it, and nothing when the debt is settled or written off.
 * The rest (`excess`) is not a debt payment.
 */
export function sourceDebtPayment(input: {
  amount: number
  outstanding: number
  status: DebtStatus | `${DebtStatus}`
}): { applied: number; excess: number } {
  const amount = Math.max(0, toWholeXaf(input.amount))
  const applied = debtIsOpen(input.status)
    ? Math.min(amount, Math.max(0, toWholeXaf(input.outstanding)))
    : 0
  return { applied, excess: toWholeXaf(amount - applied) }
}

export type SyncedDebtRejection =
  /** The amount owed for is negative or not a number. */
  | 'DEBT_AMOUNT_INVALID'
  /** A payment is nothing or not a number, or the payments add up to less than nothing. */
  | 'DEBT_PAYMENT_AMOUNT_INVALID'
  /** The payments add up to more than the amount owed for. */
  | 'DEBT_PAYMENTS_EXCEED_ORIGINAL'

/**
 * A debt as a till sent it, with every payment recorded against it. Amounts in whole francs.
 * A payment may be negative (the reversal of another), never zero; together they come to
 * between nothing and the amount owed for, as the till's own payment check allows.
 */
export function checkSyncedDebt(input: {
  originalAmount: number
  payments: readonly number[]
}):
  | { ok: true; originalAmount: number; payments: number[]; paidAmount: number }
  | { ok: false; code: SyncedDebtRejection } {
  if (!Number.isFinite(input.originalAmount) || input.originalAmount < 0) {
    return { ok: false, code: 'DEBT_AMOUNT_INVALID' }
  }
  const originalAmount = toWholeXaf(input.originalAmount)
  const payments: number[] = []
  for (const raw of input.payments) {
    const amount = Number.isFinite(raw) ? toWholeXaf(raw) : 0
    if (amount === 0) return { ok: false, code: 'DEBT_PAYMENT_AMOUNT_INVALID' }
    payments.push(amount)
  }
  const paidAmount = toWholeXaf(payments.reduce((sum, p) => sum + p, 0))
  if (paidAmount < 0) return { ok: false, code: 'DEBT_PAYMENT_AMOUNT_INVALID' }
  if (paidAmount > originalAmount) return { ok: false, code: 'DEBT_PAYMENTS_EXCEED_ORIGINAL' }
  return { ok: true, originalAmount, payments, paidAmount }
}

/**
 * A payment spread over several debts of a contact, oldest first: each takes what is still
 * owed on it until the money runs out. Debts must be given oldest first; those owing nothing
 * are skipped. `remaining` is what no debt took.
 */
export function allocatePaymentOldestFirst<D extends { outstanding: number }>(
  debts: ReadonlyArray<D>,
  amount: number,
): { allocations: Array<{ debt: D; amount: number }>; applied: number; remaining: number } {
  let remaining = Math.max(0, toWholeXaf(amount))
  const allocations: Array<{ debt: D; amount: number }> = []
  for (const debt of debts) {
    if (remaining <= 0) break
    const take = Math.min(remaining, Math.max(0, toWholeXaf(debt.outstanding)))
    if (take <= 0) continue
    allocations.push({ debt, amount: take })
    remaining = toWholeXaf(remaining - take)
  }
  const applied = toWholeXaf(allocations.reduce((sum, a) => sum + a.amount, 0))
  return { allocations, applied, remaining }
}

export type DebtWriteOffRejection =
  | 'DEBT_ALREADY_WRITTEN_OFF'
  | 'DEBT_ALREADY_SETTLED'
  | 'DEBT_WRITE_OFF_REASON_REQUIRED'

/** Writing a debt off by hand: only an open debt, and with a reason. */
export function checkDebtWriteOff(input: {
  status: DebtStatus | `${DebtStatus}`
  reason?: string | null
}): { ok: true; reason: string } | { ok: false; code: DebtWriteOffRejection } {
  if (input.status === DebtStatus.WRITTEN_OFF)
    return { ok: false, code: 'DEBT_ALREADY_WRITTEN_OFF' }
  if (input.status === DebtStatus.SETTLED) return { ok: false, code: 'DEBT_ALREADY_SETTLED' }
  const reason = input.reason?.trim() ?? ''
  if (!reason) return { ok: false, code: 'DEBT_WRITE_OFF_REASON_REQUIRED' }
  return { ok: true, reason }
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
