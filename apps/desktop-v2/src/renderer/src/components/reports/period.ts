export type ReportPeriodKey = 'month' | 'quarter' | 'year'

function ymd(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

/** Inclusive date range for a report period, anchored on today. */
export function rangeFor(period: ReportPeriodKey): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const to = ymd(now)
  if (period === 'year') return { dateFrom: ymd(new Date(now.getFullYear(), 0, 1)), dateTo: to }
  if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3) * 3
    return { dateFrom: ymd(new Date(now.getFullYear(), q, 1)), dateTo: to }
  }
  return { dateFrom: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: to } // month
}

/** Human label for the period, e.g. "June 2026", "Q2 2026", "2026". */
export function periodLabel(period: ReportPeriodKey, lang: string): string {
  const now = new Date()
  if (period === 'year') return String(now.getFullYear())
  if (period === 'quarter') return `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`
  return now.toLocaleDateString(lang, { month: 'long', year: 'numeric' })
}
