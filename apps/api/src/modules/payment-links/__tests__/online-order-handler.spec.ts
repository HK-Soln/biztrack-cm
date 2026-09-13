/// <reference types="jest" />
import { PaymentMethod } from '@biztrack/types'
import { OnlineOrderPayableHandler } from '../payable-handlers'

function make(order: Record<string, unknown> | null, sale?: Record<string, unknown>) {
  const orders = { findOne: jest.fn(async () => order), update: jest.fn() }
  const events = { create: jest.fn((x) => x), save: jest.fn(async () => ({})) }
  const sales = { findOne: jest.fn(async () => sale ?? null) }
  const salesService = { recordPayment: jest.fn(async () => ({})) }
  const handler = new OnlineOrderPayableHandler(
    orders as never,
    events as never,
    sales as never,
    salesService as never,
  )
  return { handler, orders, events, salesService }
}

const ctx = (amountMinor: number) => ({
  amountMinor,
  method: PaymentMethod.CARD,
  providerRef: 'pi_1',
  actorUserId: 'u1',
})

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  businessId: 'b1',
  orderNumber: 'ORD-1',
  totalAmount: 10000,
  paymentStatus: 'PENDING',
  saleId: null,
  trackingToken: 'tok',
  ...over,
})

describe('OnlineOrderPayableHandler — multiple payments (Spec 09 §4)', () => {
  it('records a partial payment against the linked sale and marks the order PARTIALLY_PAID', async () => {
    const { handler, orders, salesService } = make(
      order({ saleId: 's1' }),
      { id: 's1', amountPaid: 4000, totalAmount: 10000, creditAmount: 6000 },
    )
    await handler.applyPayment('b1', 'o1', ctx(4000))
    expect(salesService.recordPayment).toHaveBeenCalledWith(
      's1',
      'b1',
      expect.anything(),
      expect.objectContaining({ amount: 4000, mobileMoneyReference: 'pi_1' }),
    )
    expect(orders.update).toHaveBeenCalledWith('o1', expect.objectContaining({ paymentStatus: 'PARTIALLY_PAID' }))
  })

  it('marks the order PAID once the linked sale is fully covered', async () => {
    const { handler, orders } = make(
      order({ saleId: 's1' }),
      { id: 's1', amountPaid: 10000, totalAmount: 10000, creditAmount: 0 },
    )
    await handler.applyPayment('b1', 'o1', ctx(6000))
    expect(orders.update).toHaveBeenCalledWith('o1', expect.objectContaining({ paymentStatus: 'PAID' }))
  })

  it('resolves the due amount from the linked sale balance (accumulating)', async () => {
    const { handler } = make(
      order({ saleId: 's1' }),
      { id: 's1', amountPaid: 4000, totalAmount: 10000, creditAmount: 6000 },
    )
    const res = await handler.resolve('b1', 'o1')
    expect(res?.amountDueMinor).toBe(6000)
  })

  it('without a linked sale, pays the full total once (one-shot PAID)', async () => {
    const { handler, orders, salesService } = make(order({ saleId: null }))
    await handler.applyPayment('b1', 'o1', ctx(10000))
    expect(salesService.recordPayment).not.toHaveBeenCalled()
    expect(orders.update).toHaveBeenCalledWith('o1', expect.objectContaining({ paymentStatus: 'PAID' }))
  })

  it('records the true tender on the order (not the checkout placeholder)', async () => {
    // Order pre-selected CARD at checkout; payer actually paid with MTN MoMo on the pay page.
    const momo = { ...ctx(10000), method: PaymentMethod.MTN_MOMO }
    const { handler, orders } = make(order({ saleId: null, paymentMethod: 'CARD' }))
    await handler.applyPayment('b1', 'o1', momo)
    expect(orders.update).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({ paymentMethod: PaymentMethod.MTN_MOMO }),
    )
  })

  it('does nothing for an already-paid order', async () => {
    const { handler, orders } = make(order({ paymentStatus: 'PAID' }))
    await handler.applyPayment('b1', 'o1', ctx(10000))
    expect(orders.update).not.toHaveBeenCalled()
  })
})
