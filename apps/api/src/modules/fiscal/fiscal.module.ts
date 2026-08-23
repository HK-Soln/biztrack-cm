import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Business } from '@/entities/business.entity'
import { FiscalYear } from '@/entities/fiscal-year.entity'
import { AccountingPeriod } from '@/entities/accounting-period.entity'
import { PeriodCloseRun } from '@/entities/period-close-run.entity'
import { FiscalYearsService } from './fiscal-years.service'
import { FiscalYearsScheduler } from './fiscal-years.scheduler'
import { FiscalPeriodsService } from './fiscal-periods.service'
import { FiscalController } from './fiscal.controller'
import { PERIOD_CLOSE_STEPS, type PeriodCloseStep } from './period-close'

/**
 * BIZ-5.2/5.3 — fiscal years + accounting periods + the idempotent close pipeline. The API
 * generates the calendar (business setup + daily scheduler), owns closing/locking, and syncs
 * periods down to the desktop. Exported for BusinessModule (setup hook) and SyncModule (pull).
 *
 * PERIOD_CLOSE_STEPS ships EMPTY — a later module (Fixed Assets, etc.) registers steps here.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Business, FiscalYear, AccountingPeriod, PeriodCloseRun])],
  controllers: [FiscalController],
  providers: [
    FiscalYearsService,
    FiscalYearsScheduler,
    FiscalPeriodsService,
    { provide: PERIOD_CLOSE_STEPS, useValue: [] as PeriodCloseStep[] },
  ],
  exports: [FiscalYearsService],
})
export class FiscalModule {}
