import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PaymentLink } from '@/entities/payment-link.entity'
import { Sale } from '@/entities/sale.entity'
import { OnlineOrder } from '@/entities/online-order.entity'
import { Debt } from '@/entities/debt.entity'
import { DebtPayment } from '@/entities/debt-payment.entity'
import { CustomerDeposit } from '@/entities/customer-deposit.entity'
import { PaymentLinksController } from './payment-links.controller'
import { PaymentLinkService } from './payment-link.service'
import {
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
    TypeOrmModule.forFeature([PaymentLink, Sale, OnlineOrder, Debt, DebtPayment, CustomerDeposit]),
  ],
  controllers: [PaymentLinksController],
  providers: [
    PaymentLinkService,
    PayableHandlerRegistry,
    SalePayableHandler,
    DebtPayableHandler,
    OnlineOrderPayableHandler,
    DepositPayableHandler,
  ],
  exports: [PaymentLinkService, PayableHandlerRegistry],
})
export class PaymentLinksModule {}
