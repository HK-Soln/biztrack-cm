// ---------------------------------------------------------------------------
// Customer savings (deposit sessions): money a customer leaves with the shop and spends
// later. What a payment in, a purchase from savings, its reversal on a voided sale, and
// closing the session do to the account. One rule for the API and the till, in whole
// francs. A sale refund never gives savings back (ruling R8): that goes through here.
// ---------------------------------------------------------------------------

import { toWholeXaf } from '../money/whole-xaf'

export interface SavingsTotals {
  balance: number
  totalDeposited: number
  totalUsed: number
  totalRefunded: number
  totalTransferred: number
}

export type SavingsRejection =
  | 'DEPOSIT_AMOUNT_INVALID'
  | 'DEPOSIT_CLOSED'
  | 'DEPOSIT_INSUFFICIENT_BALANCE'

/** Money paid into the account. */
export function savingsDeposit(
  account: Pick<SavingsTotals, 'balance' | 'totalDeposited'>,
  amount: number,
):
  | { ok: true; amount: number; balance: number; totalDeposited: number }
  | { ok: false; code: 'DEPOSIT_AMOUNT_INVALID' } {
  const paid = Number.isFinite(amount) ? toWholeXaf(amount) : 0
  if (paid <= 0) return { ok: false, code: 'DEPOSIT_AMOUNT_INVALID' }
  return {
    ok: true,
    amount: paid,
    balance: toWholeXaf(account.balance + paid),
    totalDeposited: toWholeXaf(account.totalDeposited + paid),
  }
}

/**
 * Paying for a sale from savings. Only an open account, and only up to its balance. An
 * amount of nothing is no draw-down at all (`amount` 0, account unchanged).
 */
export function savingsPurchase(
  account: Pick<SavingsTotals, 'balance' | 'totalUsed'> & { open: boolean },
  amount: number,
):
  | { ok: true; amount: number; balance: number; totalUsed: number }
  | { ok: false; code: 'DEPOSIT_CLOSED' | 'DEPOSIT_INSUFFICIENT_BALANCE' } {
  const used = Math.max(0, toWholeXaf(amount))
  if (used === 0) {
    return { ok: true, amount: 0, balance: account.balance, totalUsed: account.totalUsed }
  }
  if (!account.open) return { ok: false, code: 'DEPOSIT_CLOSED' }
  if (account.balance < used) return { ok: false, code: 'DEPOSIT_INSUFFICIENT_BALANCE' }
  return {
    ok: true,
    amount: used,
    balance: toWholeXaf(account.balance - used),
    totalUsed: toWholeXaf(account.totalUsed + used),
  }
}

/** A sale paid from savings was voided: the amount goes back on the account. */
export function savingsPurchaseReversal(
  account: Pick<SavingsTotals, 'balance' | 'totalUsed'>,
  amount: number,
): { amount: number; balance: number; totalUsed: number } {
  const back = Math.max(0, toWholeXaf(amount))
  return {
    amount: back,
    balance: toWholeXaf(account.balance + back),
    totalUsed: Math.max(0, toWholeXaf(account.totalUsed - back)),
  }
}

/** What can be refunded when the session closes: the balance less the cancellation charge. */
export function savingsRefundable(input: { balance: number; cancellationCharge?: number | null }): {
  charge: number
  refundTotal: number
} {
  const balance = toWholeXaf(input.balance)
  const charge = toWholeXaf(Math.max(0, input.cancellationCharge ?? 0))
  return { charge, refundTotal: toWholeXaf(balance - charge) }
}

export type SavingsCloseRejection =
  | 'DEPOSIT_LEFTOVER'
  | 'DEPOSIT_NOTHING_TO_REFUND'
  | 'DEPOSIT_CHARGE_TOO_HIGH'
  | 'DEPOSIT_REFUND_LINE_INVALID'
  | 'DEPOSIT_REFUND_MISMATCH'
  | 'DEPOSIT_TRANSFER_NO_SALES'
  | 'DEPOSIT_NOTHING_TO_TRANSFER'

export interface SavingsRefundLine {
  method: string
  amount: number
  mobileMoneyReference: string | null
}

