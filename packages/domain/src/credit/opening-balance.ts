// ---------------------------------------------------------------------------
// Opening balances (slice 10): what a contact owed, or was owed, before the business started
// recording in BizTrack. It is kept as a debt of its own (OPENING_BALANCE) so it can be paid
// like any other. One rule for the server (REST and sync) and the till.
// ---------------------------------------------------------------------------

import { ContactType, DebtDirection } from '@biztrack/types'
import { toWholeXaf } from '../money/whole-xaf'

export type OpeningBalanceRejection =
  /** The amount is nothing, negative or not a number. */
  | 'OPENING_BALANCE_AMOUNT_INVALID'
  /** A supplier owing the business, or the business owing a customer. */
  | 'OPENING_BALANCE_DIRECTION_INVALID'
  /** The date is not a calendar date (YYYY-MM-DD). */
  | 'OPENING_BALANCE_DATE_INVALID'

/**
 * An opening balance as entered: in whole francs and above zero, dated (YYYY-MM-DD), and in
 * a direction the contact's type allows. A supplier only has what the business owes it
 * (payable), a customer only what it owes the business (receivable); a contact of type BOTH
 * either.
 */
export function checkOpeningBalance(input: {
  amount: number
  direction: DebtDirection | `${DebtDirection}`
  contactType: ContactType | `${ContactType}`
  asOfDate: string
}): { ok: true; amount: number } | { ok: false; code: OpeningBalanceRejection } {
  if (
    (input.direction === DebtDirection.RECEIVABLE && input.contactType === ContactType.SUPPLIER) ||
    (input.direction === DebtDirection.PAYABLE && input.contactType === ContactType.CUSTOMER)
  ) {
    return { ok: false, code: 'OPENING_BALANCE_DIRECTION_INVALID' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate ?? '')) {
    return { ok: false, code: 'OPENING_BALANCE_DATE_INVALID' }
  }
  const amount = Number.isFinite(input.amount) ? toWholeXaf(input.amount) : 0
  if (amount <= 0) return { ok: false, code: 'OPENING_BALANCE_AMOUNT_INVALID' }
  return { ok: true, amount }
}
