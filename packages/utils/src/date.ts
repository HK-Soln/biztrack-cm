// NOTE (BIZ-5.1): the getStartOf*/getEndOf* helpers below operate on the RUNTIME's local
// clock (getHours/getDate/getMonth), so on a UTC-deployed server they compute UTC boundaries —
// which do NOT match a business's local trading day. For anything that must bucket by the
// business's day/period (reports, business_date), use `computeBusinessDate` / the timezone-aware
// primitives in ./business-calendar with the business timezone, not these. These remain for
// display/relative math where the machine zone is acceptable.

export function formatDate(date: Date | string, locale = 'fr-CM'): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: Date | string, locale = 'fr-CM'): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function getStartOfDay(date = new Date()): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function getEndOfDay(date = new Date()): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

export function getStartOfWeek(date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function getStartOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function getEndOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

export function toISOString(date: Date): string {
  return date.toISOString()
}
