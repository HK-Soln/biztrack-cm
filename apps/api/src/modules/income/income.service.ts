import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import {
  type IncomeCategoryView,
  type JwtPayload,
  type ListOtherIncomeQuery,
  type OtherIncomeListResult,
  type OtherIncomeSource,
  type OtherIncomeSummary,
  type OtherIncomeView,
} from '@biztrack/types'
import { AppBadRequestException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { OtherIncome } from '@/entities/other-income.entity'
import { IncomeCategory } from '@/entities/income-category.entity'
import { BusinessCalendarService } from '@/modules/business-calendar/business-calendar.service'
import { PostingDateService } from '@/modules/fiscal/posting-date.service'

/** Parameters for booking a non-trading income entry (shared by manual entry + link/deposit settlement). */
export interface RecordIncomeParams {
  categoryId: string
  description: string
  amount: number
  currency?: string
  paymentMethod?: string | null
  reference?: string | null
  source: OtherIncomeSource
  sourceId?: string | null
  note?: string | null
  recordedById?: string | null
  /** Effective date; defaults to now. Business/posting dates are derived from it. */
  date?: Date
}

/**
 * Spec 10 ① — the Other Income ledger. Books non-trading income (general payment-link settlements,
 * deposit-cancellation charges, manual entries) on the same financial grain as expenses
 * (business_date / posting_date), and exposes the income-statement "other income" total.
 */
/** The default per-business income categories, seeded on business creation. Slugs are stable handles
 *  the automated bookings resolve against (deposit charges → 'deposit-charges'). */
export const DEFAULT_INCOME_CATEGORIES: ReadonlyArray<{
  name: string
  slug: string
  color: string
  sortOrder: number
}> = [
  { name: 'Delivery fees', slug: 'delivery-fees', color: '#0EA5E9', sortOrder: 10 },
  { name: 'Deposit charges', slug: 'deposit-charges', color: '#8B5CF6', sortOrder: 20 },
  { name: 'Miscellaneous', slug: 'miscellaneous', color: '#64748B', sortOrder: 30 },
]

@Injectable()
export class IncomeService {
  constructor(
    @InjectRepository(OtherIncome)
    private readonly incomes: Repository<OtherIncome>,
    @InjectRepository(IncomeCategory)
    private readonly categories: Repository<IncomeCategory>,
    private readonly calendar: BusinessCalendarService,
    private readonly postingDate: PostingDateService,
  ) {}

  /** Core write: stamp the business + posting dates and persist. Used everywhere income is recognized.
   *  Pass `manager` to enlist in a caller's transaction (e.g. the deposit-charge dual-write). */
  async record(
    businessId: string,
    params: RecordIncomeParams,
    manager?: EntityManager,
  ): Promise<OtherIncome> {
    const repo = manager ? manager.getRepository(OtherIncome) : this.incomes
    const when = params.date ?? new Date()
    const businessDate = await this.calendar.computeForBusiness(businessId, when)
    const posting = await this.postingDate.resolve(businessId, businessDate, manager)
    return repo.save(
      repo.create({
        businessId,
        recordedById: params.recordedById ?? null,
        categoryId: params.categoryId,
        description: params.description,
        amount: this.round(params.amount),
        currency: params.currency ?? 'XAF',
        paymentMethod: params.paymentMethod ?? null,
        reference: params.reference ?? null,
        source: params.source,
        sourceId: params.sourceId ?? null,
        note: params.note ?? null,
        date: when,
        businessDate,
        postingDate: posting.postingDate,
        isLateArrival: posting.isLateArrival,
        originalPeriodId: posting.originalPeriodId,
      }),
    )
  }

  /** Record a manual other-income entry (merchant, authed). */
  async create(
    businessId: string,
    user: JwtPayload,
    dto: {
      categoryId: string
      description: string
      amount: number
      paymentMethod?: string
      note?: string
      date?: string
    },
  ): Promise<OtherIncomeView> {
    const category = await this.resolveCategory(dto.categoryId, businessId)
    const income = await this.record(businessId, {
      categoryId: category.id,
      description: dto.description.trim(),
      amount: dto.amount,
      paymentMethod: dto.paymentMethod ?? null,
      note: dto.note ?? null,
      source: 'MANUAL',
      recordedById: user.sub,
      date: dto.date ? new Date(dto.date) : undefined,
    })
    return this.toView(income, category.name)
  }

  async list(businessId: string, query: ListOtherIncomeQuery): Promise<OtherIncomeListResult> {
    const page = Math.max(1, query.page ?? 1)
    const limit = Math.min(100, Math.max(1, query.limit ?? 20))
    const qb = this.incomes
      .createQueryBuilder('oi')
      .leftJoinAndSelect('oi.category', 'cat')
      .where('oi.business_id = :businessId', { businessId })
    if (query.categoryId) qb.andWhere('oi.category_id = :cid', { cid: query.categoryId })
    if (query.from) qb.andWhere('oi.date >= :from', { from: query.from })
    if (query.to) qb.andWhere('oi.date <= :to', { to: query.to })
    qb.orderBy('oi.date', 'DESC')
      .addOrderBy('oi.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
    const [rows, total] = await qb.getManyAndCount()
    return {
      items: rows.map((r) => this.toView(r, r.category?.name ?? '')),
      total,
      page,
      limit,
    }
  }

  /** Create a business income category ("add a new category" on the Other Income page). */
  async createCategory(
    businessId: string,
    dto: { name: string; color?: string; icon?: string },
  ): Promise<IncomeCategoryView> {
    const name = dto.name.trim()
    if (!name) throw new AppBadRequestException('A category name is required.', 'INCOME_CATEGORY_NAME_REQUIRED')
    const count = await this.categories.count({ where: { businessId } })
    const category = await this.categories.save(
      this.categories.create({
        businessId,
        name,
        slug: this.slugify(name),
        color: (dto.color?.trim() || '#64748B').toUpperCase(),
        icon: dto.icon?.trim() ?? null,
        sortOrder: 100 + count,
      }),
    )
    return {
      id: category.id,
      businessId: category.businessId,
      name: category.name,
      slug: category.slug,
      color: category.color,
      icon: category.icon ?? null,
      sortOrder: category.sortOrder,
    }
  }

  /** This business's income categories, ordered for display (per-business — no system-wide sharing, so
   *  a business can carry its own per-category attributes, mirroring the expenses direction). */
  async listCategories(businessId: string): Promise<IncomeCategoryView[]> {
    const cats = await this.categories.find({
      where: { businessId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    })
    return cats.map((c) => ({
      id: c.id,
      businessId: c.businessId,
      name: c.name,
      slug: c.slug,
      color: c.color,
      icon: c.icon ?? null,
      sortOrder: c.sortOrder,
    }))
  }

  /**
   * Total other income over [from, to) on the posting-date grain — the income statement's "other
   * income" line (delivery-fee links, deposit-cancellation charges, manual entries). Upper bound is
   * exclusive to match the expenses P&L query.
   */
  async otherIncomeTotal(businessId: string, from: string, to: string): Promise<OtherIncomeSummary> {
    const row = await this.incomes
      .createQueryBuilder('oi')
      .select('COALESCE(SUM(oi.amount), 0)', 'total')
      .where('oi.business_id = :businessId', { businessId })
      .andWhere('oi.deleted_at IS NULL')
      .andWhere('COALESCE(oi.posting_date, oi.date) >= :from', { from })
      .andWhere('COALESCE(oi.posting_date, oi.date) < :to', { to })
      .getRawOne<{ total: string }>()
    return { total: Number(row?.total ?? 0), currency: 'XAF' }
  }

  /**
   * Apply a synced other-income row from a desktop device (offline manual entry). Mirrors
   * ExpensesService.upsertFromSync: last-write-wins is enforced by the caller; posting date is stamped
   * once on first arrival and preserved on re-sync.
   */
  async upsertFromSync(
    businessId: string,
    id: string,
    payload: {
      categoryId: string
      description: string
      amount: number
      incomeDate: string
      recordedById?: string | null
      fallbackRecordedById?: string | null
      currency?: string | null
      paymentMethod?: string | null
      reference?: string | null
      source?: string | null
      sourceId?: string | null
      note?: string | null
      businessDate?: string | null
      createdAt?: string
    },
    action: 'UPSERT' | 'DELETE',
    recordUpdatedAt: Date,
  ): Promise<void> {
    const existing = await this.incomes.findOne({ where: { id, businessId }, withDeleted: true })

    if (action === 'DELETE') {
      if (existing)
        await this.incomes.update(id, { deletedAt: recordUpdatedAt, updatedAt: recordUpdatedAt })
      return
    }

    await this.resolveCategory(payload.categoryId, businessId)
    const when = this.parseDate(payload.incomeDate)
    const businessDate = await this.calendar.resolveForSync(businessId, when, payload.businessDate)
    const posting = existing?.postingDate
      ? {
          postingDate: existing.postingDate,
          isLateArrival: existing.isLateArrival,
          originalPeriodId: existing.originalPeriodId ?? null,
        }
      : await this.postingDate.resolve(businessId, businessDate)

    await this.incomes.save(
      this.incomes.create({
        id,
        businessId,
        categoryId: payload.categoryId,
        recordedById: payload.recordedById ?? payload.fallbackRecordedById ?? null,
        description: payload.description.trim(),
        amount: this.round(payload.amount),
        currency: payload.currency?.trim() || 'XAF',
        paymentMethod: payload.paymentMethod ?? null,
        reference: payload.reference ?? null,
        source: payload.source ?? 'MANUAL',
        sourceId: payload.sourceId ?? null,
        note: payload.note ?? null,
        date: when,
        businessDate,
        postingDate: posting.postingDate,
        isLateArrival: posting.isLateArrival,
        originalPeriodId: posting.originalPeriodId,
        createdAt: this.parseOptionalDate(payload.createdAt) ?? existing?.createdAt ?? new Date(),
        updatedAt: recordUpdatedAt,
        deletedAt: null,
      }),
    )
  }

  /** Apply a synced income-category row (a business's own category created offline). System categories
   *  (null businessId) are pull-only and rejected upstream. */
  async upsertCategoryFromSync(
    id: string,
    businessId: string,
    payload: {
      name: string
      color: string
      icon?: string | null
      sortOrder?: number | null
      createdAt?: string
      deletedAt?: string | null
      isDeleted?: boolean
    },
    action: 'UPSERT' | 'DELETE',
    recordUpdatedAt: Date,
  ): Promise<void> {
    const existing = await this.categories.findOne({ where: { id, businessId }, withDeleted: true })

    if (action === 'DELETE' || payload.isDeleted) {
      if (existing)
        await this.categories.update(id, {
          deletedAt: this.parseOptionalDate(payload.deletedAt) ?? new Date(),
          updatedAt: recordUpdatedAt,
        })
      return
    }

    await this.categories.save(
      this.categories.create({
        id,
        businessId,
        name: payload.name.trim(),
        slug: existing?.slug ?? this.slugify(payload.name),
        color: payload.color.trim().toUpperCase(),
        icon: payload.icon?.trim() ?? null,
        sortOrder: payload.sortOrder ?? 0,
        createdAt: this.parseOptionalDate(payload.createdAt) ?? existing?.createdAt ?? new Date(),
        updatedAt: recordUpdatedAt,
        deletedAt: null,
      }),
    )
  }

  /** Resolve one of the business's own income categories. */
  async resolveCategory(categoryId: string, businessId: string): Promise<IncomeCategory> {
    const category = await this.categories.findOne({ where: { id: categoryId, businessId } })
    if (!category)
      throw new AppNotFoundException('Income category not found.', 'INCOME_CATEGORY_NOT_FOUND')
    return category
  }

  /** Seed the default income categories for a business (idempotent) — called on business creation and
   *  backfilled for existing businesses by migration. */
  async seedDefaults(businessId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(IncomeCategory) : this.categories
    const now = new Date()
    for (const def of DEFAULT_INCOME_CATEGORIES) {
      const exists = await repo.findOne({ where: { businessId, slug: def.slug }, withDeleted: true })
      if (exists) continue
      await repo.save(
        repo.create({
          businessId,
          name: def.name,
          slug: def.slug,
          color: def.color,
          sortOrder: def.sortOrder,
          createdAt: now,
          updatedAt: now,
        }),
      )
    }
  }

  /** Find (or create) a business income category by its stable slug — used by automated bookings
   *  (deposit-cancellation charges) which have no user-chosen category. Self-heals if seeding was
   *  missed. */
  async ensureCategoryBySlug(
    businessId: string,
    slug: string,
    name: string,
    color: string,
    manager?: EntityManager,
  ): Promise<IncomeCategory> {
    const repo = manager ? manager.getRepository(IncomeCategory) : this.categories
    const existing = await repo.findOne({ where: { businessId, slug } })
    if (existing) return existing
    return repo.save(repo.create({ businessId, name, slug, color, sortOrder: 20 }))
  }

  private toView(income: OtherIncome, categoryName: string): OtherIncomeView {
    return {
      id: income.id,
      categoryId: income.categoryId,
      categoryName,
      description: income.description,
      amount: Number(income.amount),
      currency: income.currency,
      paymentMethod: income.paymentMethod ?? null,
      reference: income.reference ?? null,
      source: income.source as OtherIncomeSource,
      note: income.note ?? null,
      date: typeof income.date === 'string' ? income.date : income.date.toISOString().slice(0, 10),
      createdAt: income.createdAt.toISOString(),
    }
  }

  private round(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100
  }

  private parseDate(value: string): Date {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value)
    return isNaN(d.getTime()) ? new Date() : d
  }

  private parseOptionalDate(value?: string | null): Date | undefined {
    if (!value) return undefined
    const d = new Date(value)
    return isNaN(d.getTime()) ? undefined : d
  }

  private slugify(name: string): string {
    return (
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 100) || 'income'
    )
  }
}
