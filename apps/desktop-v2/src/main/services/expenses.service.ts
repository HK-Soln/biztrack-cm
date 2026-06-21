import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  ExpenseCategoryInput,
  ExpenseCategorySlice,
  ExpenseInput,
  ExpenseTrendItem,
  ExpensesListQuery,
  LocalExpense,
  LocalExpenseCategory,
  LocalExpenseSummary,
  PaginatedResult,
} from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'
import type { AuditLogger } from './audit.service'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

interface ExpenseRow {
  id: string
  description: string
  amount: number
  currency: string
  expense_date: string
  vendor: string | null
  notes: string | null
  is_recurring: number
  status: string
  payment_method: string | null
  category_id: string | null
  category_name: string | null
  category_color: string | null
  receipt_url: string | null
  created_at: string
  updated_at: string
}

const E_COLS = `e.id, e.description, e.amount, e.currency, e.date AS expense_date, e.vendor, e.notes,
  e.is_recurring, e.status, e.payment_method, e.category_id, e.receipt_url, e.created_at, e.updated_at,
  (SELECT c.name FROM expense_categories c WHERE c.id = e.category_id) AS category_name,
  (SELECT c.color FROM expense_categories c WHERE c.id = e.category_id) AS category_color`

/**
 * Offline-first expenses. Local SQLite reads; writes go local + sync_outbox (entity
 * `expenses` → server `expense`) and nudge a sync. Mirrors the API expenses module.
 * Tax-free amounts; status is PAID|PENDING. KPIs/donut/trend are computed locally.
 */
