// BIZ-5.2 — deterministic generation of a fiscal year and its 12 monthly accounting periods.
// Pure date math (UTC, no timezone/DST hazards): the same (year, startMonth) always yields the
// same boundaries, so the API and any future client agree by construction.
// (The PeriodStatus lifecycle enum + FiscalYear/AccountingPeriod shapes live in @biztrack/types.)

/** Owner-configurable start month of the fiscal year (1 = January, OHADA default). */
export const DEFAULT_FISCAL_YEAR_START_MONTH = 1
export const MIN_FISCAL_YEAR_START_MONTH = 1
export const MAX_FISCAL_YEAR_START_MONTH = 12

/** Clamp a fiscal-year start month into 1–12, defaulting to January on anything invalid. */
export function clampFiscalYearStartMonth(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return DEFAULT_FISCAL_YEAR_START_MONTH
  const m = Math.trunc(value)
  if (m < MIN_FISCAL_YEAR_START_MONTH || m > MAX_FISCAL_YEAR_START_MONTH) {
    return DEFAULT_FISCAL_YEAR_START_MONTH
  }
  return m
}

export interface GeneratedPeriod {
  /** 1-based ordinal within the fiscal year (1 = the first month). */
  periodNumber: number
  /** Machine label 'YYYY-MM' of the period's calendar month. */
  label: string
  /** Inclusive first day 'YYYY-MM-DD'. */
  startDate: string
  /** Inclusive last day 'YYYY-MM-DD'. */
  endDate: string
}

export interface GeneratedFiscalYear {
  /** The fiscal year's key = its START calendar year. */
  year: number
  /** Display label: 'YYYY' for a calendar year, else 'YYYY/YYYY' when it straddles two years. */
  label: string
  startMonth: number
  /** Inclusive first day 'YYYY-MM-DD'. */
  startDate: string
  /** Inclusive last day 'YYYY-MM-DD'. */
  endDate: string
  /** Exactly 12 monthly periods, in order. */
  periods: GeneratedPeriod[]
}

const pad2 = (n: number): string => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number): string => `${y}-${pad2(m)}-${pad2(d)}`
/** Last calendar day of month `m` (1–12) in year `y`, via UTC day-0-of-next-month. */
const lastDay = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate()

/**
 * Generate the fiscal year keyed by `year` (its start calendar year) with the given start month,
 * and its 12 monthly periods. Calendar-year example: year=2026, startMonth=1 → 2026-01-01…
 * 2026-12-31. Offset example: year=2026, startMonth=4 → 2026-04-01…2027-03-31 (label '2026/2027').
 */
export function generateFiscalPeriods(
  year: number,
  startMonth: number = DEFAULT_FISCAL_YEAR_START_MONTH,
): GeneratedFiscalYear {
  const start = clampFiscalYearStartMonth(startMonth)
  const periods: GeneratedPeriod[] = []
  for (let i = 0; i < 12; i++) {
    const monthIndex = start - 1 + i // 0-based months from the start
    const y = year + Math.floor(monthIndex / 12)
    const m = (monthIndex % 12) + 1 // 1–12
    periods.push({
      periodNumber: i + 1,
      label: `${y}-${pad2(m)}`,
      startDate: ymd(y, m, 1),
      endDate: ymd(y, m, lastDay(y, m)),
    })
  }
  const first = periods[0]!
  const last = periods[periods.length - 1]!
  const endYear = year + (start === 1 ? 0 : 1)
  return {
    year,
    label: start === 1 ? `${year}` : `${year}/${endYear}`,
    startMonth: start,
    startDate: first.startDate,
    endDate: last.endDate,
    periods,
  }
}

/** The fiscal-year KEY (start calendar year) that a given 'YYYY-MM-DD' business_date falls in,
 *  for a business whose fiscal year begins in `startMonth`. */
export function fiscalYearOf(businessDate: string, startMonth: number): number {
  const start = clampFiscalYearStartMonth(startMonth)
  const [yStr, mStr] = businessDate.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  // A date in a month before the start month belongs to the fiscal year that began the prior year.
  return m >= start ? y : y - 1
}
