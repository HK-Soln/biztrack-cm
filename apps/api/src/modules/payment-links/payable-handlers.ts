import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  BusinessMemberRole,
  DebtDirection,
  PayableType,
  type JwtPayload,
  type PaymentMethod,
} from '@biztrack/types'
import { majorToMinor, minorToMajor } from '@biztrack/utils'
import { Sale } from '@/entities/sale.entity'
import { OnlineOrder } from '@/entities/online-order.entity'
import { OnlineOrderEvent } from '@/entities/online-order-event.entity'
import { Debt } from '@/entities/debt.entity'
import { DebtPayment } from '@/entities/debt-payment.entity'
import { CustomerDeposit } from '@/entities/customer-deposit.entity'
import { SalesService } from '@/modules/sales/services/sales.service'
import { DebtsService } from '@/modules/debts/services/debts.service'
import { DepositsService } from '@/modules/savings/services/savings.service'

/**
 * Spec 08 — the resolved, SERVER-TRUTH view of a payable at a moment in time. `amountDueMinor` is the
 * live amount owed in minor units (0 for an open DEPOSIT top-up — the payer chooses). All amounts are
 * the business currency (XAF; the app is XAF-only for now).
 */
export interface PayableResolution {
  amountDueMinor: number
  currency: string
  label: string
  customerId: string | null
}

/** Context for applying a confirmed link payment to its payable. */
export interface ApplyPaymentContext {
  amountMinor: number
  method: PaymentMethod
  providerRef: string | null
  /** The merchant who created the link — the actor recorded on the payment. */
  actorUserId: string | null
}

/** One implementation per PayableType. `resolve` reads the live amount owed (create + pay time);
 *  `applyPayment` applies a confirmed provider payment to the source (Spec 08 §7). */
export interface PayableHandler {
  readonly type: PayableType
  resolve(businessId: string, payableId: string): Promise<PayableResolution | null>
  applyPayment(businessId: string, payableId: string, ctx: ApplyPaymentContext): Promise<void>
}

// The app is XAF-only today; when payables carry their own currency this becomes per-payable.
const CURRENCY = 'XAF'

/** A minimal actor for source-service calls made on the merchant's behalf (link settlement). */
const linkActor = (businessId: string, userId: string | null): JwtPayload =>
  ({ sub: userId ?? '', businessId, role: BusinessMemberRole.OWNER }) as JwtPayload

@Injectable()
export class SalePayableHandler implements PayableHandler {
  readonly type = PayableType.SALE
  constructor(
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    private readonly salesService: SalesService,
  ) {}

  async resolve(businessId: string, payableId: string): Promise<PayableResolution | null> {
    const sale = await this.sales.findOne({ where: { id: payableId, businessId } })
    if (!sale) return null
    const due = Math.max(0, Number(sale.creditAmount) || 0) // credit_amount = outstanding balance
    return {
      amountDueMinor: majorToMinor(due, CURRENCY),
      currency: CURRENCY,
      label: `Sale ${sale.saleNumber}`,
      customerId: sale.customerId ?? null,
    }
  }

  async applyPayment(
    businessId: string,
    payableId: string,
    ctx: ApplyPaymentContext,
  ): Promise<void> {
    await this.salesService.recordPayment(payableId, businessId, linkActor(businessId, ctx.actorUserId), {
      method: ctx.method,
      amount: minorToMajor(ctx.amountMinor, CURRENCY),
      mobileMoneyReference: ctx.providerRef,
      note: 'Payment link',
    })
  }
}

@Injectable()
export class DebtPayableHandler implements PayableHandler {
  readonly type = PayableType.DEBT
  constructor(
    @InjectRepository(Debt) private readonly debts: Repository<Debt>,
    @InjectRepository(DebtPayment) private readonly payments: Repository<DebtPayment>,
    private readonly debtsService: DebtsService,
  ) {}

  async resolve(businessId: string, payableId: string): Promise<PayableResolution | null> {
    const debt = await this.debts.findOne({ where: { id: payableId, businessId } })
    if (!debt) return null
    const outstanding = await this.outstanding(debt)
    return {
      amountDueMinor: majorToMinor(outstanding, CURRENCY),
      currency: CURRENCY,
      label: debt.sourceReference || 'Debt',
      customerId: debt.contactId,
    }
  }

