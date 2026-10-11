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
