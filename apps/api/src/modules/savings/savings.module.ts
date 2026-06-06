import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CustomerDeposit } from '@/entities/customer-deposit.entity'
import { DepositTransaction } from '@/entities/deposit-transaction.entity'
import { SavingsController } from './controllers/savings.controller'
import { DepositsService } from './services/savings.service'

@Module({
  imports: [TypeOrmModule.forFeature([CustomerDeposit, DepositTransaction])],
  controllers: [SavingsController],
  providers: [DepositsService],
  exports: [DepositsService],
})
export class DepositsModule {}
