import type { Currency } from './business.types'
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

/** An OPEN session older than this many hours is treated as orphaned on next launch and
 * offered for recovery (BIZ-2.5). Default 16h; a per-business setting can override later. */
export const DEFAULT_MAX_SHIFT_HOURS = 16

/** An OPEN session untouched for longer than this (hours) is marked ABANDONED by the
 * server sweep and excluded from variance statistics (BIZ-2.5). */
export const ABANDONED_SHIFT_HOURS = 72

/** Default cash-variance tolerance band (whole XAF, ±). A close whose |variance| exceeds
 * this requires a reason (BIZ-2.6). A per-business override lands with settings-sync. */
export const DEFAULT_CASH_VARIANCE_TOLERANCE = 100

/** Why a shift's cash count didn't match expected. Deliberately blame-free — a place to
 * look, never an accusation of "missing" (BIZ-2.6). */
export enum CashVarianceReason {
  CHANGE_ERROR = 'CHANGE_ERROR',
  UNRECORDED_SALE = 'UNRECORDED_SALE',
  UNRECORDED_EXPENSE = 'UNRECORDED_EXPENSE',
  UNKNOWN = 'UNKNOWN',
}

/** True when a variance is inside the tolerance band (no reason needed at close). */
export function isCashVarianceWithinTolerance(
  variance: number,
  tolerance: number = DEFAULT_CASH_VARIANCE_TOLERANCE,
): boolean {
  return Math.abs(variance) <= Math.abs(tolerance)
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
  /** Why the count didn't match, when |variance| exceeded the tolerance band (BIZ-2.6). */
  varianceReason?: CashVarianceReason | null
  varianceNote?: string | null
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

/** One denomination the cashier counted at close (BIZ-2.4). */
export interface CashCountEntry {
  denomination: CashDenomination | number
  quantity: number
}

/**
 * Close-a-shift input (BIZ-2.4). The cashier submits a blind denomination count for cash
 * and (optionally) the confirmed MoMo/Orange balances read off the phone. The expected
 * total is never shown before submission; the service reveals the variance in the result.
 */
export interface CloseCashSessionInput {
  counts: CashCountEntry[]
  confirmedMtnMomo?: number | null
  confirmedOrangeMoney?: number | null
  closingNote?: string
  /** True if the cashier used their one allowed re-count before submitting. */
  recountUsed?: boolean
}

/** Record why a shift's count missed, after an out-of-tolerance close (BIZ-2.6). */
export interface SetCashVarianceReasonInput {
  reason: CashVarianceReason
  note?: string
}

/**
 * Expected-cash breakdown for a session (BIZ-2.2) — the drawer reconciliation figure
 * plus its components, so the close screen can explain the number. `cashIn`/`cashOut`
 * are 0 until cash movements land (BIZ-2.3). All whole XAF.
 */
export interface CashSessionExpectedCash {
  sessionId: string
  openingFloat: number
  /** Σ tendered CASH payments on non-voided sales in the session. */
  cashPayments: number
  /** Σ change_given on those sales (dispensed from the drawer). */
  changeGiven: number
  cashIn: number
  cashOut: number
  /** opening_float + cashPayments − changeGiven + cashIn − cashOut. */
  expectedCash: number
}

/** How many days of closed shifts the per-cashier variance history covers by default (BIZ-2.6). */
export const DEFAULT_VARIANCE_HISTORY_DAYS = 30

export interface CashVarianceHistoryQuery {
  /** Look-back window in days (default DEFAULT_VARIANCE_HISTORY_DAYS). */
  days?: number
}

/** The worst (largest-magnitude) single shift in a cashier's window. */
export interface CashVarianceWorstShift {
  sessionId: string
  varianceCash: number
  closedAt: IsoDateString
}

/**
 * Per-cashier drawer accuracy over a window (BIZ-2.6). "A single gap means nothing; a
 * pattern is everything" — so the unit of the report is the cashier, not the shift.
 * Only NORMAL-closed shifts with a real count (variance not null) are counted; RECOVERED
 * and ABANDONED shifts are excluded (they have no trustworthy variance). All whole XAF.
 */
export interface CashierVarianceStats {
  userId: string
  cashierName: string | null
  /** Number of counted shifts in the window. */
  shifts: number
  /** Signed mean variance (over/short bias). */
  meanVarianceCash: number
  /** Signed sum of variances (net over/short across the window). */
  netVarianceCash: number
  /** Σ |variance| — total drawer error regardless of direction. */
  sumAbsVarianceCash: number
  /** Shifts whose |variance| exceeded the tolerance band. */
  outsideToleranceCount: number
  /** outsideToleranceCount / shifts × 100, rounded. */
  pctOutsideTolerance: number
  worstShift: CashVarianceWorstShift | null
}

export interface CashVarianceHistory {
  fromDate: IsoDateString
  toDate: IsoDateString
  /** The ±band a shift must stay within to count as balanced. */
  toleranceXaf: number
  /** Cashiers ranked worst-first by total drawer error (sumAbsVarianceCash). */
  cashiers: CashierVarianceStats[]
}

// ─── Z / X reports + daily close (BIZ-2.6 Slice C) ──────────────────────────

/** Which shift report: X = mid-shift read (session still OPEN), Z = end-of-shift close. */
export type CashReportKind = 'X' | 'Z'

/** One off-book cash movement, as it appears on a shift report. */
export interface CashReportMovementLine {
  kind: string
  direction: 'IN' | 'OUT'
  amount: number
  note: string | null
  createdAt: IsoDateString
}

/**
 * Per-shift report payload (BIZ-2.6). Neutral money in whole XAF, computed by the main
 * process from the shift's sales / payments / movements, then rendered to a branded Z/X
 * document. An X-report reads an OPEN session (drawer count/variance are null — the count
 * is only taken at close); a Z-report reads the CLOSED snapshot. All totals derive from
 * COMPLETED sales except `sales.voidCount`.
 */
export interface CashShiftReportData {
  kind: CashReportKind
  currency: Currency | string
  sessionId: string
  status: string
  cashierName: string | null
  deviceId: string | null
  openedAt: IsoDateString
  closedAt: IsoDateString | null
  closedReason: string | null
  generatedAt: IsoDateString
  sales: {
    count: number
    voidCount: number
    grossSales: number
    discountTotal: number
    netSales: number
    creditIssued: number
  }
  /** Tender mix collected on completed sales. */
  tenders: {
    cash: number
    mtnMomo: number
    orangeMoney: number
    card: number
  }
  /** Cash-drawer reconciliation. `countedCash`/`varianceCash` are null until close. */
  drawer: {
    openingFloat: number
    cashSales: number
    changeGiven: number
    movementsIn: number
    movementsOut: number
    expectedCash: number
    countedCash: number | null
    varianceCash: number | null
  }
  /** MoMo balances reconciled per tender, never blended with cash. */
  momo: {
    expectedMtn: number
    confirmedMtn: number | null
    expectedOrange: number
    confirmedOrange: number | null
  }
  movements: CashReportMovementLine[]
  varianceReason: string | null
  varianceNote: string | null
  closingNote: string | null
}

export interface CashDailyReportQuery {
  /** Day window start (inclusive) — ISO; defaults to the current UTC calendar day. */
  fromIso?: string
  /** Day window end (exclusive) — ISO; defaults to fromIso + 24h. */
  toIso?: string
}

/** One shift's line on the daily close. */
export interface CashDailyShiftLine {
  sessionId: string
  cashierName: string | null
  status: string
  openedAt: IsoDateString
  closedAt: IsoDateString | null
  openingFloat: number
  expectedCash: number
  countedCash: number | null
  varianceCash: number | null
  cashSales: number
  salesCount: number
}

export interface CashDailyTotals {
  shifts: number
  salesCount: number
  voidCount: number
  grossSales: number
  discountTotal: number
  netSales: number
  creditIssued: number
  cash: number
  mtnMomo: number
  orangeMoney: number
  card: number
  openingFloat: number
  expectedCash: number
  /** Σ counted cash across CLOSED shifts only (open shifts contribute nothing). */
  countedCash: number
  /** Σ variance across CLOSED shifts only. */
  varianceCash: number
}

/**
 * Server-side reconciliation against the `daily_sale_summaries` aggregate (the API fills
 * this; the desktop leaves it null since that table lives only in Postgres). Confirms the
 * shift-derived tender totals agree with the day's posted summary — no second aggregate.
 */
export interface CashDailyReconciliation {
  totalRevenue: number
  cashCollected: number
  mtnMomoCollected: number
  orangeMoneyCollected: number
  cardCollected: number
  creditIssued: number
  /** True when the shift-derived tender totals match the daily summary (within 1 XAF). */
  matches: boolean
}

/**
 * Daily close (BIZ-2.6) — every shift for a business on a calendar day, plus rolled-up
 * totals. A read-only review document, not a new stored aggregate.
 */
export interface CashDailyReportData {
  currency: Currency | string
  fromDate: IsoDateString
  toDate: IsoDateString
  generatedAt: IsoDateString
  shifts: CashDailyShiftLine[]
  totals: CashDailyTotals
  reconciliation: CashDailyReconciliation | null
}
