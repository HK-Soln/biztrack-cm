// ---------------------------------------------------------------------------
// The summary card over a period of money in or out (expenses, other income): the total,
// how it compares with the period just before, the average per day, and each category's
// share. One rule for the API, the till and the browser build.
// ---------------------------------------------------------------------------

import { toWholeXaf } from '../money/whole-xaf'

const DAY_MS = 86_400_000

/** A percentage to one decimal, as every summary shows it. */
export function roundPercent(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0
}

const parseDay = (day: string): number => Date.parse(`${day.slice(0, 10)}T00:00:00.000Z`)
const formatDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/**
 * The days a period covers, both ends included, and the period of the same length that
 * ends the day before it starts (what "change" is measured against). Days are calendar
 * days, 'YYYY-MM-DD'.
 */
export function comparisonPeriod(
  dateFrom: string,
  dateTo: string,
): { days: number; previousFrom: string; previousTo: string } {
  const from = parseDay(dateFrom)
  const to = parseDay(dateTo)
  const days = Math.max(1, Math.round((to - from) / DAY_MS) + 1)
  const previousTo = from - DAY_MS
  return {
    days,
    previousFrom: formatDay(previousTo - (days - 1) * DAY_MS),
    previousTo: formatDay(previousTo),
  }
}

/** Days assumed when a summary has no date range. */
export const DEFAULT_SUMMARY_DAYS = 30

export interface AmountSummary<K> {
  total: number
  previousTotal: number
  /** Change against the previous period, in percent; 0 when there is nothing to compare to. */
  changePct: number
  avgPerDay: number
  /** Largest first. */
  categories: Array<{ key: K; amount: number; percentage: number }>
}

export function summarizeAmounts<K>(input: {
  categories: ReadonlyArray<{ key: K; amount: number }>
  /** The period's total; defaults to the sum of the categories. */
  total?: number | null
  previousTotal?: number | null
  /** Days in the period; defaults to DEFAULT_SUMMARY_DAYS. */
  days?: number | null
}): AmountSummary<K> {
  const categories = input.categories.map((c) => ({ key: c.key, amount: toWholeXaf(c.amount) }))
  const total = toWholeXaf(input.total ?? categories.reduce((sum, c) => sum + c.amount, 0))
  const previousTotal = toWholeXaf(input.previousTotal ?? 0)
  const days = Math.max(1, input.days ?? DEFAULT_SUMMARY_DAYS)
  return {
    total,
    previousTotal,
    changePct:
      previousTotal > 0 ? roundPercent(((total - previousTotal) / previousTotal) * 100) : 0,
    avgPerDay: toWholeXaf(total / days),
    categories: categories
      .map((c) => ({
        ...c,
        percentage: total > 0 ? roundPercent((c.amount / total) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount),
  }
}