export type SavingsCloseDecision =
  | {
      ok: true
      settlement: 'NONE'
      leftover: number
    }
  | {
      ok: true
      settlement: 'REFUND'
      leftover: number
      /** Kept by the business and booked as other income. */
      charge: number
      refundTotal: number
      refundLines: SavingsRefundLine[]
      /** The part of the refund paid in cash, which leaves the drawer. */
      cashRefunded: number
      totalRefunded: number
    }
  | {
      ok: true
      settlement: 'TRANSFER'
      leftover: number
      /** Moves into a new open session for the same customer. */
      transferAmount: number
      totalTransferred: number
    }
  | { ok: false; code: SavingsCloseRejection }

/**
 * Closing a savings session.
 *  - NONE: only when nothing is left.
 *  - REFUND: the balance less a cancellation charge (never more than the balance) is paid
 *    back, split across methods if given; the lines must add up to it exactly.
 *  - TRANSFER: the balance moves to a new session, only when goods were collected on this one.
 */
export function decideSavingsClose(input: {
  account: Pick<SavingsTotals, 'balance' | 'totalRefunded' | 'totalTransferred'>
  /** Goods were collected against this session. */
  hasSales: boolean
  settlement: 'NONE' | 'REFUND' | 'TRANSFER'
  cancellationCharge?: number | null
  /** A split refund; when absent the whole refundable amount is one line. */
  refunds?: ReadonlyArray<{
    method?: string | null
    amount: number
    mobileMoneyReference?: string | null
  }> | null
  /** Method and reference of the single line when no split is given. */
  method?: string | null
  mobileMoneyReference?: string | null
}): SavingsCloseDecision {
  const leftover = toWholeXaf(input.account.balance)

  if (input.settlement === 'NONE') {
    return leftover > 0
      ? { ok: false, code: 'DEPOSIT_LEFTOVER' }
      : { ok: true, settlement: 'NONE', leftover }
  }

  if (input.settlement === 'TRANSFER') {
    if (!input.hasSales) return { ok: false, code: 'DEPOSIT_TRANSFER_NO_SALES' }
    if (leftover <= 0) return { ok: false, code: 'DEPOSIT_NOTHING_TO_TRANSFER' }
    return {
      ok: true,
      settlement: 'TRANSFER',
      leftover,
      transferAmount: leftover,
      totalTransferred: toWholeXaf(input.account.totalTransferred + leftover),
    }
  }

  if (leftover <= 0) return { ok: false, code: 'DEPOSIT_NOTHING_TO_REFUND' }
  const { charge, refundTotal } = savingsRefundable({
    balance: leftover,
    cancellationCharge: input.cancellationCharge,
  })
  if (charge > leftover) return { ok: false, code: 'DEPOSIT_CHARGE_TOO_HIGH' }

  const refundLines: SavingsRefundLine[] =
    refundTotal <= 0
      ? []
      : input.refunds && input.refunds.length > 0
        ? input.refunds.map((line) => ({
            method: line.method || 'CASH',
            amount: toWholeXaf(line.amount),
            mobileMoneyReference: line.mobileMoneyReference ?? null,
          }))
        : [
            {
              method: input.method || 'CASH',
              amount: refundTotal,
              mobileMoneyReference: input.mobileMoneyReference ?? null,
            },
          ]
  if (refundLines.some((line) => !(line.amount > 0))) {
    return { ok: false, code: 'DEPOSIT_REFUND_LINE_INVALID' }
  }
  if (toWholeXaf(refundLines.reduce((sum, line) => sum + line.amount, 0)) !== refundTotal) {
    return { ok: false, code: 'DEPOSIT_REFUND_MISMATCH' }
  }
  return {
    ok: true,
    settlement: 'REFUND',
    leftover,
    charge,
    refundTotal,
    refundLines,
    cashRefunded: toWholeXaf(
      refundLines.filter((line) => line.method === 'CASH').reduce((s, l) => s + l.amount, 0),
    ),
    totalRefunded: toWholeXaf(input.account.totalRefunded + refundTotal),
  }
}

/** The balance after each movement, oldest first: money in adds, money out takes away. */
export function savingsRunningBalances(
  movements: ReadonlyArray<{ direction: 'inbound' | 'outbound' | string; amount: number }>,
  opening = 0,
): number[] {
  let running = toWholeXaf(opening)
  return movements.map((movement) => {
    running = toWholeXaf(
      running + (movement.direction === 'inbound' ? movement.amount : -movement.amount),
    )
    return running
  })
}
