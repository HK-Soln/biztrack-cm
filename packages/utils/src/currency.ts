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

export function calculateProfit(revenue: number, expenses: number): number {
  return revenue - expenses
}

export function calculateMargin(costPrice: number, sellingPrice: number): number {
  if (costPrice === 0) return 0
  return ((sellingPrice - costPrice) / sellingPrice) * 100
}
