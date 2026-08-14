import type { IsoDateString } from './http.types'

/**
 * Cash session (a cashier's shift at a till) — BIZ-2.1 (Epic 2).
 *
 * Entity name is CashSession, NEVER bare "session" (that already means the auth
 * device session — SyncDeviceSession / getSession / JwtPayload).
 *
 * Lifecycle: OPEN → COUNTING → CLOSED → RECONCILED, plus ABANDONED. Once a session
 * reaches CLOSED it is immutable to EVERY role including OWNER — corrections go
 * through a separate adjustment record, never by editing the close.
 */
export enum CashSessionStatus {
  /** Cashier has opened the till with a float; sales accrue against it. */
  OPEN = 'OPEN',
  /** Cashier is entering the denomination count at close; not yet submitted. */
  COUNTING = 'COUNTING',
  /** Count submitted; variance frozen. Immutable to every role. */
  CLOSED = 'CLOSED',
  /** Owner/manager has reviewed the closed session. Terminal. */
  RECONCILED = 'RECONCILED',
  /** Never properly closed (>72h untouched); excluded from variance stats. */
  ABANDONED = 'ABANDONED',
}

/** Why a session left OPEN. NORMAL = a real close; RECOVERED = force-closed after a
 * crash/dead-battery orphan (BIZ-2.5). */
export enum CashSessionClosedReason {
  NORMAL = 'NORMAL',
  RECOVERED = 'RECOVERED',
}

/**
 * Allowed status transitions. The service layer MUST reject any move not listed
 * here. Note CLOSED, RECONCILED and ABANDONED are terminal for the count — no
 * transition re-opens a session or edits a closed count.
 */
export const ALLOWED_CASH_SESSION_TRANSITIONS: Record<CashSessionStatus, CashSessionStatus[]> = {
  [CashSessionStatus.OPEN]: [
    CashSessionStatus.COUNTING,
    CashSessionStatus.CLOSED,
    CashSessionStatus.ABANDONED,
  ],
  [CashSessionStatus.COUNTING]: [CashSessionStatus.CLOSED, CashSessionStatus.ABANDONED],
  [CashSessionStatus.CLOSED]: [CashSessionStatus.RECONCILED],
  [CashSessionStatus.RECONCILED]: [],
  [CashSessionStatus.ABANDONED]: [],
}

/** True when `to` is a legal next status from `from`. */
export function canTransitionCashSession(from: CashSessionStatus, to: CashSessionStatus): boolean {
  return ALLOWED_CASH_SESSION_TRANSITIONS[from]?.includes(to) ?? false
}

/** A closed count can never be edited, regardless of role. */
export function isCashSessionLocked(status: CashSessionStatus): boolean {
  return (
    status === CashSessionStatus.CLOSED ||
    status === CashSessionStatus.RECONCILED ||
    status === CashSessionStatus.ABANDONED
  )
}

/**
 * XAF cash denominations, largest first. Notes then coins. A count line records a
 * quantity per denomination; the drawer total is Σ(denomination × quantity).
 */
export const CASH_DENOMINATIONS = [10000, 5000, 2000, 1000, 500, 100, 50, 25, 10, 5] as const

export type CashDenomination = (typeof CASH_DENOMINATIONS)[number]

export interface CashSession {
  id: string
  businessId: string
  /** Reserved for future multi-outlet support; unused today. */
  outletId?: string | null
  deviceId: string
  userId: string
  status: CashSessionStatus
  openedAt: IsoDateString
  closedAt?: IsoDateString | null
  /** All money fields are whole XAF (integer). */
  openingFloat: number
  expectedCash?: number | null
  countedCash?: number | null
  varianceCash?: number | null
  expectedMtnMomo?: number | null
  confirmedMtnMomo?: number | null
  expectedOrangeMoney?: number | null
  confirmedOrangeMoney?: number | null
  creditIssued: number
  discountTotal: number
  salesCount: number
  voidCount: number
  closedReason?: CashSessionClosedReason | null
  recountUsed: boolean
  closingNote?: string | null
  reviewedBy?: string | null
  reviewedAt?: IsoDateString | null
  reviewNote?: string | null
  createdAt: IsoDateString
  updatedAt: IsoDateString
}

export interface CashCountLine {
  id: string
  cashSessionId: string
  denomination: CashDenomination | number
  quantity: number
}
