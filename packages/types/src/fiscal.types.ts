import type { IsoDateString } from './http.types'

// BIZ-5.2 — fiscal years + accounting periods. A business's transactions bucket (by their
// business_date) into monthly accounting periods, which roll up into a fiscal year. Periods are
// generated eagerly (12 per fiscal year) and carry a lifecycle driven by the close pipeline
// (BIZ-5.3). The deterministic date generation lives in @biztrack/utils (generateFiscalPeriods).

/** Lifecycle of an accounting period. Transitions come from the close pipeline (BIZ-5.3).
 *  LOCKED is terminal — there is no reopen path. */
export enum PeriodStatus {
  OPEN = 'OPEN',
  CLOSING = 'CLOSING',
  CLOSED = 'CLOSED',
  LOCKED = 'LOCKED',
}

export interface FiscalYear {
  id: string
  businessId: string
  /** The fiscal year's key = its START calendar year. */
  year: number
  /** Display label ('2026' for a calendar year, '2026/2027' when it straddles two). */
  label: string
  /** Month (1–12) the fiscal year begins in — snapshot of the business setting at generation. */
  startMonth: number
  startDate: IsoDateString
  endDate: IsoDateString
  createdAt: IsoDateString
  updatedAt: IsoDateString
}

export interface FiscalYearWithPeriods extends FiscalYear {
  periods: AccountingPeriod[]
}

/**
 * BIZ-5.4 — a prior-period adjustment: a sale or expense that arrived after its own accounting
 * period had already closed, so it was redated forward and posted to a later (still-open) period.
 * Surfaced so the owner can see what landed in the current books but belonged to an earlier one.
 */
export interface PostingAdjustment {
  id: string
  kind: 'SALE' | 'EXPENSE'
  /** Human reference — the sale number, or the expense description. */
  reference: string
  /** Whole-XAF money impact (a sale's total, an expense's amount). */
  amount: number
  /** The operational day it actually happened on. */
  businessDate: IsoDateString | null
  /** The accounting day it was redated to (falls in the still-open period). */
  postingDate: IsoDateString | null
  /** The closed period it originally belonged to. */
  originalPeriodId: string | null
  originalPeriodLabel: string | null
  /** The period it ended up posting into. */
  postingPeriodLabel: string | null
  createdAt: IsoDateString
}

export interface AccountingPeriod {
  id: string
  businessId: string
  fiscalYearId: string
  /** 1-based ordinal within the fiscal year (1 = the first month). */
  periodNumber: number
  /** Machine label 'YYYY-MM' of the period's calendar month. */
  label: string
  startDate: IsoDateString
  endDate: IsoDateString
  status: PeriodStatus
  /** Set when the period is closed/locked by the close pipeline (BIZ-5.3). */
  closedAt?: IsoDateString | null
  createdAt: IsoDateString
  updatedAt: IsoDateString
}
