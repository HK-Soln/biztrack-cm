// Display-only currency helpers. Money COMPUTATION (rounding, allocation, totals) lives in
// @biztrack/domain — a formatted or parsed value must never feed back into a calculation.

export function formatCurrency(amount: number, currency = 'XAF', locale = 'fr-CM'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'XAF' ? 0 : 2,
    maximumFractionDigits: currency === 'XAF' ? 0 : 2,
  }).format(amount)
}

export function parseCurrency(value: string): number {
  return parseFloat(value.replace(/[^0-9.-]/g, ''))
}
