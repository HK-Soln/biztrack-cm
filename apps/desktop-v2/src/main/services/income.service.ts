import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
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
} from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'
import { localBusinessDate } from './business-calendar'
import type { AuditLogger } from './audit.service'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

interface IncomeRow {
  id: string
  description: string
  amount: number
  currency: string
  income_date: string
  payment_method: string | null
  reference: string | null
  source: string
  note: string | null
  category_id: string | null
  category_name: string | null
  category_color: string | null
  created_at: string
  updated_at: string
}

const I_COLS = `oi.id, oi.description, oi.amount, oi.currency, oi.date AS income_date, oi.payment_method,
  oi.reference, oi.source, oi.note, oi.category_id, oi.created_at, oi.updated_at,
  (SELECT c.name FROM income_categories c WHERE c.id = oi.category_id) AS category_name,
  (SELECT c.color FROM income_categories c WHERE c.id = oi.category_id) AS category_color`

/**
 * Offline-first other income (Spec 10 ①). Local SQLite reads; MANUAL entries write local + sync_outbox
 * (entity `otherIncomes` → server `other_income`) and nudge a sync. PAYMENT_LINK / DEPOSIT_CHARGE rows
 * are server-booked and arrive via pull — they are read-only here. Mirrors the API income module.
 */
export class IncomeService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly onMutated: () => void,
    private readonly getActorId: () => string | null,
    private readonly audit?: AuditLogger,
  ) {}

  list(query: OtherIncomeListQuery = {}): PaginatedResult<LocalOtherIncome> & { totalAmount: number } {
    const businessId = this.getBusinessId()
    if (!businessId)
      return {
        ...toPaginated<LocalOtherIncome>([], { total: 0, page: 1, limit: 20, totalPages: 1 }),
        totalAmount: 0,
      }
    const { where, params } = this.buildWhere(businessId, query)
    const { rows, ...meta } = paginateRows<IncomeRow>(
      this.db,
      {
        from: 'other_incomes oi',
        columns: I_COLS,
        where,
        params,
        searchColumns: ['oi.description', 'oi.reference'],
        defaultSort: 'oi.date DESC, oi.created_at DESC',
        sortMap: { date: 'oi.date', amount: 'oi.amount', createdAt: 'oi.created_at' },
      },
      query,
    )
    const search = query.search?.trim()
    let totalSql = `SELECT COALESCE(SUM(oi.amount), 0) AS t FROM other_incomes oi WHERE ${where}`
    const totalArgs = [...params]
    if (search) {
      totalSql += ' AND (oi.description LIKE ? OR oi.reference LIKE ?)'
      totalArgs.push(`%${search}%`, `%${search}%`)
    }
    const totalAmount = round2(this.db.get<{ t: number }>(totalSql, totalArgs)?.t ?? 0)
    return { ...toPaginated(rows.map(toLocalIncome), meta), totalAmount }
  }

  get(id: string): LocalOtherIncome | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<IncomeRow>(
      `SELECT ${I_COLS} FROM other_incomes oi WHERE oi.id = ? AND oi.business_id = ?`,
      [id, businessId],
    )
    return row ? toLocalIncome(row) : null
  }

  /** KPI strip + donut + trend inputs over the filtered period. */
  summary(query: OtherIncomeListQuery = {}): LocalOtherIncomeSummary {
    const currency = this.businessCurrency()
    const empty: LocalOtherIncomeSummary = {
      total: 0,
      count: 0,
      previousTotal: 0,
      changePct: 0,
      avgPerDay: 0,
      fromLinks: 0,
      largest: null,
      byCategory: [],
      currency,
    }
    const businessId = this.getBusinessId()
    if (!businessId) return empty

    const { where, params } = this.buildWhere(businessId, { ...query, source: undefined })
    const agg = this.db.get<{ total: number; n: number }>(
      `SELECT COALESCE(SUM(oi.amount), 0) AS total, COUNT(*) AS n FROM other_incomes oi WHERE ${where}`,
      params,
    )
    const total = round2(agg?.total ?? 0)
    const count = agg?.n ?? 0

    const cats = this.db.query<{
      category_id: string | null
      name: string | null
      color: string | null
      amount: number
    }>(
      `SELECT oi.category_id,
              (SELECT c.name FROM income_categories c WHERE c.id = oi.category_id) AS name,
              (SELECT c.color FROM income_categories c WHERE c.id = oi.category_id) AS color,
              COALESCE(SUM(oi.amount), 0) AS amount
       FROM other_incomes oi WHERE ${where} GROUP BY oi.category_id ORDER BY amount DESC`,
      params,
    )
    const byCategory: IncomeCategorySlice[] = cats.map((c) => ({
      categoryId: c.category_id ?? '',
      name: c.name ?? 'Uncategorized',
      color: c.color ?? 'var(--text-muted)',
      amount: round2(c.amount),
      percentage: total > 0 ? Math.round((c.amount / total) * 100) : 0,
    }))

    const fromLinks = round2(
      this.db.get<{ t: number }>(
        `SELECT COALESCE(SUM(oi.amount), 0) AS t FROM other_incomes oi WHERE ${where} AND oi.source = 'PAYMENT_LINK'`,
        params,
      )?.t ?? 0,
    )

    let previousTotal = 0
    if (query.dateFrom && query.dateTo) {
      const len = dayCount(query.dateFrom, query.dateTo)
      const prevTo = addDays(query.dateFrom, -1)
      const prevFrom = addDays(prevTo, -(len - 1))
      previousTotal = round2(
        this.db.get<{ t: number }>(
          `SELECT COALESCE(SUM(oi.amount), 0) AS t FROM other_incomes oi WHERE oi.business_id = ? AND oi.is_deleted = 0 AND oi.date >= ? AND oi.date <= ?`,
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
      fromLinks,
      largest: byCategory[0] ?? null,
      byCategory,
      currency,
    }
  }

  /** Total income per month for the last 6 months (oldest → newest). */
  trend(): IncomeTrendItem[] {
    const businessId = this.getBusinessId()
    const months = lastSixMonths()
    if (!businessId) return months
    const rows = this.db.query<{ ym: string; total: number }>(
      `SELECT substr(oi.date, 1, 7) AS ym, COALESCE(SUM(oi.amount), 0) AS total
       FROM other_incomes oi WHERE oi.business_id = ? AND oi.is_deleted = 0 AND oi.date >= ?
       GROUP BY ym`,
      [businessId, `${months[0]!.year}-${String(months[0]!.month).padStart(2, '0')}-01`],
    )
    const byYm = new Map(rows.map((r) => [r.ym, round2(r.total)]))
    return months.map((m) => ({
      ...m,
      total: byYm.get(`${m.year}-${String(m.month).padStart(2, '0')}`) ?? 0,
    }))
  }

  create(input: OtherIncomeInput): LocalOtherIncome {
    const businessId = this.requireBusinessId()
    const recordedById = this.getActorId()
    if (!recordedById) throw new Error('No active session.')
    if (!input.categoryId?.trim()) throw new Error('Pick a category.')
    if (!input.description?.trim()) throw new Error('Add a description.')
    const amount = round2(Number(input.amount))
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0.')

    const id = randomUUID()
    const now = new Date().toISOString()
    const incomeDate = input.date?.trim() || now.slice(0, 10)
    const businessDate = localBusinessDate(incomeDate)
    const currency = this.businessCurrency()

    this.db.run(
      `INSERT INTO other_incomes
        (id, business_id, recorded_by_id, category_id, description, amount, currency, payment_method,
         reference, source, source_id, note, date, business_date, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'MANUAL', NULL, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        businessId,
        recordedById,
        input.categoryId,
        input.description.trim(),
        amount,
        currency,
        input.paymentMethod || null,
        input.note?.trim() || null,
        incomeDate,
        businessDate,
        now,
        now,
      ],
    )
    this.enqueue(id, businessId, 'UPSERT', this.payloadFor(id, businessId), now)
    this.onMutated()
    this.audit?.log({
      action: 'CREATE',
      entityType: 'other_income',
      entityId: id,
      entityLabel: input.description.trim(),
      changes: { before: null, after: { amount, categoryId: input.categoryId } },
    })
    return this.get(id)!
  }

  update(id: string, input: OtherIncomeInput): LocalOtherIncome {
    const businessId = this.requireBusinessId()
    const existing = this.db.get<{ amount: number; description: string; source: string }>(
      `SELECT amount, description, source FROM other_incomes WHERE id = ? AND business_id = ? AND is_deleted = 0`,
      [id, businessId],
    )
    if (!existing) throw new Error('Income entry not found.')
    if (existing.source !== 'MANUAL')
      throw new Error('This income was recorded automatically and cannot be edited.')
    const amount = round2(Number(input.amount))
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0.')
    const now = new Date().toISOString()
    const incomeDate = input.date?.trim() || now.slice(0, 10)

    this.db.run(
      `UPDATE other_incomes SET category_id = ?, description = ?, amount = ?, payment_method = ?,
         note = ?, date = ?, updated_at = ? WHERE id = ? AND business_id = ?`,
      [
        input.categoryId,
        input.description.trim(),
        amount,
        input.paymentMethod || null,
        input.note?.trim() || null,
        incomeDate,
        now,
        id,
        businessId,
      ],
    )
    this.enqueue(id, businessId, 'UPSERT', this.payloadFor(id, businessId), now)
    this.onMutated()
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'other_income',
      entityId: id,
      entityLabel: input.description.trim(),
      changes: {
        before: { amount: existing.amount, description: existing.description },
        after: { amount, description: input.description.trim() },
      },
    })
    return this.get(id)!
  }

  remove(id: string): void {
    const businessId = this.requireBusinessId()
    const existing = this.db.get<{ description: string; source: string }>(
      `SELECT description, source FROM other_incomes WHERE id = ? AND business_id = ?`,
      [id, businessId],
    )
    if (!existing) return
    if (existing.source !== 'MANUAL')
      throw new Error('This income was recorded automatically and cannot be deleted.')
    const now = new Date().toISOString()
    this.db.run(
      `UPDATE other_incomes SET is_deleted = 1, updated_at = ? WHERE id = ? AND business_id = ?`,
      [now, id, businessId],
    )
    this.enqueue(id, businessId, 'DELETE', { ...this.payloadFor(id, businessId), isDeleted: true }, now)
    this.onMutated()
    this.audit?.log({
      action: 'DELETE',
      entityType: 'other_income',
      entityId: id,
      entityLabel: existing.description,
      changes: { before: { description: existing.description }, after: null },
    })
  }

  // ---- internals -----------------------------------------------------------

  private buildWhere(
    businessId: string,
    query: OtherIncomeListQuery,
  ): { where: string; params: unknown[] } {
    let where = 'oi.business_id = ? AND oi.is_deleted = 0'
    const params: unknown[] = [businessId]
    if (query.categoryId) {
      where += ' AND oi.category_id = ?'
      params.push(query.categoryId)
    }
    if (query.source) {
      where += ' AND oi.source = ?'
      params.push(query.source)
    }
    if (query.dateFrom) {
      where += ' AND oi.date >= ?'
      params.push(query.dateFrom)
    }
    if (query.dateTo) {
      where += ' AND oi.date <= ?'
      params.push(query.dateTo)
    }
    return { where, params }
  }

  private payloadFor(id: string, businessId: string): Record<string, unknown> {
    const oi = this.db.get<IncomeRow & { recorded_by_id: string | null }>(
      `SELECT ${I_COLS}, oi.recorded_by_id FROM other_incomes oi WHERE oi.id = ? AND oi.business_id = ?`,
      [id, businessId],
    )!
    return {
      id,
      businessId,
      categoryId: oi.category_id,
      recordedById: oi.recorded_by_id,
      description: oi.description,
      amount: oi.amount,
      currency: oi.currency,
      incomeDate: oi.income_date,
      paymentMethod: oi.payment_method,
      reference: oi.reference,
      source: oi.source,
      note: oi.note,
      createdAt: oi.created_at,
    }
  }

  private enqueue(
    recordId: string,
    businessId: string,
    operation: 'UPSERT' | 'DELETE',
    payload: Record<string, unknown>,
    now: string,
  ): void {
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'otherIncomes', ?, ?, ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), recordId, operation, JSON.stringify({ ...payload, businessId }), now, now],
    )
  }

  private businessCurrency(): string {
    const businessId = this.getBusinessId()
    if (!businessId) return 'XAF'
    return (
      this.db.get<{ currency: string }>(`SELECT currency FROM local_businesses WHERE id = ?`, [
        businessId,
      ])?.currency ?? 'XAF'
    )
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }
}

/** This business's income categories (read for filter/picker; create business ones). */
export class IncomeCategoriesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly onMutated: () => void,
    private readonly audit?: AuditLogger,
  ) {}

  listAll(): LocalIncomeCategory[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const rows = this.db.query<{
      id: string
      name: string
      slug: string | null
      color: string | null
      icon: string | null
      sort_order: number
      count: number
    }>(
      `SELECT c.id, c.name, c.slug, c.color, c.icon, c.sort_order,
              (SELECT COUNT(*) FROM other_incomes oi WHERE oi.category_id = c.id AND oi.is_deleted = 0) AS count
       FROM income_categories c
       WHERE c.is_deleted = 0 AND c.business_id = ?
       ORDER BY c.sort_order ASC, c.name ASC`,
      [businessId],
    )
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      color: r.color,
      icon: r.icon,
      sortOrder: r.sort_order,
      incomeCount: r.count,
    }))
  }

  create(input: IncomeCategoryInput): LocalIncomeCategory {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    if (!input.name?.trim()) throw new Error('Category name is required.')
    const id = randomUUID()
    const now = new Date().toISOString()
    const slug = slugify(input.name)
    const nextOrder =
      (this.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM income_categories WHERE business_id = ?`,
        [businessId],
      )?.n ?? 0) + 100
    this.db.run(
      `INSERT INTO income_categories (id, business_id, name, slug, color, icon, sort_order, is_active, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
      [id, businessId, input.name.trim(), slug, input.color, input.icon ?? null, nextOrder, now, now],
    )
    this.enqueue(
      id,
      businessId,
      { name: input.name.trim(), color: input.color, icon: input.icon ?? null, sortOrder: nextOrder, createdAt: now, updatedAt: now },
      now,
    )
    this.onMutated()
    this.audit?.log({
      action: 'CREATE',
      entityType: 'income_category',
      entityId: id,
      entityLabel: input.name.trim(),
      changes: { before: null, after: { name: input.name.trim() } },
    })
    return {
      id,
      name: input.name.trim(),
      slug,
      color: input.color,
      icon: input.icon ?? null,
      sortOrder: nextOrder,
      incomeCount: 0,
    }
  }

  private enqueue(
    recordId: string,
    businessId: string,
    payload: Record<string, unknown>,
    now: string,
  ): void {
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'incomeCategories', ?, 'UPSERT', ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), recordId, JSON.stringify({ ...payload, businessId }), now, now],
    )
  }
}

// ---- helpers ----------------------------------------------------------------
function toLocalIncome(r: IncomeRow): LocalOtherIncome {
  return {
    id: r.id,
    categoryId: r.category_id,
    categoryName: r.category_name,
    categoryColor: r.category_color,
    description: r.description,
    amount: r.amount,
    currency: r.currency,
    paymentMethod: r.payment_method,
    reference: r.reference,
    source: r.source,
    note: r.note,
    date: r.income_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'income'
  )
}

function dayCount(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime()
  const b = new Date(`${to}T00:00:00Z`).getTime()
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1)
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function lastSixMonths(): IncomeTrendItem[] {
  const out: IncomeTrendItem[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    out.push({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      label: d.toLocaleDateString('en', { month: 'short' }),
      total: 0,
    })
  }
  return out
}
