import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Business } from '@/entities/business.entity'
import { CustomerDeposit } from '@/entities/customer-deposit.entity'
import { DepositTransaction } from '@/entities/deposit-transaction.entity'
import { SavingsController } from './controllers/savings.controller'
import { DepositsService } from './services/savings.service'
import { PermissionsModule } from '../permissions/permissions.module'
import { BusinessCalendarModule } from '@/modules/business-calendar/business-calendar.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomerDeposit, DepositTransaction, Business]),
    PermissionsModule,
    BusinessCalendarModule,
  ],
  controllers: [SavingsController],
  providers: [DepositsService],
  exports: [DepositsService],
})
export class DepositsModule {}
