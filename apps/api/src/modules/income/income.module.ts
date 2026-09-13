import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OtherIncome } from '@/entities/other-income.entity'
import { IncomeCategory } from '@/entities/income-category.entity'
import { BusinessCalendarModule } from '@/modules/business-calendar/business-calendar.module'
import { FiscalModule } from '@/modules/fiscal/fiscal.module'
import { IncomeService } from './income.service'
import { IncomeController } from './income.controller'

/**
 * Spec 10 ① — the Other Income ledger. Booked from manual entries, general payment-link settlements,
 * and deposit-cancellation charges; feeds the income statement's "other income" line. Exports
 * IncomeService so PaymentLinks (link settlement) and Savings (deposit charges) can recognize income.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([OtherIncome, IncomeCategory]),
    BusinessCalendarModule,
    FiscalModule,
  ],
  controllers: [IncomeController],
  providers: [IncomeService],
  exports: [IncomeService],
})
export class IncomeModule {}
