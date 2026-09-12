import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PaymentLink } from '@/entities/payment-link.entity'
import { Sale } from '@/entities/sale.entity'
import { OnlineOrder } from '@/entities/online-order.entity'
import { Debt } from '@/entities/debt.entity'
import { DebtPayment } from '@/entities/debt-payment.entity'
import { CustomerDeposit } from '@/entities/customer-deposit.entity'
import { Contact } from '@/entities/contact.entity'
import { OnlineOrderEvent } from '@/entities/online-order-event.entity'
import { PaymentAttempt } from '@/entities/payment-attempt.entity'
import { Business } from '@/entities/business.entity'
import { PaymentsModule } from '@/modules/payments/payments.module'
import { SalesModule } from '@/modules/sales/sales.module'
import { DebtsModule } from '@/modules/debts/debts.module'
import { DepositsModule } from '@/modules/savings/savings.module'
import { IncomeModule } from '@/modules/income/income.module'
import { NotificationsModule } from '@/modules/notifications/notifications.module'
import { PaymentLinksController } from './payment-links.controller'
import { PublicPaymentLinkController } from './public-payment-link.controller'
import { PaymentLinkService } from './payment-link.service'
import { PublicPaymentLinkService } from './public-payment-link.service'
import { PaymentLinkSettlementService } from './payment-link-settlement.service'
import {
  ContactReceivablePayableHandler,
  DebtPayableHandler,
  DepositPayableHandler,
  OnlineOrderPayableHandler,
  PayableHandlerRegistry,
  SalePayableHandler,
} from './payable-handlers'

/**
 * Spec 08 — payment links. Tokenized links to pay any payable (debt / sale balance / online order /
 * deposit) via the merchant's routed providers (reuses the Spec 07 execution layer). This module owns
 * link management + the payable-handler registry; public pay + settlement land in later slices.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentLink,
      Sale,
      OnlineOrder,
      OnlineOrderEvent,
      Debt,
      DebtPayment,
      CustomerDeposit,
      Contact,
      PaymentAttempt,
      Business,
    ]),
    PaymentsModule,
    SalesModule,
    DebtsModule,
    DepositsModule,
    IncomeModule,
    NotificationsModule,
  ],
  controllers: [PaymentLinksController, PublicPaymentLinkController],
  providers: [
    PaymentLinkService,
    PublicPaymentLinkService,
    PaymentLinkSettlementService,
    // String-token alias so PaymentAttemptsService (PaymentsModule) can resolve the sink lazily via
    // ModuleRef without importing this module (the reverse import would be a cycle).
    { provide: 'PaymentLinkSettlementService', useExisting: PaymentLinkSettlementService },
    PayableHandlerRegistry,
    SalePayableHandler,
    DebtPayableHandler,
    OnlineOrderPayableHandler,
    DepositPayableHandler,
    ContactReceivablePayableHandler,
  ],
  exports: [PaymentLinkService, PayableHandlerRegistry, PaymentLinkSettlementService],
})
export class PaymentLinksModule {}
