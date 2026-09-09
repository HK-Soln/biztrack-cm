import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PayableType } from '@biztrack/types'
import { majorToMinor } from '@biztrack/utils'
import { Sale } from '@/entities/sale.entity'
import { OnlineOrder } from '@/entities/online-order.entity'
import { Debt } from '@/entities/debt.entity'
import { DebtPayment } from '@/entities/debt-payment.entity'
import { CustomerDeposit } from '@/entities/customer-deposit.entity'

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

/** One implementation per PayableType. `resolve` reads the live amount owed (create + pay time);
 *  `applyPayment` (Spec 08 slice 3) applies a confirmed payment to the source. */
export interface PayableHandler {
  readonly type: PayableType
  resolve(businessId: string, payableId: string): Promise<PayableResolution | null>
  applyPayment(
    businessId: string,
    payableId: string,
    amountMinor: number,
    actorUserId: string | null,
  ): Promise<void>
}

// The app is XAF-only today; when payables carry their own currency this becomes per-payable.
const CURRENCY = 'XAF'
const notImplemented = (): never => {
  throw new Error('applyPayment is wired in Spec 08 slice 3 (settlement sinks).')
}

@Injectable()
export class SalePayableHandler implements PayableHandler {
  readonly type = PayableType.SALE
  constructor(@InjectRepository(Sale) private readonly sales: Repository<Sale>) {}

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
  applyPayment = notImplemented
}

@Injectable()
export class DebtPayableHandler implements PayableHandler {
  readonly type = PayableType.DEBT
  constructor(
    @InjectRepository(Debt) private readonly debts: Repository<Debt>,
    @InjectRepository(DebtPayment) private readonly payments: Repository<DebtPayment>,
  ) {}

  async resolve(businessId: string, payableId: string): Promise<PayableResolution | null> {
    const debt = await this.debts.findOne({ where: { id: payableId, businessId } })
    if (!debt) return null
    const row = await this.payments
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'paid')
      .where('p.debtId = :id', { id: payableId })
      .getRawOne<{ paid: string }>()
    const outstanding = Math.max(0, Number(debt.originalAmount) - Number(row?.paid ?? 0))
    return {
      amountDueMinor: majorToMinor(outstanding, CURRENCY),
      currency: CURRENCY,
      label: debt.sourceReference || 'Debt',
      customerId: debt.contactId,
    }
  }
  applyPayment = notImplemented
}

@Injectable()
export class OnlineOrderPayableHandler implements PayableHandler {
  readonly type = PayableType.ONLINE_ORDER
  constructor(@InjectRepository(OnlineOrder) private readonly orders: Repository<OnlineOrder>) {}

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
  applyPayment = notImplemented
}

@Injectable()
export class DepositPayableHandler implements PayableHandler {
  readonly type = PayableType.DEPOSIT
  constructor(
    @InjectRepository(CustomerDeposit) private readonly deposits: Repository<CustomerDeposit>,
  ) {}

  async resolve(businessId: string, payableId: string): Promise<PayableResolution | null> {
    const account = await this.deposits.findOne({ where: { id: payableId, businessId } })
    if (!account) return null
    // Open top-up — the payer chooses the amount (amountDue 0 = "any amount"), so the link is partial.
    return { amountDueMinor: 0, currency: CURRENCY, label: 'Deposit top-up', customerId: account.customerId }
  }
  applyPayment = notImplemented
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
