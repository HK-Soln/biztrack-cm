import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Business } from '@/entities/business.entity'
import { CashSession } from '@/entities/cash-session.entity'
import { BusinessCalendarService } from './business-calendar.service'

/**
 * BIZ-5.1 — the business_date resolver. Imported by every module whose services stamp a
 * transaction's local trading day (sales, cash-sessions, expenses, debts, savings, inventory,
 * procurement, sync).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Business, CashSession])],
  providers: [BusinessCalendarService],
  exports: [BusinessCalendarService],
})
export class BusinessCalendarModule {}
