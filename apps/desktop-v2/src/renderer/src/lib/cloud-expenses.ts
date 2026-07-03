import type {
  LocalExpense,
  LocalExpenseSummary,
  ExpenseTrendItem,
  ExpensesListQuery,
  ExpenseInput,
  PaginatedResult,
} from '@shared/ipc'
import { cget, cpost, cpatch, cdelete } from './cloud-http'

/** Drop null/undefined so a payload satisfies the API's non-null optional DTO fields. */
function clean<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) out[k] = v
  return out
}

/**
 * Cloud (browser) adapter for expenses. The API `/expenses` list already returns
 * `{ …, totalAmount }` + the category name/color, matching the desktop list; `summary`
 * and `trend` map to their endpoints, and writes (create/update/setStatus/remove) to
 * `/expenses`.
 */


function qs(query?: Record<string, unknown>): string {
  if (!query) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

interface ApiExpense {
  id: string
  description: string
  amount: number
  currency?: string | null
  expenseDate: string
  vendor?: string | null
  notes?: string | null
  isRecurring?: boolean
  status: string
  paymentMethod?: string | null
  categoryId?: string | null
  categoryName?: string | null
  categoryColor?: string | null
  receiptUrl?: string | null
  createdAt: string
  updatedAt?: string
}

function toLocalExpense(e: ApiExpense): LocalExpense {
  return {
    id: e.id,
    description: e.description,
    amount: e.amount,
    currency: e.currency ?? 'XAF',
    expenseDate: e.expenseDate,
    vendor: e.vendor ?? null,
    notes: e.notes ?? null,
    isRecurring: e.isRecurring ?? false,
    status: e.status,
    paymentMethod: e.paymentMethod ?? null,
    categoryId: e.categoryId ?? null,
    categoryName: e.categoryName ?? null,
    categoryColor: e.categoryColor ?? null,
    receiptUrl: e.receiptUrl ?? null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt ?? e.createdAt,
  }
}

type ExpenseListResult = PaginatedResult<LocalExpense> & { totalAmount: number }

// The API ListExpensesQueryDto (forbidNonWhitelisted) has no status — drop it.
const EXPENSE_QUERY_KEYS = ['page', 'limit', 'search', 'sortBy', 'sortOrder', 'categoryId', 'dateFrom', 'dateTo']
function expenseQuery(query?: ExpensesListQuery): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (query) {
    for (const k of EXPENSE_QUERY_KEYS) {
      const v = (query as Record<string, unknown>)[k]
      if (v !== undefined && v !== null && v !== '') out[k] = v
    }
  }
  return out
}

export const cloudExpenses = {
  list: async (query?: ExpensesListQuery): Promise<ExpenseListResult> => {
    const res = await cget<PaginatedResult<ApiExpense> & { totalAmount: number }>(`/expenses${qs(expenseQuery(query))}`)
    return { ...res, data: res.data.map(toLocalExpense) }
  },
  get: async (id: string): Promise<LocalExpense | null> => {
    try {
      return toLocalExpense(await cget<ApiExpense>(`/expenses/${id}`))
    } catch {
      return null
    }
  },
  summary: (query?: ExpensesListQuery): Promise<LocalExpenseSummary> =>
    cget<LocalExpenseSummary>(`/expenses/summary${qs(expenseQuery(query))}`),
  trend: (): Promise<ExpenseTrendItem[]> => cget<ExpenseTrendItem[]>('/expenses/trend'),
  create: async (input: ExpenseInput): Promise<LocalExpense> =>
    toLocalExpense(await cpost<ApiExpense>('/expenses', clean(input as unknown as Record<string, unknown>))),
  update: async (id: string, input: ExpenseInput): Promise<LocalExpense> =>
    toLocalExpense(await cpatch<ApiExpense>(`/expenses/${id}`, clean(input as unknown as Record<string, unknown>))),
  setStatus: async (id: string, status: string, paymentMethod?: string | null): Promise<LocalExpense> =>
    toLocalExpense(await cpatch<ApiExpense>(`/expenses/${id}`, clean({ status, paymentMethod }))),
  remove: (id: string): Promise<void> => cdelete<void>(`/expenses/${id}`),
}
