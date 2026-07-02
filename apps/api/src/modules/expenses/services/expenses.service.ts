import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type {
  ExpenseCategoryRangeItem,
  ExpenseMonthlyRangeItem,
  ExpensePnlSummary,
  ExpensesQuery,
  JwtPayload,
} from '@biztrack/types'
import { BusinessMemberRole, ExpenseStatus, PaymentMethod } from '@biztrack/types'
import type { Logger, LogMetadata } from '@biztrack/logger'
import { I18nService } from 'nestjs-i18n'
import { IsNull, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppForbiddenException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { DailySaleSummary } from '@/entities/daily-sale-summary.entity'
import { Expense } from '@/entities/expense.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import type { CreateExpenseDto } from '../dto/create-expense.dto'
import type { UpdateExpenseDto } from '../dto/update-expense.dto'
import { ExpenseCategoriesService } from './expense-categories.service'
import { MonthlyExpenseSummaryService } from './monthly-expense-summary.service'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface ExpenseCategorySlice {
  categoryId: string
  name: string
  color: string
  amount: number
  percentage: number
}
export interface ExpenseSummaryCard {
  total: number
  count: number
  previousTotal: number
  changePct: number
  avgPerDay: number
  pendingCount: number
  pendingAmount: number
  largest: ExpenseCategorySlice | null
  byCategory: ExpenseCategorySlice[]
  currency: string
}
export interface ExpenseTrendItem {
  year: number
  month: number
  label: string
  total: number
}

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly expensesRepo: Repository<Expense>,
    @InjectRepository(DailySaleSummary)
    private readonly dailySaleSummariesRepo: Repository<DailySaleSummary>,
    private readonly categoriesService: ExpenseCategoriesService,
    private readonly monthlySummaryService: MonthlyExpenseSummaryService,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('ExpensesService')
  }

  async create(businessId: string, user: JwtPayload, dto: CreateExpenseDto) {
    try {
      this.assertManageAccess(user)
      const category = await this.categoriesService.resolveAccessibleCategory(dto.categoryId, businessId)
      const expenseDate = this.parseExpenseDate(dto.expenseDate)
      const expense = await this.expensesRepo.save(
        this.expensesRepo.create({
          businessId,
          categoryId: category.id,
          recordedById: user.sub,
          description: dto.description.trim(),
          amount: this.roundMoney(dto.amount),
          currency: 'XAF',
          // Pending expenses carry no payment method until settled.
          paymentMethod: (dto.status ?? ExpenseStatus.PAID) === ExpenseStatus.PENDING ? null : this.normalizePaymentMethod(dto.paymentMethod),
          receiptUrl: this.normalizeOptionalString(dto.receiptUrl),
          vendor: this.normalizeOptionalString(dto.vendor),
          notes: this.normalizeOptionalString(dto.notes),
          isRecurring: dto.isRecurring ?? false,
          status: dto.status ?? ExpenseStatus.PAID,
          date: expenseDate,
        }),
      )

      await this.rebuildExpenseMonth(businessId, expenseDate)
      return this.findById(expense.id, businessId)
    } catch (error) {
      return this.handleServiceError('create', error, { businessId, userId: user.sub })
    }
  }

  async update(id: string, businessId: string, user: JwtPayload, dto: UpdateExpenseDto) {
    try {
      this.assertManageAccess(user)
      const existing = await this.findEntityById(id, businessId)
      const previousDateKey = this.toDateKey(existing.date)
      const nextDate = dto.expenseDate ? this.parseExpenseDate(dto.expenseDate) : existing.date
      const nextCategoryId = dto.categoryId
        ? (await this.categoriesService.resolveAccessibleCategory(dto.categoryId, businessId)).id
        : existing.categoryId

      const nextAmount = dto.amount === undefined ? existing.amount : this.roundMoney(dto.amount)
      const nextRecurring = dto.isRecurring ?? existing.isRecurring
      const nextStatus = dto.status ?? existing.status

      await this.expensesRepo.update(id, {
        categoryId: nextCategoryId,
        description: dto.description?.trim() ?? existing.description,
        amount: nextAmount,
        // Pending → no payment method; otherwise keep/replace it.
        paymentMethod:
          nextStatus === ExpenseStatus.PENDING
            ? null
            : dto.paymentMethod === undefined
              ? existing.paymentMethod ?? this.normalizePaymentMethod(undefined)
              : this.normalizePaymentMethod(dto.paymentMethod),
        receiptUrl:
          dto.receiptUrl === undefined
            ? existing.receiptUrl ?? null
            : this.normalizeOptionalString(dto.receiptUrl),
        vendor:
          dto.vendor === undefined ? existing.vendor ?? null : this.normalizeOptionalString(dto.vendor),
        notes: dto.notes === undefined ? existing.notes ?? null : this.normalizeOptionalString(dto.notes),
        isRecurring: nextRecurring,
        status: nextStatus,
        date: nextDate,
        updatedAt: new Date(),
      })

      const nextDateKey = this.toDateKey(nextDate)
      const dateChanged = previousDateKey !== nextDateKey
      const amountChanged = nextAmount !== existing.amount
      const categoryChanged = nextCategoryId !== existing.categoryId
      const recurringChanged = nextRecurring !== existing.isRecurring

      if (dateChanged) {
        await this.rebuildExpenseMonth(businessId, existing.date)
        await this.rebuildExpenseMonth(businessId, nextDate)
      } else if (amountChanged || categoryChanged || recurringChanged) {
        await this.rebuildExpenseMonth(businessId, nextDate)
      }

      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('update', error, { id, businessId, userId: user.sub })
    }
  }

  async remove(id: string, businessId: string, user: JwtPayload): Promise<void> {
    try {
      this.assertManageAccess(user)
      const existing = await this.findEntityById(id, businessId)
      await this.expensesRepo.softDelete(id)
      await this.rebuildExpenseMonth(businessId, existing.date)
    } catch (error) {
      return this.handleServiceError('remove', error, { id, businessId, userId: user.sub })
    }
  }

  async findAll(businessId: string, query: ExpensesQuery) {
    try {
      if (query.dateFrom && query.dateTo) {
        await this.assertValidDateRange(query.dateFrom, query.dateTo)
      }

      const qb = this.expensesRepo
        .createQueryBuilder('expense')
        .leftJoinAndSelect('expense.category', 'category')
        .leftJoinAndSelect('expense.recordedBy', 'recordedBy')
        .where('expense.business_id = :businessId', { businessId })
        .andWhere('expense.deleted_at IS NULL')

      if (query.dateFrom) {
        qb.andWhere('expense.date >= :dateFrom', {
          dateFrom: this.parseDateOnly(query.dateFrom),
        })
      }

      if (query.dateTo) {
        const endExclusive = this.parseDateOnly(query.dateTo)
        endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
        qb.andWhere('expense.date < :dateToExclusive', { dateToExclusive: endExclusive })
      }

      if (query.categoryId) {
        qb.andWhere('expense.category_id = :categoryId', { categoryId: query.categoryId })
      }

      if (query.isRecurring !== undefined) {
        qb.andWhere('expense.is_recurring = :isRecurring', { isRecurring: query.isRecurring })
      }

      if (query.search?.trim()) {
        qb.andWhere(
          '(LOWER(expense.description) LIKE :search OR LOWER(COALESCE(expense.vendor, \'\')) LIKE :search)',
          { search: `%${query.search.trim().toLowerCase()}%` },
        )
      }

      const sort = this.resolveSortField(query.sortBy)
      const sortOrder = query.sortOrder ?? 'DESC'
      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
      const skip = (page - 1) * limit
      const totalRow = await qb
        .clone()
        .select('COALESCE(SUM(expense.amount), 0)', 'totalAmount')
        .getRawOne<{ totalAmount: string | number | null }>()
      const [rows, total] = await qb.orderBy(sort, sortOrder).skip(skip).take(limit).getManyAndCount()

      return {
        data: rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalAmount: this.roundMoney(Number(totalRow?.totalAmount ?? 0)),
      }
    } catch (error) {
      return this.handleServiceError('findAll', error, { businessId })
    }
  }

  async findById(id: string, businessId: string) {
    try {
      const expense = await this.expensesRepo
        .createQueryBuilder('expense')
        .leftJoinAndSelect('expense.category', 'category')
        .leftJoinAndSelect('expense.recordedBy', 'recordedBy')
        .where('expense.id = :id', { id })
        .andWhere('expense.business_id = :businessId', { businessId })
        .andWhere('expense.deleted_at IS NULL')
        .getOne()

      if (!expense) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.expense_not_found' as never),
          'EXPENSE_NOT_FOUND',
        )
      }

      return expense
    } catch (error) {
      return this.handleServiceError('findById', error, { id, businessId })
    }
  }

  async getMonthlySummary(businessId: string, year: number, month: number) {
    try {
      return this.monthlySummaryService.getMonthly(businessId, year, month)
    } catch (error) {
      return this.handleServiceError('getMonthlySummary', error, { businessId, year, month })
    }
  }

  async getRangeSummary(
    businessId: string,
    dateFrom: string,
    dateTo: string,
    groupBy: 'MONTH' | 'CATEGORY' = 'MONTH',
  ): Promise<ExpenseMonthlyRangeItem[] | ExpenseCategoryRangeItem[]> {
    try {
      await this.assertValidDateRange(dateFrom, dateTo)
      await this.assertRangeWithinTwelveMonths(dateFrom, dateTo)

      if (groupBy === 'CATEGORY') {
        return this.monthlySummaryService.getRangeByCategory(businessId, dateFrom, dateTo)
      }

      return this.monthlySummaryService.getRangeByMonth(businessId, dateFrom, dateTo)
    } catch (error) {
      return this.handleServiceError('getRangeSummary', error, {
        businessId,
        dateFrom,
        dateTo,
        groupBy,
      })
    }
  }

  async getPnlSummary(businessId: string, year: number, month: number): Promise<ExpensePnlSummary> {
    try {
      const expenseSummary = await this.monthlySummaryService.getMonthly(businessId, year, month)
      const { start, endExclusive } = this.getMonthWindow(year, month)
      const raw = await this.dailySaleSummariesRepo
        .createQueryBuilder('summary')
        .select('COALESCE(SUM(summary.total_revenue), 0)', 'revenue')
        .addSelect('COALESCE(SUM(summary.total_cost), 0)', 'costOfGoods')
        .where('summary.business_id = :businessId', { businessId })
        .andWhere('summary.summary_date >= :startDate', { startDate: start.toISOString().slice(0, 10) })
        .andWhere('summary.summary_date < :endDate', { endDate: endExclusive.toISOString().slice(0, 10) })
        .getRawOne<{ revenue: string | number | null; costOfGoods: string | number | null }>()

      const revenue = this.roundMoney(Number(raw?.revenue ?? 0))
      const costOfGoods = this.roundMoney(Number(raw?.costOfGoods ?? 0))
      const grossProfit = this.roundMoney(revenue - costOfGoods)
      const totalExpenses = expenseSummary.totalAmount
      const netProfit = this.roundMoney(grossProfit - totalExpenses)

      return {
        year,
        month,
        revenue,
        costOfGoods,
        grossProfit,
        grossMarginPercent: revenue > 0 ? this.roundPercentage((grossProfit / revenue) * 100) : 0,
        totalExpenses,
        expenseBreakdown: expenseSummary.categoryBreakdown,
        netProfit,
        netMarginPercent: revenue > 0 ? this.roundPercentage((netProfit / revenue) * 100) : 0,
        isProfitable: netProfit > 0,
      }
    } catch (error) {
      return this.handleServiceError('getPnlSummary', error, { businessId, year, month })
    }
  }

  /** Expense summary cards (total/byCategory/pending/change), matching the desktop expenses.summary. */
  async getSummaryCard(
    businessId: string,
    query: { categoryId?: string; status?: string; dateFrom?: string; dateTo?: string },
  ): Promise<ExpenseSummaryCard> {
    try {
      const params: unknown[] = [businessId]
      const conds = ['e.business_id = $1', 'e.deleted_at IS NULL']
      if (query.categoryId) {
        params.push(query.categoryId)
        conds.push(`e.category_id = $${params.length}`)
      }
      if (query.status) {
        params.push(query.status)
        conds.push(`e.status = $${params.length}`)
      }
      if (query.dateFrom) {
        params.push(query.dateFrom)
        conds.push(`e.date >= $${params.length}`)
      }
      if (query.dateTo) {
        params.push(query.dateTo)
        conds.push(`e.date <= $${params.length}`)
      }
      const where = conds.join(' AND ')
      const mgr = this.expensesRepo.manager

      const [tot] = (await mgr.query(
        `SELECT COALESCE(SUM(e.amount), 0) AS total, COUNT(*)::int AS n FROM expenses e WHERE ${where}`,
        params,
      )) as Array<{ total: string; n: number }>
      const cats = (await mgr.query(
        `SELECT e.category_id AS "categoryId",
                (SELECT c.name FROM expense_categories c WHERE c.id = e.category_id) AS name,
                (SELECT c.color FROM expense_categories c WHERE c.id = e.category_id) AS color,
                COALESCE(SUM(e.amount), 0) AS amount
         FROM expenses e WHERE ${where} GROUP BY e.category_id ORDER BY amount DESC`,
        params,
      )) as Array<{ categoryId: string; name: string | null; color: string | null; amount: string }>
      const [pending] = (await mgr.query(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(e.amount), 0) AS amt FROM expenses e WHERE ${where} AND e.status = 'PENDING'`,
        params,
      )) as Array<{ n: number; amt: string }>
      const [biz] = (await mgr.query(`SELECT currency FROM businesses WHERE id = $1`, [businessId])) as Array<{
        currency: string | null
      }>

      const total = this.roundMoney(Number(tot?.total ?? 0))
      const byCategory = cats.map((c) => {
        const amount = this.roundMoney(Number(c.amount ?? 0))
        return {
          categoryId: c.categoryId,
          name: c.name ?? '',
          color: c.color ?? '#9ca3af',
          amount,
          percentage: total > 0 ? this.roundPercentage((amount / total) * 100) : 0,
        }
      })

      // Previous-period total (same span immediately before dateFrom) for the change %.
      let previousTotal = 0
      let days = 30
      if (query.dateFrom && query.dateTo) {
        const from = new Date(query.dateFrom)
        const to = new Date(query.dateTo)
        const spanMs = to.getTime() - from.getTime()
        days = Math.max(1, Math.round(spanMs / 86_400_000) + 1)
        const prevTo = new Date(from.getTime() - 86_400_000)
        const prevFrom = new Date(prevTo.getTime() - spanMs)
        const iso = (d: Date) => d.toISOString().slice(0, 10)
        const [prev] = (await mgr.query(
          `SELECT COALESCE(SUM(amount), 0) AS t FROM expenses WHERE business_id = $1 AND deleted_at IS NULL AND date >= $2 AND date <= $3`,
          [businessId, iso(prevFrom), iso(prevTo)],
        )) as Array<{ t: string }>
        previousTotal = this.roundMoney(Number(prev?.t ?? 0))
      }

      return {
        total,
        count: Number(tot?.n ?? 0),
        previousTotal,
        changePct: previousTotal > 0 ? this.roundPercentage(((total - previousTotal) / previousTotal) * 100) : 0,
        avgPerDay: this.roundMoney(total / days),
        pendingCount: Number(pending?.n ?? 0),
        pendingAmount: this.roundMoney(Number(pending?.amt ?? 0)),
        largest: byCategory[0] ?? null,
        byCategory,
        currency: biz?.currency ?? 'XAF',
      }
    } catch (error) {
      return this.handleServiceError('getSummaryCard', error, { businessId })
    }
  }

  /** Monthly expense totals for the last 12 months (trend chart). */
  async getTrend(businessId: string): Promise<ExpenseTrendItem[]> {
    try {
      const since = new Date()
      since.setMonth(since.getMonth() - 11)
      since.setDate(1)
      const sinceIso = since.toISOString().slice(0, 10)
      const rows = (await this.expensesRepo.manager.query(
        `SELECT to_char(e.date, 'YYYY-MM') AS ym, COALESCE(SUM(e.amount), 0) AS total
         FROM expenses e WHERE e.business_id = $1 AND e.deleted_at IS NULL AND e.date >= $2
         GROUP BY ym ORDER BY ym`,
        [businessId, sinceIso],
      )) as Array<{ ym: string; total: string }>
      const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      return rows.map((r) => {
        const parts = r.ym.split('-')
        const y = Number(parts[0])
        const m = Number(parts[1])
        return { year: y, month: m, label: `${MONTHS[m - 1] ?? ''} ${y}`, total: this.roundMoney(Number(r.total ?? 0)) }
      })
    } catch (error) {
      return this.handleServiceError('getTrend', error, { businessId })
    }
  }

  async upsertFromSync(
    businessId: string,
    expenseId: string,
    payload: {
      description: string
      amount: number
      expenseDate: string
      categoryId: string
      recordedById?: string | null
      fallbackRecordedById?: string | null
      vendor?: string | null
      notes?: string | null
      isRecurring?: boolean
      status?: string | null
      paymentMethod?: PaymentMethod | string | null
      receiptUrl?: string | null
      currency?: string | null
      createdAt?: string
    },
    action: 'UPSERT' | 'DELETE',
    recordUpdatedAt: Date,
  ) {
    try {
      const existing = await this.expensesRepo.findOne({
        where: { id: expenseId, businessId },
        withDeleted: true,
      })

      if (action === 'DELETE') {
        if (!existing) {
          return
        }

        await this.expensesRepo.update(expenseId, {
          deletedAt: recordUpdatedAt,
          updatedAt: recordUpdatedAt,
        })
        await this.rebuildExpenseMonth(businessId, existing.date)
        return
      }

      await this.categoriesService.resolveAccessibleCategory(payload.categoryId, businessId)
      const expenseDate = this.parseExpenseDate(payload.expenseDate)
      const recordedById = this.resolveSyncRecordedById(payload)
      const createdAt =
        this.parseOptionalDate(payload.createdAt) ?? existing?.createdAt ?? new Date()
      const previousDate = existing?.date ?? null

      await this.expensesRepo.save(
        this.expensesRepo.create({
          id: expenseId,
          businessId,
          categoryId: payload.categoryId,
          recordedById,
          description: payload.description.trim(),
          amount: this.roundMoney(payload.amount),
          currency: payload.currency?.trim() || 'XAF',
          paymentMethod: payload.status === ExpenseStatus.PENDING || !payload.paymentMethod ? null : this.normalizePaymentMethod(payload.paymentMethod),
          receiptUrl: this.normalizeOptionalString(payload.receiptUrl),
          vendor: this.normalizeOptionalString(payload.vendor),
          notes: this.normalizeOptionalString(payload.notes),
          isRecurring: payload.isRecurring ?? false,
          status: payload.status === ExpenseStatus.PENDING ? ExpenseStatus.PENDING : ExpenseStatus.PAID,
          date: expenseDate,
          createdAt,
          updatedAt: recordUpdatedAt,
          deletedAt: null,
        }),
      )

      if (previousDate && this.toDateKey(previousDate) !== this.toDateKey(expenseDate)) {
        await this.rebuildExpenseMonth(businessId, previousDate)
      }

      await this.rebuildExpenseMonth(businessId, expenseDate)
    } catch (error) {
      return this.handleServiceError('upsertFromSync', error, {
        businessId,
        expenseId,
      })
    }
  }

  private async findEntityById(id: string, businessId: string) {
    const expense = await this.expensesRepo.findOne({
      where: {
        id,
        businessId,
        deletedAt: IsNull(),
      },
    })

    if (!expense) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.expense_not_found' as never),
        'EXPENSE_NOT_FOUND',
      )
    }

    return expense
  }

  private assertManageAccess(user: JwtPayload) {
    if (![BusinessMemberRole.OWNER, BusinessMemberRole.MANAGER].includes(user.role as BusinessMemberRole)) {
      throw new AppForbiddenException(
        'Only owners and managers can manage expenses.',
        'FORBIDDEN',
      )
    }
  }

  private async assertValidDateRange(dateFrom: string, dateTo: string) {
    if (dateFrom > dateTo) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.invalid_date_range' as never),
        'INVALID_DATE_RANGE',
      )
    }
  }

  private async assertRangeWithinTwelveMonths(dateFrom: string, dateTo: string) {
    const start = this.parseDateOnly(dateFrom)
    const end = this.parseDateOnly(dateTo)
    const months =
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth())

    if (months > 11) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.date_range_too_large' as never),
        'DATE_RANGE_TOO_LARGE',
      )
    }
  }

  /** Parse a YYYY-MM-DD value (no future-date constraint). Use for filter bounds. */
  private parseDateOnly(value: string) {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    if (Number.isNaN(parsed.getTime())) {
      throw new AppBadRequestException('Invalid expense date.', 'INVALID_EXPENSE_DATE')
    }
    return parsed
  }

  /**
   * Parse an expense's OWN date — must not be in the future. (Filter bounds like a list's
   * dateTo use parseDateOnly: "today" can read as future across timezones, and a range
   * upper bound is legitimately allowed to be today/future.)
   */
  private parseExpenseDate(value: string) {
    const parsed = this.parseDateOnly(value)
    const today = new Date()
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    if (parsed.getTime() > todayUtc.getTime()) {
      throw new AppBadRequestException(
        'Expense date cannot be in the future.',
        'FUTURE_DATE_NOT_ALLOWED',
      )
    }
    return parsed
  }

  private rebuildExpenseMonth(businessId: string, value: Date) {
    return this.monthlySummaryService.rebuildMonth(
      businessId,
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
    )
  }

  private resolveSortField(sortBy?: string) {
    // Entity PROPERTY paths (not raw columns): findAll joins category/recordedBy +
    // paginates, so TypeORM resolves orderBy against entity metadata — raw columns
    // (expense.created_at) break it with a databaseName error.
    const sortMap: Record<string, string> = {
      expenseDate: 'expense.date',
      amount: 'expense.amount',
      createdAt: 'expense.createdAt',
      updatedAt: 'expense.updatedAt',
      description: 'expense.description',
    }

    return sortMap[sortBy ?? ''] ?? 'expense.date'
  }

  private normalizePaymentMethod(value?: PaymentMethod | string | null) {
    if (!value) {
      return PaymentMethod.CASH
    }

    return Object.values(PaymentMethod).includes(value as PaymentMethod)
      ? (value as PaymentMethod)
      : PaymentMethod.CASH
  }

  private normalizeOptionalString(value?: string | null) {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  }

  private toDateKey(value: Date) {
    return value.toISOString().slice(0, 10)
  }

  private getMonthWindow(year: number, month: number) {
    const start = new Date(Date.UTC(year, month - 1, 1))
    const endExclusive = new Date(Date.UTC(year, month, 1))
    return { start, endExclusive }
  }

  private parseOptionalDate(value?: string | null) {
    if (!value) {
      return null
    }

    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  private resolveSyncRecordedById(payload: {
    recordedById?: string | null
    fallbackRecordedById?: string | null
  }) {
    if (payload.recordedById && UUID_REGEX.test(payload.recordedById)) {
      return payload.recordedById
    }

    if (payload.fallbackRecordedById && UUID_REGEX.test(payload.fallbackRecordedById)) {
      return payload.fallbackRecordedById
    }

    throw new AppBadRequestException(
      'Expense recorder is required.',
      'EXPENSE_RECORDED_BY_REQUIRED',
    )
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100
  }

  private roundPercentage(value: number) {
    return Math.round(value * 10) / 10
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('ExpensesService error', 'ExpensesService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    this.logger.error('ExpensesService unexpected error', 'ExpensesService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'EXPENSES_SERVICE_ERROR',
      { action },
    )
  }
}
