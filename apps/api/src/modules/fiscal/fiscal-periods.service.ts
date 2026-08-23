import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, LessThan, Repository } from 'typeorm'
import { PeriodStatus, type PostingAdjustment } from '@biztrack/types'
import { LOGGER } from '@/logger/logger.module'
import type { Logger } from '@biztrack/logger'
import { AppBadRequestException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { AccountingPeriod } from '@/entities/accounting-period.entity'
import { PeriodCloseRun } from '@/entities/period-close-run.entity'
import { BusinessCalendarService } from '@/modules/business-calendar/business-calendar.service'
import { CloseStepRegistry } from '@/modules/modules/close-step-registry.service'

/**
 * BIZ-5.3 — the period close pipeline. Closing a period runs the (initially empty) registered
 * close steps idempotently, snapshots the period's figures, and flips OPEN → CLOSING → CLOSED.
 * Crash-safe: any period stuck in CLOSING on boot is recovered to OPEN and can be re-closed
 * (idempotent steps make the retry safe). LOCKED is terminal — there is no reopen path here.
 */
@Injectable()
export class FiscalPeriodsService implements OnModuleInit {
  constructor(
    @InjectRepository(AccountingPeriod) private readonly periodRepo: Repository<AccountingPeriod>,
    @InjectRepository(PeriodCloseRun) private readonly runRepo: Repository<PeriodCloseRun>,
    // Close steps registered by feature modules (BIZ-5.5); empty today → the loop is a no-op.
    private readonly closeSteps: CloseStepRegistry,
    private readonly dataSource: DataSource,
    private readonly calendar: BusinessCalendarService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('FiscalPeriodsService')
  }

  async onModuleInit(): Promise<void> {
    await this.recoverCrashedCloses()
  }

  /** A close that didn't finish leaves the period in CLOSING; on boot, roll it back to OPEN so it
   *  can be re-closed. Mirrors the sync engine's recoverNonTerminalBatches. */
  async recoverCrashedCloses(): Promise<void> {
    const res = await this.periodRepo.update(
      { status: PeriodStatus.CLOSING },
      { status: PeriodStatus.OPEN },
    )
    if (res.affected) {
      this.logger.warn(`Recovered ${res.affected} period(s) stuck in CLOSING → OPEN`)
    }
  }

  private async findPeriod(businessId: string, periodId: string): Promise<AccountingPeriod> {
    const period = await this.periodRepo.findOne({ where: { id: periodId, businessId } })
    if (!period) throw new AppNotFoundException('Accounting period not found.', 'PERIOD_NOT_FOUND')
    return period
  }

  /** Close a period: OPEN → CLOSING → run steps (idempotent) → snapshot → CLOSED. Earlier periods
   *  in the same fiscal year must be closed first (sequential close). */
  async closePeriod(
    businessId: string,
    periodId: string,
    userId: string,
  ): Promise<AccountingPeriod> {
    const period = await this.findPeriod(businessId, periodId)
    if (period.status !== PeriodStatus.OPEN) {
      throw new AppBadRequestException(
        `Only an open period can be closed (it is ${period.status}).`,
        'PERIOD_NOT_OPEN',
      )
    }
    // A period can only be closed once it has ENDED — you never close the current or a future
    // month (a basic accounting principle). "Today" is the business's local trading day.
    const today = await this.calendar.computeForBusiness(businessId, new Date())
    if (period.endDate >= today) {
      throw new AppBadRequestException(
        'This period has not ended yet — you can only close a period after it is over.',
        'PERIOD_NOT_ENDED',
      )
    }
    const earlierOpen = await this.periodRepo.count({
      where: {
        businessId,
        fiscalYearId: period.fiscalYearId,
        periodNumber: LessThan(period.periodNumber),
        status: In([PeriodStatus.OPEN, PeriodStatus.CLOSING]),
      },
    })
    if (earlierOpen > 0) {
      throw new AppBadRequestException(
        'Close the earlier periods in this fiscal year first.',
        'PERIOD_OUT_OF_ORDER',
      )
    }

    period.status = PeriodStatus.CLOSING
    await this.periodRepo.save(period)

    // Run each registered step once per (period, close_version). Empty today → a no-op loop.
    for (const step of this.closeSteps.all()) {
      const already = await this.runRepo.findOne({
        where: { periodId: period.id, stepKey: step.key, closeVersion: period.closeVersion },
      })
      if (already) continue
      const outcome = await step.run({ businessId, period, closeVersion: period.closeVersion })
      const run = this.runRepo.create({
        businessId,
        periodId: period.id,
        closeVersion: period.closeVersion,
        stepKey: step.key,
        status: 'COMPLETED',
        result: outcome ? outcome : null,
        ranAt: new Date(),
      })
      try {
        await this.runRepo.save(run)
      } catch {
        // Unique (period, step, version) — a concurrent close already recorded it. Idempotent.
      }
    }

    period.closeSnapshot = await this.computeSnapshot(businessId, period, userId)
    period.status = PeriodStatus.CLOSED
    period.closedAt = new Date()
    return this.periodRepo.save(period)
  }

  /** BIZ-5.4 — prior-period adjustments: sales/expenses that arrived after their own period had
   *  closed and were redated forward. Newest first; capped so the panel stays light. */
  async listAdjustments(businessId: string): Promise<PostingAdjustment[]> {
    const rows = (await this.dataSource.query(
      `SELECT x.id, x.kind, x.reference,
              x.amount,
              x.business_date AS "businessDate",
              x.posting_date AS "postingDate",
              x.original_period_id AS "originalPeriodId",
              op.label AS "originalPeriodLabel",
              pp.label AS "postingPeriodLabel",
              x.created_at AS "createdAt"
         FROM (
           SELECT s.id, 'SALE' AS kind, s.sale_number AS reference, s.total_amount AS amount,
                  s.business_date, s.posting_date, s.original_period_id, s.created_at
             FROM sales s
            WHERE s.business_id = $1 AND s.is_late_arrival = true AND s.deleted_at IS NULL
              AND s.status = 'COMPLETED'
           UNION ALL
           SELECT e.id, 'EXPENSE', e.description, e.amount,
                  e.business_date, e.posting_date, e.original_period_id, e.created_at
             FROM expenses e
            WHERE e.business_id = $1 AND e.is_late_arrival = true AND e.deleted_at IS NULL
         ) x
         LEFT JOIN accounting_periods op ON op.id = x.original_period_id
         LEFT JOIN accounting_periods pp
                ON pp.business_id = $1 AND x.posting_date BETWEEN pp.start_date AND pp.end_date
        ORDER BY x.created_at DESC
        LIMIT 200`,
      [businessId],
    )) as Array<{
      id: string
      kind: 'SALE' | 'EXPENSE'
      reference: string | null
      amount: string
      businessDate: string | null
      postingDate: string | null
      originalPeriodId: string | null
      originalPeriodLabel: string | null
      postingPeriodLabel: string | null
      createdAt: Date
    }>
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      reference: r.reference ?? '—',
      amount: Number(r.amount ?? 0),
      businessDate: r.businessDate,
      postingDate: r.postingDate,
      originalPeriodId: r.originalPeriodId,
      originalPeriodLabel: r.originalPeriodLabel,
      postingPeriodLabel: r.postingPeriodLabel,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : new Date(r.createdAt).toISOString(),
    }))
  }

  /** Lock a closed period. Terminal — there is no reopen path (by design). */
  async lockPeriod(businessId: string, periodId: string): Promise<AccountingPeriod> {
    const period = await this.findPeriod(businessId, periodId)
    if (period.status !== PeriodStatus.CLOSED) {
      throw new AppBadRequestException(
        `Only a closed period can be locked (it is ${period.status}).`,
        'PERIOD_NOT_CLOSED',
      )
    }
    period.status = PeriodStatus.LOCKED
    return this.periodRepo.save(period)
  }

  /** Freeze the period's headline figures at close, so later drift can be detected. Uses the
   *  posting_date grain (BIZ-5.4) — the accounting day — so a late arrival that redated out of this
   *  period is correctly excluded. A summary, not a full trial balance (which arrives with the
   *  ledger). */
  private async computeSnapshot(
    businessId: string,
    period: AccountingPeriod,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const salesRows = (await this.dataSource.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*)::int AS count
         FROM sales
        WHERE business_id = $1 AND status = 'COMPLETED' AND deleted_at IS NULL
          AND COALESCE(posting_date, business_date, sale_date) BETWEEN $2 AND $3`,
      [businessId, period.startDate, period.endDate],
    )) as Array<{ total: string; count: number }>
    const expenseRows = (await this.dataSource.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM expenses
        WHERE business_id = $1 AND deleted_at IS NULL
          AND COALESCE(posting_date, business_date, date) BETWEEN $2 AND $3`,
      [businessId, period.startDate, period.endDate],
    )) as Array<{ total: string }>

    return {
      salesTotal: Number(salesRows[0]?.total ?? 0),
      salesCount: Number(salesRows[0]?.count ?? 0),
      expenseTotal: Number(expenseRows[0]?.total ?? 0),
      closedByUserId: userId,
      generatedAt: new Date().toISOString(),
    }
  }
}
