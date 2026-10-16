export function calculateProfit(revenue: number, expenses: number): number {
  return revenue - expenses
}

export function calculateMargin(costPrice: number, sellingPrice: number): number {
  if (sellingPrice === 0) return 0
  return ((sellingPrice - costPrice) / sellingPrice) * 100
}
