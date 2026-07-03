// Data hooks for the Home dashboards. Layout-agnostic: desktop, tablet and
// mobile role screens all read from these. Every source is a real DataClient
// method (works in both the Electron/offline and cloud/HTTP builds).
import { useQuery } from '@tanstack/react-query'
import { dataClient } from '@/lib/data-client'
import type { Range } from './home-kit'

const KEY = 'home'

export function useSalesSummary(range: Range) {
  return useQuery({
    queryKey: [KEY, 'sales-summary', range],
    queryFn: () => dataClient.sales.summary(range),
  })
}

export function useRecentSales(range: Range, limit = 6) {
  return useQuery({
    queryKey: [KEY, 'recent-sales', range, limit],
    queryFn: () => dataClient.sales.list({ ...range, page: 1, limit }),
  })
}

export function useInventoryStats() {
  return useQuery({ queryKey: [KEY, 'inventory-stats'], queryFn: () => dataClient.inventory.stats() })
}

export function useReorder() {
  return useQuery({ queryKey: [KEY, 'reorder'], queryFn: () => dataClient.inventory.reorderSuggestions() })
}

export function useProductStats() {
  return useQuery({ queryKey: [KEY, 'product-stats'], queryFn: () => dataClient.products.stats() })
}

export function useExpenseSummary(range: Range) {
  return useQuery({
    queryKey: [KEY, 'expense-summary', range],
    queryFn: () => dataClient.expenses.summary(range),
  })
}

export function useExpenseTrend() {
  return useQuery({ queryKey: [KEY, 'expense-trend'], queryFn: () => dataClient.expenses.trend() })
}

export function useContactsSummary() {
  return useQuery({ queryKey: [KEY, 'contacts-summary'], queryFn: () => dataClient.contacts.summary() })
}

export function useDepositSummary() {
  return useQuery({ queryKey: [KEY, 'deposit-summary'], queryFn: () => dataClient.deposits.summary() })
}

export function usePendingExpenses(range: Range, limit = 5) {
  return useQuery({
    queryKey: [KEY, 'pending-expenses', range, limit],
    queryFn: () => dataClient.expenses.list({ ...range, status: 'PENDING', page: 1, limit }),
  })
}

/** Team performance (one row per cashier) — for the mobile Owner/Manager screens. */
export function useCashierRoster(range: Range) {
  return useQuery({
    queryKey: [KEY, 'cashier-roster', range],
    queryFn: () => dataClient.sales.cashierRoster(range),
  })
}

/** Per-product revenue/COGS — the mobile Owner screen ranks these by profit. */
export function useSalesByProduct(range: Range) {
  return useQuery({
    queryKey: [KEY, 'sales-by-product', range],
    queryFn: () => dataClient.sales.byProduct(range),
  })
}

/** Product revenue + COGS → blended gross margin, for the mobile Owner/Accountant screens. */
export function useGrossProfit(range: Range) {
  return useQuery({
    queryKey: [KEY, 'gross-profit', range],
    queryFn: () => dataClient.sales.grossProfit(range),
  })
}