  async applyPayment(
    businessId: string,
    payableId: string,
    ctx: ApplyPaymentContext,
  ): Promise<void> {
    const debt = await this.debts.findOne({ where: { id: payableId, businessId } })
    if (!debt) return
    const today = new Date().toISOString().slice(0, 10)
    await this.debtsService.recordPayment(
      businessId,
      linkActor(businessId, ctx.actorUserId),
      debt.direction as DebtDirection,
      payableId,
      {
        amount: minorToMajor(ctx.amountMinor, CURRENCY),
        method: ctx.method,
        paymentDate: today,
        mobileMoneyReference: ctx.providerRef ?? undefined,
        notes: 'Payment link',
      },
    )
  }

  private async outstanding(debt: Debt): Promise<number> {
    const row = await this.payments
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'paid')
      .where('p.debtId = :id', { id: debt.id })
      .getRawOne<{ paid: string }>()
    return Math.max(0, Number(debt.originalAmount) - Number(row?.paid ?? 0))
  }
}

@Injectable()
export class OnlineOrderPayableHandler implements PayableHandler {
  readonly type = PayableType.ONLINE_ORDER
  constructor(
    @InjectRepository(OnlineOrder) private readonly orders: Repository<OnlineOrder>,
    @InjectRepository(OnlineOrderEvent) private readonly events: Repository<OnlineOrderEvent>,
  ) {}

  async resolve(businessId: string, payableId: string): Promise<PayableResolution | null> {
    const order = await this.orders.findOne({ where: { id: payableId, businessId } })
    if (!order) return null
    const due = order.paymentStatus === 'PAID' ? 0 : Math.max(0, Number(order.totalAmount) || 0)
    return {
      amountDueMinor: majorToMinor(due, CURRENCY),
      currency: CURRENCY,
      label: `Order ${order.orderNumber}`,
      customerId: null, // online orders are guest (customerName/phone), no contact id
    }
  }

  async applyPayment(
    businessId: string,
    payableId: string,
    ctx: ApplyPaymentContext,
  ): Promise<void> {
    const order = await this.orders.findOne({ where: { id: payableId, businessId } })
    if (!order || order.paymentStatus === 'PAID') return
    await this.orders.update(order.id, {
      paymentStatus: 'PAID',
      paymentReference: ctx.providerRef ?? order.paymentReference,
    })
    await this.events.save(
      this.events.create({
        onlineOrderId: order.id,
        businessId,
        eventType: 'PAYMENT_RECEIVED',
        triggeredBy: 'PAYMENT_GATEWAY',
        isCustomerVisible: true,
        customerMessage: 'Payment received.',
        trackingToken: order.trackingToken,
      }),
    )
  }
}

@Injectable()
export class DepositPayableHandler implements PayableHandler {
  readonly type = PayableType.DEPOSIT
  constructor(
    @InjectRepository(CustomerDeposit) private readonly deposits: Repository<CustomerDeposit>,
    private readonly depositsService: DepositsService,
  ) {}

  async resolve(businessId: string, payableId: string): Promise<PayableResolution | null> {
    const account = await this.deposits.findOne({ where: { id: payableId, businessId } })
    if (!account) return null
    // Open top-up — the payer chooses the amount (amountDue 0 = "any amount"), so the link is partial.
    return { amountDueMinor: 0, currency: CURRENCY, label: 'Deposit top-up', customerId: account.customerId }
  }

  async applyPayment(
    businessId: string,
    payableId: string,
    ctx: ApplyPaymentContext,
  ): Promise<void> {
    await this.depositsService.addPayment(
      payableId,
      businessId,
      linkActor(businessId, ctx.actorUserId),
      {
        amount: minorToMajor(ctx.amountMinor, CURRENCY),
        method: ctx.method,
        mobileMoneyReference: ctx.providerRef ?? undefined,
        notes: 'Payment link',
      },
    )
  }
}

/** Resolve a PayableHandler by type. New payable types register their handler here + in the module. */
@Injectable()
export class PayableHandlerRegistry {
  private readonly byType: Map<PayableType, PayableHandler>
  constructor(
    sale: SalePayableHandler,
    debt: DebtPayableHandler,
    order: OnlineOrderPayableHandler,
    deposit: DepositPayableHandler,
  ) {
    this.byType = new Map([sale, debt, order, deposit].map((h) => [h.type, h]))
  }
  get(type: PayableType): PayableHandler | undefined {
    return this.byType.get(type)
  }
}
