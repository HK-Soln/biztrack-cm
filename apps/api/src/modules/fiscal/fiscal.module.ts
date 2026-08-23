import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Business } from '@/entities/business.entity'
import { FiscalYear } from '@/entities/fiscal-year.entity'
import { AccountingPeriod } from '@/entities/accounting-period.entity'
import { FiscalYearsService } from './fiscal-years.service'
import { FiscalYearsScheduler } from './fiscal-years.scheduler'

/**
 * BIZ-5.2 — fiscal years + accounting periods. The API generates them (business setup + daily
 * scheduler) and they sync down to the desktop. Exported for BusinessModule (setup hook) and
 * SyncModule (pull).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Business, FiscalYear, AccountingPeriod])],
  providers: [FiscalYearsService, FiscalYearsScheduler],
  exports: [FiscalYearsService],
})
export class FiscalModule {}