export class ExpensesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly onMutated: () => void,
    private readonly getActorId: () => string | null,
    private readonly audit?: AuditLogger,
  ) {}

  list(query: ExpensesListQuery = {}): PaginatedResult<LocalExpense> & { totalAmount: number } {
    const businessId = this.getBusinessId()
    if (!businessId) return { ...toPaginated<LocalExpense>([], { total: 0, page: 1, limit: 20, totalPages: 1 }), totalAmount: 0 }
    const { where, params } = this.buildWhere(businessId, query)
    const { rows, ...meta } = paginateRows<ExpenseRow>(
      this.db,
      {
        from: 'expenses e',
        columns: E_COLS,
        where,
        params,
        searchColumns: ['e.description', 'e.vendor'],
        defaultSort: 'e.date DESC, e.created_at DESC',
        sortMap: { date: 'e.date', amount: 'e.amount', createdAt: 'e.created_at' },
      },
      query,
    )
    // Total over the whole filtered set (not just the page).
    const search = query.search?.trim()
    let totalSql = `SELECT COALESCE(SUM(e.amount), 0) AS t FROM expenses e WHERE ${where}`
    const totalArgs = [...params]
    if (search) {
      totalSql += ' AND (e.description LIKE ? OR e.vendor LIKE ?)'
      totalArgs.push(`%${search}%`, `%${search}%`)
    }
    const totalAmount = round2(this.db.get<{ t: number }>(totalSql, totalArgs)?.t ?? 0)
    return { ...toPaginated(rows.map(toLocalExpense), meta), totalAmount }
  }

  get(id: string): LocalExpense | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<ExpenseRow>(`SELECT ${E_COLS} FROM expenses e WHERE e.id = ? AND e.business_id = ?`, [id, businessId])
    return row ? toLocalExpense(row) : null
  }

  /** KPI strip + donut + trend inputs over the filtered period. */
  summary(query: ExpensesListQuery = {}): LocalExpenseSummary {
    const currency = this.businessCurrency()
    const empty: LocalExpenseSummary = { total: 0, count: 0, previousTotal: 0, changePct: 0, avgPerDay: 0, pendingCount: 0, pendingAmount: 0, largest: null, byCategory: [], currency }
    const businessId = this.getBusinessId()
    if (!businessId) return empty

    const { where, params } = this.buildWhere(businessId, { ...query, status: undefined })
    const agg = this.db.get<{ total: number; n: number }>(`SELECT COALESCE(SUM(e.amount), 0) AS total, COUNT(*) AS n FROM expenses e WHERE ${where}`, params)
    const total = round2(agg?.total ?? 0)
    const count = agg?.n ?? 0

    const cats = this.db.query<{ category_id: string | null; name: string | null; color: string | null; amount: number }>(
      `SELECT e.category_id,
              (SELECT c.name FROM expense_categories c WHERE c.id = e.category_id) AS name,
              (SELECT c.color FROM expense_categories c WHERE c.id = e.category_id) AS color,
              COALESCE(SUM(e.amount), 0) AS amount
       FROM expenses e WHERE ${where} GROUP BY e.category_id ORDER BY amount DESC`,
      params,
    )
    const byCategory: ExpenseCategorySlice[] = cats.map((c) => ({
      categoryId: c.category_id ?? '',
      name: c.name ?? 'Uncategorized',
      color: c.color ?? 'var(--text-muted)',
      amount: round2(c.amount),
      percentage: total > 0 ? Math.round((c.amount / total) * 100) : 0,
    }))

    const pending = this.db.get<{ n: number; amt: number }>(`SELECT COUNT(*) AS n, COALESCE(SUM(e.amount), 0) AS amt FROM expenses e WHERE ${where} AND e.status = 'PENDING'`, params)

    // Previous equal-length period (for the % change badge).
    let previousTotal = 0
    if (query.dateFrom && query.dateTo) {
      const len = dayCount(query.dateFrom, query.dateTo)
      const prevTo = addDays(query.dateFrom, -1)
      const prevFrom = addDays(prevTo, -(len - 1))
      previousTotal = round2(
        this.db.get<{ t: number }>(
          `SELECT COALESCE(SUM(e.amount), 0) AS t FROM expenses e WHERE e.business_id = ? AND e.is_deleted = 0 AND e.date >= ? AND e.date <= ?`,
          [businessId, prevFrom, prevTo],
        )?.t ?? 0,
      )
    }
    const days = query.dateFrom && query.dateTo ? dayCount(query.dateFrom, query.dateTo) : 30

    return {
      total,
      count,
      previousTotal,
      changePct: previousTotal > 0 ? round2(((total - previousTotal) / previousTotal) * 100) : 0,
      avgPerDay: days > 0 ? round2(total / days) : 0,
      pendingCount: pending?.n ?? 0,
      pendingAmount: round2(pending?.amt ?? 0),
      largest: byCategory[0] ?? null,
      byCategory,
      currency,
    }
  }

  /** Total spend per month for the last 6 months (oldest → newest). */
  trend(): ExpenseTrendItem[] {
    const businessId = this.getBusinessId()
    const months = lastSixMonths()
    if (!businessId) return months
    const rows = this.db.query<{ ym: string; total: number }>(
      `SELECT substr(e.date, 1, 7) AS ym, COALESCE(SUM(e.amount), 0) AS total
       FROM expenses e WHERE e.business_id = ? AND e.is_deleted = 0 AND e.date >= ?
       GROUP BY ym`,
      [businessId, `${months[0]!.year}-${String(months[0]!.month).padStart(2, '0')}-01`],
    )
    const byYm = new Map(rows.map((r) => [r.ym, round2(r.total)]))
    return months.map((m) => ({ ...m, total: byYm.get(`${m.year}-${String(m.month).padStart(2, '0')}`) ?? 0 }))
  }

  create(input: ExpenseInput): LocalExpense {
    const businessId = this.requireBusinessId()
    const recordedById = this.getActorId()
    if (!recordedById) throw new Error('No active session.')
    if (!input.categoryId?.trim()) throw new Error('Pick a category.')
    if (!input.description?.trim()) throw new Error('Add a description.')
    const amount = round2(Number(input.amount))
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0.')

    const id = randomUUID()
    const now = new Date().toISOString()
    const expenseDate = input.expenseDate?.trim() || now.slice(0, 10)
    const currency = this.businessCurrency()
    const status = input.status === 'PENDING' ? 'PENDING' : 'PAID'
    const categoryName = this.db.get<{ name: string }>(`SELECT name FROM expense_categories WHERE id = ?`, [input.categoryId])?.name ?? ''

    this.db.run(
      `INSERT INTO expenses
        (id, business_id, recorded_by_id, category, category_id, description, amount, currency, payment_method,
         receipt_url, vendor, notes, is_recurring, status, date, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id, businessId, recordedById, categoryName, input.categoryId, input.description.trim(), amount, currency,
        status === 'PENDING' ? null : input.paymentMethod || 'CASH', input.receiptUrl ?? null, input.vendor?.trim() || null, input.notes?.trim() || null,
        input.isRecurring ? 1 : 0, status, expenseDate, now, now,
      ],
    )
    this.enqueue(id, businessId, 'UPSERT', this.payloadFor(id, businessId), now)
    this.onMutated()
    this.audit?.log({ action: 'CREATE', entityType: 'expense', entityId: id, entityLabel: input.description.trim(), changes: { before: null, after: { amount, categoryId: input.categoryId, status } } })
    return this.get(id)!
  }

  update(id: string, input: ExpenseInput): LocalExpense {
    const businessId = this.requireBusinessId()
    const existing = this.db.get<{ amount: number; status: string; category_id: string | null; description: string }>(
      `SELECT amount, status, category_id, description FROM expenses WHERE id = ? AND business_id = ? AND is_deleted = 0`,
      [id, businessId],
    )
    if (!existing) throw new Error('Expense not found.')
    const amount = round2(Number(input.amount))
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0.')
    const now = new Date().toISOString()
    const expenseDate = input.expenseDate?.trim() || now.slice(0, 10)
    const status = input.status === 'PENDING' ? 'PENDING' : 'PAID'
    const categoryName = this.db.get<{ name: string }>(`SELECT name FROM expense_categories WHERE id = ?`, [input.categoryId])?.name ?? ''

    this.db.run(
      `UPDATE expenses SET category = ?, category_id = ?, description = ?, amount = ?, payment_method = ?,
         receipt_url = ?, vendor = ?, notes = ?, is_recurring = ?, status = ?, date = ?, updated_at = ?
       WHERE id = ? AND business_id = ?`,
      [
        categoryName, input.categoryId, input.description.trim(), amount, status === 'PENDING' ? null : input.paymentMethod || 'CASH',
        input.receiptUrl ?? null, input.vendor?.trim() || null, input.notes?.trim() || null,
        input.isRecurring ? 1 : 0, status, expenseDate, now, id, businessId,
      ],
    )
    this.enqueue(id, businessId, 'UPSERT', this.payloadFor(id, businessId), now)
    this.onMutated()
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'expense',
      entityId: id,
      entityLabel: input.description.trim(),
      changes: {
        before: { amount: existing.amount, status: existing.status, categoryId: existing.category_id, description: existing.description },
        after: { amount, status, categoryId: input.categoryId, description: input.description.trim() },
      },
    })
    return this.get(id)!
  }

  /**
   * Flip an expense's status. Marking PAID requires a payment method; marking PENDING
   * clears it (pending expenses carry no method). Logs an audit entry.
   */
  setStatus(id: string, status: string, paymentMethod?: string | null): LocalExpense {
    const businessId = this.requireBusinessId()
    const existing = this.db.get<{ description: string; status: string; payment_method: string | null }>(
      `SELECT description, status, payment_method FROM expenses WHERE id = ? AND business_id = ? AND is_deleted = 0`,
      [id, businessId],
    )
    if (!existing) throw new Error('Expense not found.')
    const next = status === 'PENDING' ? 'PENDING' : 'PAID'
    if (next === 'PAID' && !paymentMethod) throw new Error('Select a payment method to mark this expense paid.')
    const method = next === 'PENDING' ? null : paymentMethod ?? null
    const now = new Date().toISOString()
    this.db.run(`UPDATE expenses SET status = ?, payment_method = ?, updated_at = ? WHERE id = ? AND business_id = ?`, [next, method, now, id, businessId])
    this.enqueue(id, businessId, 'UPSERT', this.payloadFor(id, businessId), now)
    this.onMutated()
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'expense',
      entityId: id,
      entityLabel: existing.description,
      changes: { before: { status: existing.status, paymentMethod: existing.payment_method }, after: { status: next, paymentMethod: method } },
    })
    return this.get(id)!
  }

  remove(id: string): void {
    const businessId = this.requireBusinessId()
    const existing = this.db.get<{ description: string }>(`SELECT description FROM expenses WHERE id = ? AND business_id = ?`, [id, businessId])
    if (!existing) return
    const now = new Date().toISOString()
    this.db.run(`UPDATE expenses SET is_deleted = 1, updated_at = ? WHERE id = ? AND business_id = ?`, [now, id, businessId])
    this.enqueue(id, businessId, 'DELETE', { ...this.payloadFor(id, businessId), isDeleted: true }, now)
    this.onMutated()
    this.audit?.log({ action: 'DELETE', entityType: 'expense', entityId: id, entityLabel: existing.description, changes: { before: { description: existing.description }, after: null } })
  }

  // ---- internals -----------------------------------------------------------

  private buildWhere(businessId: string, query: ExpensesListQuery): { where: string; params: unknown[] } {
    let where = 'e.business_id = ? AND e.is_deleted = 0'
    const params: unknown[] = [businessId]
    if (query.categoryId) { where += ' AND e.category_id = ?'; params.push(query.categoryId) }
    if (query.status) { where += ' AND e.status = ?'; params.push(query.status) }
    if (query.dateFrom) { where += ' AND e.date >= ?'; params.push(query.dateFrom) }
    if (query.dateTo) { where += ' AND e.date <= ?'; params.push(query.dateTo) }
    return { where, params }
  }

  private payloadFor(id: string, businessId: string): Record<string, unknown> {
    const e = this.db.get<ExpenseRow & { recorded_by_id: string }>(
      `SELECT ${E_COLS}, e.recorded_by_id FROM expenses e WHERE e.id = ? AND e.business_id = ?`,
      [id, businessId],
    )!
    return {
      id,
      businessId,
      categoryId: e.category_id,
      recordedById: e.recorded_by_id,
      description: e.description,
      amount: e.amount,
      currency: e.currency,
      expenseDate: e.expense_date,
      vendor: e.vendor,
      notes: e.notes,
      isRecurring: e.is_recurring === 1,
      status: e.status,
      paymentMethod: e.payment_method,
      receiptUrl: e.receipt_url,
      createdAt: e.created_at,
    }
  }

  private enqueue(recordId: string, businessId: string, operation: 'UPSERT' | 'DELETE', payload: Record<string, unknown>, now: string): void {
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'expenses', ?, ?, ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), recordId, operation, JSON.stringify({ ...payload, businessId }), now, now],
    )
  }

  private businessCurrency(): string {
    const businessId = this.getBusinessId()
    if (!businessId) return 'XAF'
    return this.db.get<{ currency: string }>(`SELECT currency FROM local_businesses WHERE id = ?`, [businessId])?.currency ?? 'XAF'
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }
}

/** System + business expense categories (read for filter/picker; create business ones). */
export class ExpenseCategoriesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly onMutated: () => void,
    private readonly audit?: AuditLogger,
  ) {}

  listAll(): LocalExpenseCategory[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const rows = this.db.query<{ id: string; business_id: string | null; name: string; slug: string | null; color: string | null; icon: string | null; sort_order: number; count: number }>(
      `SELECT c.id, c.business_id, c.name, c.slug, c.color, c.icon, c.sort_order,
              (SELECT COUNT(*) FROM expenses e WHERE e.category_id = c.id AND e.is_deleted = 0) AS count
       FROM expense_categories c
       WHERE c.is_deleted = 0 AND (c.business_id IS NULL OR c.business_id = ?)
       ORDER BY c.sort_order ASC, c.name ASC`,
      [businessId],
    )
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      color: r.color,
      icon: r.icon,
      isSystem: !r.business_id,
      sortOrder: r.sort_order,
      expenseCount: r.count,
    }))
  }

  create(input: ExpenseCategoryInput): LocalExpenseCategory {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    if (!input.name?.trim()) throw new Error('Category name is required.')
    const id = randomUUID()
    const now = new Date().toISOString()
    const slug = slugify(input.name)
    this.db.run(
      `INSERT INTO expense_categories (id, business_id, name, slug, color, icon, sort_order, is_active, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 1, 0, ?, ?)`,
      [id, businessId, input.name.trim(), slug, input.color, input.icon ?? null, now, now],
    )
    this.enqueue(id, businessId, { name: input.name.trim(), color: input.color, icon: input.icon ?? null, sortOrder: 0, createdAt: now, updatedAt: now }, now)
    this.onMutated()
    this.audit?.log({ action: 'CREATE', entityType: 'expense_category', entityId: id, entityLabel: input.name.trim(), changes: { before: null, after: { name: input.name.trim() } } })
    return { id, name: input.name.trim(), slug, color: input.color, icon: input.icon ?? null, isSystem: false, sortOrder: 0, expenseCount: 0 }
  }

  private enqueue(recordId: string, businessId: string, payload: Record<string, unknown>, now: string): void {
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'expenseCategories', ?, 'UPSERT', ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), recordId, JSON.stringify({ ...payload, businessId }), now, now],
    )
  }
}

// ---- helpers ----------------------------------------------------------------
function toLocalExpense(r: ExpenseRow): LocalExpense {
  return {
    id: r.id,
    description: r.description,
    amount: r.amount,
    currency: r.currency,
    expenseDate: r.expense_date,
    vendor: r.vendor,
    notes: r.notes,
    isRecurring: r.is_recurring === 1,
    status: r.status,
    paymentMethod: r.payment_method,
    categoryId: r.category_id,
    categoryName: r.category_name,
    categoryColor: r.category_color,
    receiptUrl: r.receipt_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function slugify(name: string): string {
  return name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category'
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function lastSixMonths(): ExpenseTrendItem[] {
  const now = new Date()
  const out: ExpenseTrendItem[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: MONTH_LABELS[d.getMonth()]!, total: 0 })
  }
  return out
}
function dayCount(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00')
  const b = new Date(to + 'T00:00:00')
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1)
}
function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA')
}
