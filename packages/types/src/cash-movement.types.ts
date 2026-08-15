import type { IsoDateString } from './http.types'

/**
 * Cash movements (BIZ-2.3) — every non-sale cash event at a till, so a shift can
 * reconcile. Entity is CashMovement, NEVER bare "movement" (inventory_movements /
 * MovementType already own that word).
 *
 * Shopkeepers pull cash from the drawer all day — moto fare, a crate of drinks, change
 * for a neighbour, the owner's own pocket. Without recording them every shift shows a
 * phantom shortage and cashiers conclude the app is calling them thieves. OWNER_DRAW
 * ("c'est moi qui ai pris") removes the single biggest source of false variance.
 */
export enum CashMovementKind {
  /** The opening float. Represented by cash_sessions.opening_float; a movement of this
   * kind is NEUTRAL for expected-cash so it is never double-counted. */
  OPENING_FLOAT = 'OPENING_FLOAT',
  /** Cash paid out of the till for a business expense — creates a linked Expense (P&L). */
  EXPENSE = 'EXPENSE',
  /** Cash paid to a supplier from the till. */
  SUPPLIER_PAYMENT = 'SUPPLIER_PAYMENT',
  /** Cash removed from the till to a safe/bank. */
  DROP = 'DROP',
  /** Owner takes cash from the till. NOT an expense — drawings; never hits the P&L. */
  OWNER_DRAW = 'OWNER_DRAW',
  /** Cash added to the till (float top-up / making change). */
  CHANGE_IN = 'CHANGE_IN',
  /** Cash taken out of the till for change. */
  CHANGE_OUT = 'CHANGE_OUT',
  /** A customer repays a credit/debt in cash — cash into the drawer. */
  CREDIT_REPAYMENT = 'CREDIT_REPAYMENT',
  /** Cash from the till deposited into the MTN MoMo account. */
  TRANSFER_TO_MTN_MOMO = 'TRANSFER_TO_MTN_MOMO',
  /** Cash from the till deposited into the Orange Money account. */
  TRANSFER_TO_ORANGE_MONEY = 'TRANSFER_TO_ORANGE_MONEY',
  /** Cash from the till deposited to the bank. */
  TRANSFER_TO_BANK = 'TRANSFER_TO_BANK',
  /** A customer tops up a deposit / savings in cash — cash into the drawer. */
  CUSTOMER_DEPOSIT = 'CUSTOMER_DEPOSIT',
  /** A customer deposit is refunded in cash — cash out of the drawer. */
  DEPOSIT_REFUND = 'DEPOSIT_REFUND',
}

/** Whether a movement adds to, removes from, or does not affect the drawer. */
export type CashMovementDirection = 'IN' | 'OUT' | 'NEUTRAL'

export const CASH_MOVEMENT_DIRECTION: Record<CashMovementKind, CashMovementDirection> = {
  [CashMovementKind.OPENING_FLOAT]: 'NEUTRAL',
  [CashMovementKind.EXPENSE]: 'OUT',
  [CashMovementKind.SUPPLIER_PAYMENT]: 'OUT',
  [CashMovementKind.DROP]: 'OUT',
  [CashMovementKind.OWNER_DRAW]: 'OUT',
  [CashMovementKind.CHANGE_IN]: 'IN',
  [CashMovementKind.CHANGE_OUT]: 'OUT',
  [CashMovementKind.CREDIT_REPAYMENT]: 'IN',
  // Cash leaves the drawer into another account (the destination-account credit is the
  // treasury phase; here it is simply cash out of the till).
  [CashMovementKind.TRANSFER_TO_MTN_MOMO]: 'OUT',
  [CashMovementKind.TRANSFER_TO_ORANGE_MONEY]: 'OUT',
  [CashMovementKind.TRANSFER_TO_BANK]: 'OUT',
  [CashMovementKind.CUSTOMER_DEPOSIT]: 'IN',
  [CashMovementKind.DEPOSIT_REFUND]: 'OUT',
}

export function cashMovementDirection(kind: CashMovementKind): CashMovementDirection {
  return CASH_MOVEMENT_DIRECTION[kind] ?? 'NEUTRAL'
}

export interface RecordCashMovementInput {
  /** Optional client-generated id (device-first idempotency). */
  id?: string
  kind: CashMovementKind
  /** Positive whole XAF. */
  amount: number
  note?: string
  referenceType?: string | null
  referenceId?: string | null
}

export interface CashMovement {
  id: string
  businessId: string
  cashSessionId: string
  userId: string
  kind: CashMovementKind
  direction: CashMovementDirection
  /** Positive whole XAF; the sign is carried by `direction`, never by the amount. */
  amount: number
  note?: string | null
  /** Polymorphic link to what this movement settled/created (e.g. 'expense', 'debt'). */
  referenceType?: string | null
  referenceId?: string | null
  createdAt: IsoDateString
  updatedAt: IsoDateString
}
