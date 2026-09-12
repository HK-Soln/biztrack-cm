import type {
  IncomeCategoryInput,
  IncomeCategorySlice,
  IncomeTrendItem,
  LocalIncomeCategory,
  LocalOtherIncome,
  LocalOtherIncomeSummary,
  OtherIncomeInput,
  OtherIncomeListQuery,
  PaginatedResult,
} from '@shared/ipc'
import { cget, cpost, cpatch, cdelete } from './cloud-http'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function clean<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) out[k] = v
  return out
}

function qs(query?: Record<string, unknown>): string {
  if (!query) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

interface ApiOtherIncome {
  id: string
  categoryId: string | null
  categoryName?: string | null
  categoryColor?: string | null
  description: string
  amount: number
  currency: string
  paymentMethod?: string | null
  reference?: string | null
  source: string
  note?: string | null
  date: string
  createdAt: string
}
interface ApiIncomeCategory {
  id: string
  name: string
  slug: string
  color: string
  icon?: string | null
  sortOrder: number
}
interface ApiListResult {
  items: ApiOtherIncome[]
  total: number
  page: number
  limit: number
  totalPages: number
  totalAmount: number
}

function toLocalIncome(e: ApiOtherIncome): LocalOtherIncome {
  return {
    id: e.id,
    categoryId: e.categoryId ?? null,
    categoryName: e.categoryName ?? null,
    categoryColor: e.categoryColor ?? null,
    description: e.description,
    amount: e.amount,
    currency: e.currency ?? 'XAF',
    paymentMethod: e.paymentMethod ?? null,
    reference: e.reference ?? null,
    source: e.source,
    note: e.note ?? null,
    date: e.date,
    createdAt: e.createdAt,
    updatedAt: e.createdAt,
  }
}

function toLocalCategory(c: ApiIncomeCategory): LocalIncomeCategory {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    color: c.color,
    icon: c.icon ?? null,
    sortOrder: c.sortOrder,
  }
}

type IncomeListResult = PaginatedResult<LocalOtherIncome> & { totalAmount: number }

function incomeQuery(query?: OtherIncomeListQuery): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (query) {
    if (query.page) out.page = query.page
    if (query.limit) out.limit = query.limit
    if (query.categoryId) out.categoryId = query.categoryId
    if (query.dateFrom) out.from = query.dateFrom
    if (query.dateTo) out.to = query.dateTo
  }
  return out
}

/**
 * Cloud (browser) adapter for other income. The API `/income` list returns
 * `{ items, total, page, limit, totalPages, totalAmount }`; summary + trend have no dedicated endpoints,
 * so they are aggregated client-side from the ledger over the requested range (income volume is low).
 */
export const cloudIncome = {
  list: async (query?: OtherIncomeListQuery): Promise<IncomeListResult> => {
    const res = await cget<ApiListResult>(`/income${qs(incomeQuery(query))}`)
    return {
      data: res.items.map(toLocalIncome),
      total: res.total,
      page: res.page,
      limit: res.limit,
      totalPages: res.totalPages,
      totalAmount: res.totalAmount,
    }
  },
  get: async (id: string): Promise<LocalOtherIncome | null> => {
    try {
      const res = await cget<ApiListResult>(`/income${qs({ ...incomeQuery(), limit: 1000 })}`)
      return res.items.map(toLocalIncome).find((r) => r.id === id) ?? null
    } catch {
      return null
    }
  },
  summary: async (query?: OtherIncomeListQuery): Promise<LocalOtherIncomeSummary> => {
    const res = await cget<ApiListResult>(`/income${qs({ ...incomeQuery(query), limit: 1000 })}`)
    const rows = res.items.map(toLocalIncome)
    const total = round2(rows.reduce((s, r) => s + r.amount, 0))
    const byCat = new Map<string, IncomeCategorySlice>()
    for (const r of rows) {
      const key = r.categoryId ?? ''
      const slice = byCat.get(key) ?? {
        categoryId: key,
        name: r.categoryName ?? 'Uncategorized',
        color: r.categoryColor ?? 'var(--text-muted)',
        amount: 0,
        percentage: 0,
      }
      slice.amount = round2(slice.amount + r.amount)
      byCat.set(key, slice)
    }
    const byCategory = [...byCat.values()].sort((a, b) => b.amount - a.amount)
    for (const s of byCategory) s.percentage = total > 0 ? Math.round((s.amount / total) * 100) : 0
    const fromLinks = round2(
      rows.filter((r) => r.source === 'PAYMENT_LINK').reduce((s, r) => s + r.amount, 0),
    )
    return {
      total,
      count: rows.length,
      previousTotal: 0,
      changePct: 0,
      avgPerDay: 0,
      fromLinks,
      largest: byCategory[0] ?? null,
      byCategory,
      currency: rows[0]?.currency ?? 'XAF',
    }
  },
  trend: async (): Promise<IncomeTrendItem[]> => {
    const now = new Date()
    const months: IncomeTrendItem[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
      months.push({
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        label: d.toLocaleDateString('en', { month: 'short' }),
        total: 0,
      })
    }
    const from = `${months[0]!.year}-${String(months[0]!.month).padStart(2, '0')}-01`
    const res = await cget<ApiListResult>(`/income${qs({ from, limit: 1000 })}`)
    for (const r of res.items) {
      const ym = r.date.slice(0, 7)
      const m = months.find((x) => `${x.year}-${String(x.month).padStart(2, '0')}` === ym)
      if (m) m.total = round2(m.total + r.amount)
    }
    return months
  },
  create: async (input: OtherIncomeInput): Promise<LocalOtherIncome> =>
    toLocalIncome(
      await cpost<ApiOtherIncome>(
        '/income',
        clean({
          categoryId: input.categoryId,
          description: input.description,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          note: input.note,
          date: input.date,
        }),
      ),
    ),
  update: async (id: string, input: OtherIncomeInput): Promise<LocalOtherIncome> =>
    // No PATCH endpoint yet — the manual-entry edit path lands with the Other Income page work.
    toLocalIncome(await cpatch<ApiOtherIncome>(`/income/${id}`, clean(input as unknown as Record<string, unknown>))),
  remove: (id: string): Promise<void> => cdelete<void>(`/income/${id}`),
}

export const cloudIncomeCategories = {
  listAll: async (): Promise<LocalIncomeCategory[]> =>
    (await cget<ApiIncomeCategory[]>('/income/categories')).map(toLocalCategory),
  create: async (input: IncomeCategoryInput): Promise<LocalIncomeCategory> =>
    toLocalCategory(
      await cpost<ApiIncomeCategory>(
        '/income/categories',
        clean({ name: input.name, color: input.color, icon: input.icon }),
      ),
    ),
}
