import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Contact } from '@/entities/contact.entity'
import { DebtPayment } from '@/entities/debt-payment.entity'
import { Debt } from '@/entities/debt.entity'
import { PermissionsModule } from '@/modules/permissions/permissions.module'
import { ContactsController } from './controllers/contacts.controller'
import { CreditorsController } from './controllers/creditors.controller'
import { DebtorsController } from './controllers/debtors.controller'
import { ContactsService } from './services/contacts.service'
import { DebtsService } from './services/debts.service'

@Module({
  imports: [PermissionsModule, TypeOrmModule.forFeature([Contact, Debt, DebtPayment])],
  controllers: [ContactsController, DebtorsController, CreditorsController],
  providers: [ContactsService, DebtsService],
  exports: [ContactsService, DebtsService],
})
export class DebtsModule {}
