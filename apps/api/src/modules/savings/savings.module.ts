import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CustomerDeposit } from '@/entities/customer-deposit.entity'
import { DepositTransaction } from '@/entities/deposit-transaction.entity'
import { SavingsController } from './controllers/savings.controller'
import { DepositsService } from './services/savings.service'
import { PermissionsModule } from '../permissions/permissions.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomerDeposit, DepositTransaction]),
    PermissionsModule,
  ],
  controllers: [SavingsController],
  providers: [DepositsService],
  exports: [DepositsService],
})
export class DepositsModule {}
