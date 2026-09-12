import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, IsNull, Repository } from 'typeorm'
import {
  type IncomeCategoryView,
  type JwtPayload,
  type ListOtherIncomeQuery,
  type OtherIncomeListResult,
  type OtherIncomeSource,
  type OtherIncomeSummary,
  type OtherIncomeView,
} from '@biztrack/types'
import { AppNotFoundException } from '@/common/exceptions/app-exceptions'
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
@Injectable()
export class IncomeService {
  // Seeded system income categories (migration 1789200000000). Referenced by settlement/deposit code.
  static readonly SYS_CATEGORY_DELIVERY = '00000000-0000-4000-a000-0000000000d1'
  static readonly SYS_CATEGORY_DEPOSIT_CHARGE = '00000000-0000-4000-a000-0000000000d2'
  static readonly SYS_CATEGORY_MISC = '00000000-0000-4000-a000-0000000000d3'

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

  /** System (shared) + this business's income categories, ordered for display. */
  async listCategories(businessId: string): Promise<IncomeCategoryView[]> {
    const cats = await this.categories.find({
      where: [{ businessId: IsNull() }, { businessId }],
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

  /** Resolve a category the business may use: one of its own or a system (shared) category. */
  async resolveCategory(categoryId: string, businessId: string): Promise<IncomeCategory> {
    const category = await this.categories.findOne({
      where: [
        { id: categoryId, businessId: IsNull() },
        { id: categoryId, businessId },
      ],
    })
    if (!category)
      throw new AppNotFoundException('Income category not found.', 'INCOME_CATEGORY_NOT_FOUND')
    return category
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
}
