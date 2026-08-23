import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PeriodStatus, type AccountingPeriodSyncRecord } from '@biztrack/types'
import {
  DEFAULT_BUSINESS_TIMEZONE,
  clampFiscalYearStartMonth,
  fiscalYearOf,
  generateFiscalPeriods,
  localDateInTimezone,
} from '@biztrack/utils'
import { Business } from '@/entities/business.entity'
import { FiscalYear } from '@/entities/fiscal-year.entity'
import { AccountingPeriod } from '@/entities/accounting-period.entity'

/**
 * BIZ-5.2 — owns the fiscal calendar. The API is authoritative: it generates each fiscal year and
 * its 12 accounting periods eagerly (at business setup + a daily scheduler for next year), and
 * they sync DOWN to the desktop. Generation is idempotent (unique keys + orIgnore), so a create
 * and the scheduler can both run without racing.
 */
@Injectable()
export class FiscalYearsService {
  constructor(
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
    @InjectRepository(FiscalYear) private readonly fyRepo: Repository<FiscalYear>,
    @InjectRepository(AccountingPeriod) private readonly periodRepo: Repository<AccountingPeriod>,
  ) {}

  /** Generate the fiscal year keyed by `year` + its 12 periods if absent. Idempotent. */
  async ensureFiscalYear(
    businessId: string,
    year: number,
    startMonth: number,
  ): Promise<FiscalYear> {
    const existing = await this.fyRepo.findOne({ where: { businessId, year } })
    if (existing) return existing

    const gen = generateFiscalPeriods(year, clampFiscalYearStartMonth(startMonth))
    await this.fyRepo
      .createQueryBuilder()
      .insert()
      .values({
        businessId,
        year: gen.year,
        label: gen.label,
        startMonth: gen.startMonth,
        startDate: gen.startDate,
        endDate: gen.endDate,
      })
      .orIgnore()
      .execute()

    const fy = await this.fyRepo.findOne({ where: { businessId, year } })
    if (!fy) throw new Error('Fiscal year could not be generated')

    await this.periodRepo
      .createQueryBuilder()
      .insert()
      .values(
        gen.periods.map((p) => ({
          businessId,
          fiscalYearId: fy.id,
          periodNumber: p.periodNumber,
          label: p.label,
          startDate: p.startDate,
          endDate: p.endDate,
          status: PeriodStatus.OPEN,
        })),
      )
      .orIgnore()
      .execute()

    return fy
  }

  /** Ensure the business's CURRENT (+ next) fiscal year exist. Called at business setup and by
   *  the scheduler; error-swallowing at the call site so it never blocks business creation. */
  async ensureUpcoming(businessId: string): Promise<void> {
    const business = await this.businessRepo.findOne({
      where: { id: businessId },
      select: ['id', 'timezone', 'fiscalYearStartMonth'],
    })
    if (!business) return
    const startMonth = clampFiscalYearStartMonth(business.fiscalYearStartMonth)
    const today = localDateInTimezone(new Date(), business.timezone || DEFAULT_BUSINESS_TIMEZONE)
    const currentYear = fiscalYearOf(today, startMonth)
    await this.ensureFiscalYear(businessId, currentYear, startMonth)
    // Generate next year ahead of time so an offline device always has the upcoming periods.
    await this.ensureFiscalYear(businessId, currentYear + 1, startMonth)
  }

  /** Scheduler entry point: keep current + next fiscal year generated for every business. */
  async ensureUpcomingForAll(): Promise<void> {
    const businesses = await this.businessRepo.find({ select: ['id'] })
    for (const b of businesses) {
      await this.ensureUpcoming(b.id).catch(() => undefined)
    }
  }

  /** Sync pull: fiscal years + periods for a business changed in the (cursor, pulledAt] window. */
  async findByBusiness(
    businessId: string,
    cursor: Date,
    pulledAt: Date,
  ): Promise<{ fiscalYears: FiscalYear[]; periods: AccountingPeriod[] }> {
    const fiscalYears = await this.fyRepo
      .createQueryBuilder('fy')
      .where('fy.business_id = :businessId', { businessId })
      .andWhere('fy.updated_at > :cursor', { cursor })
      .andWhere('fy.updated_at <= :pulledAt', { pulledAt })
      .orderBy('fy.updated_at', 'ASC')
      .getMany()

    const periods = await this.periodRepo
      .createQueryBuilder('ap')
      .where('ap.business_id = :businessId', { businessId })
      .andWhere('ap.updated_at > :cursor', { cursor })
      .andWhere('ap.updated_at <= :pulledAt', { pulledAt })
      .orderBy('ap.updated_at', 'ASC')
      .getMany()

    return { fiscalYears, periods }
  }

  /** Apply a period status change pushed from a device (BIZ-5.3 closes). Server-generated periods
   *  are never created by the device, so this only ever UPDATES an existing period's status. */
  async applyPeriodStatusFromSync(
    businessId: string,
    payload: AccountingPeriodSyncRecord,
  ): Promise<void> {
    const existing = await this.periodRepo.findOne({ where: { id: payload.id, businessId } })
    if (!existing) return // the period must have synced down first
    existing.status = (payload.status as PeriodStatus) ?? existing.status
    existing.closedAt = payload.closedAt ? new Date(payload.closedAt) : existing.closedAt
    await this.periodRepo.save(existing)
  }
}
