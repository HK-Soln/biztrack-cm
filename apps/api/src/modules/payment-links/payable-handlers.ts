import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Not, Repository } from 'typeorm'
import {
  BusinessMemberRole,
  DebtDirection,
  DebtStatus,
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
import { Contact } from '@/entities/contact.entity'
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
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    private readonly salesService: SalesService,
  ) {}

  async resolve(businessId: string, payableId: string): Promise<PayableResolution | null> {
    const order = await this.orders.findOne({ where: { id: payableId, businessId } })
    if (!order) return null
    return {
      amountDueMinor: majorToMinor(await this.dueMajor(businessId, order), CURRENCY),
      currency: CURRENCY,
      label: `Order ${order.orderNumber}`,
      customerId: null, // online orders are guest (customerName/phone), no contact id
    }
  }

  /**
   * Spec 09 §4 — apply a (possibly PARTIAL) payment to an order. If the order is already backed by a
   * Sale (posted at confirm), record against the SALE ledger — which accumulates, so an order can take
   * MULTIPLE payments — then derive the order's payment status from the sale. If there's no sale yet
   * (paid before confirmation), the link pays the full total once (no partial ledger to accumulate on).
   */
  async applyPayment(
    businessId: string,
    payableId: string,
    ctx: ApplyPaymentContext,
  ): Promise<void> {
    const order = await this.orders.findOne({ where: { id: payableId, businessId } })
    if (!order || order.paymentStatus === 'PAID') return

    if (order.saleId) {
      await this.salesService.recordPayment(
        order.saleId,
        businessId,
        linkActor(businessId, ctx.actorUserId),
        {
          method: ctx.method,
          amount: minorToMajor(ctx.amountMinor, CURRENCY),
          mobileMoneyReference: ctx.providerRef,
          note: 'Payment link',
        },
      )
      const sale = await this.sales.findOne({ where: { id: order.saleId, businessId } })
      const paid = sale ? Number(sale.amountPaid) : 0
      const total = sale ? Number(sale.totalAmount) : Number(order.totalAmount)
      const status: 'PAID' | 'PARTIALLY_PAID' =
        paid >= total ? 'PAID' : 'PARTIALLY_PAID'
      await this.orders.update(order.id, {
        paymentStatus: status,
        // Record the TRUE tender the payer used on the pay page, not the placeholder method the
        // storefront pre-selected at checkout (which defaults to CARD when card is enabled).
        paymentMethod: ctx.method,
        paymentReference: ctx.providerRef ?? order.paymentReference,
      })
      await this.emitPayment(order, status === 'PAID')
      return
    }

    await this.orders.update(order.id, {
      paymentStatus: 'PAID',
      paymentMethod: ctx.method,
      paymentReference: ctx.providerRef ?? order.paymentReference,
    })
    await this.emitPayment(order, true)
  }

  /** Live amount owed: the linked sale's balance (accumulating) when a sale exists, else the order
   *  total. 0 once fully paid. */
  private async dueMajor(businessId: string, order: OnlineOrder): Promise<number> {
    if (order.paymentStatus === 'PAID') return 0
    if (order.saleId) {
      const sale = await this.sales.findOne({ where: { id: order.saleId, businessId } })
      if (sale) return Math.max(0, Number(sale.creditAmount) || 0)
    }
    return Math.max(0, Number(order.totalAmount) || 0)
  }

  private async emitPayment(order: OnlineOrder, full: boolean): Promise<void> {
    await this.events.save(
      this.events.create({
        onlineOrderId: order.id,
        businessId: order.businessId,
        eventType: 'PAYMENT_RECEIVED',
        triggeredBy: 'PAYMENT_GATEWAY',
        isCustomerVisible: true,
        customerMessage: full ? 'Payment received.' : 'Partial payment received.',
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

@Injectable()
export class ContactReceivablePayableHandler implements PayableHandler {
  readonly type = PayableType.CONTACT_RECEIVABLE
  constructor(
    @InjectRepository(Debt) private readonly debts: Repository<Debt>,
    @InjectRepository(DebtPayment) private readonly payments: Repository<DebtPayment>,
    @InjectRepository(Contact) private readonly contacts: Repository<Contact>,
    private readonly debtsService: DebtsService,
  ) {}

  async resolve(businessId: string, payableId: string): Promise<PayableResolution | null> {
    const contact = await this.contacts.findOne({ where: { id: payableId, businessId } })
    if (!contact) return null
    const outstanding = await this.outstandingDebts(businessId, payableId)
    const totalMajor = outstanding.reduce((sum, d) => sum + d.outstanding, 0)
    return {
      amountDueMinor: majorToMinor(totalMajor, CURRENCY),
      currency: CURRENCY,
      label: `Balance — ${contact.name}`,
      customerId: contact.id,
    }
  }

  /** Allocate the paid amount across the contact's outstanding receivables OLDEST-FIRST (FIFO),
   *  recording a partial payment against each until the amount is exhausted (§2.2). */
  async applyPayment(
    businessId: string,
    payableId: string,
    ctx: ApplyPaymentContext,
  ): Promise<void> {
    let remaining = minorToMajor(ctx.amountMinor, CURRENCY)
    const outstanding = await this.outstandingDebts(businessId, payableId)
    const today = new Date().toISOString().slice(0, 10)
    for (const { debt, outstanding: due } of outstanding) {
      if (remaining <= 0) break
      const apply = Math.min(remaining, due)
      if (apply <= 0) continue
      await this.debtsService.recordPayment(
        businessId,
        linkActor(businessId, ctx.actorUserId),
        DebtDirection.RECEIVABLE,
        debt.id,
        {
          amount: apply,
          method: ctx.method,
          paymentDate: today,
          mobileMoneyReference: ctx.providerRef ?? undefined,
          notes: 'Payment link',
        },
      )
      remaining -= apply
    }
  }

  /** The contact's not-fully-settled RECEIVABLE debts, oldest-first, each with its outstanding amount. */
  private async outstandingDebts(
    businessId: string,
    contactId: string,
  ): Promise<Array<{ debt: Debt; outstanding: number }>> {
    const debts = await this.debts.find({
      where: {
        businessId,
        contactId,
        direction: DebtDirection.RECEIVABLE,
        status: Not(DebtStatus.SETTLED),
      },
      order: { createdAt: 'ASC' },
    })
    if (debts.length === 0) return []
    const paidByDebt = new Map<string, number>()
    const rows = await this.payments
      .createQueryBuilder('p')
      .select('p.debtId', 'debtId')
      .addSelect('COALESCE(SUM(p.amount), 0)', 'paid')
      .where('p.debtId IN (:...ids)', { ids: debts.map((d) => d.id) })
      .groupBy('p.debtId')
      .getRawMany<{ debtId: string; paid: string }>()
    for (const r of rows) paidByDebt.set(r.debtId, Number(r.paid))
    return debts
      .map((debt) => ({
        debt,
        outstanding: Math.max(0, Number(debt.originalAmount) - (paidByDebt.get(debt.id) ?? 0)),
      }))
      .filter((d) => d.outstanding > 0)
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
    contactReceivable: ContactReceivablePayableHandler,
  ) {
    this.byType = new Map(
      [sale, debt, order, deposit, contactReceivable].map((h) => [h.type, h]),
    )
  }
  get(type: PayableType): PayableHandler | undefined {
    return this.byType.get(type)
  }
}
