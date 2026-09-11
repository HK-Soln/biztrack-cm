/// <reference types="jest" />
import { PayableType, PaymentLinkStatus, PaymentMethod } from '@biztrack/types'
import { PaymentLinkSettlementService } from '../payment-link-settlement.service'

function make(opts: {
  link: Record<string, unknown> | null
  stillDueMinor: number
}) {
  const links = {
    findOne: jest.fn(async () => opts.link),
    update: jest.fn(),
  }
  const businesses = { findOne: jest.fn(async () => ({ id: 'b1', owner: { language: 'en' } })) }
  const handler = {
    applyPayment: jest.fn(async () => undefined),
    resolve: jest.fn(async () => ({ amountDueMinor: opts.stillDueMinor })),
  }
  const registry = { get: jest.fn(() => handler) }
  const dispatcher = { dispatch: jest.fn(async () => undefined) }
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const service = new PaymentLinkSettlementService(
    links as never,
    businesses as never,
    registry as never,
    dispatcher as never,
    logger as never,
  )
  return { service, links, handler, dispatcher }
}

const attempt = (over: Record<string, unknown> = {}) =>
  ({
    id: 'att-1',
    status: 'CONFIRMED',
    paymentLinkId: 'link-1',
    amountMinor: 4000,
    paymentMethod: PaymentMethod.MTN_MOMO,
    providerRef: 'ref-1',
    ...over,
  }) as never

const debtLink = {
  id: 'link-1',
  businessId: 'b1',
  payableType: PayableType.DEBT,
  payableId: 'debt-1',
  amountPaidMinor: 0,
  currency: 'XAF',
  status: PaymentLinkStatus.ACTIVE,
  label: 'Debt',
  createdBy: 'u1',
}

describe('PaymentLinkSettlementService.settle', () => {
  it('applies the payment to the payable and marks the link PAID when nothing remains', async () => {
    const { service, links, handler, dispatcher } = make({ link: debtLink, stillDueMinor: 0 })
    await service.settle(attempt())
    expect(handler.applyPayment).toHaveBeenCalledWith(
      'b1',
      'debt-1',
      expect.objectContaining({ amountMinor: 4000, method: PaymentMethod.MTN_MOMO, providerRef: 'ref-1' }),
    )
    expect(links.update).toHaveBeenCalledWith('link-1', {
      amountPaidMinor: 4000,
      status: PaymentLinkStatus.PAID,
    })
    expect(dispatcher.dispatch).toHaveBeenCalled()
  })

  it('marks the link PARTIALLY_PAID when a balance remains', async () => {
    const { service, links } = make({ link: debtLink, stillDueMinor: 3000 })
    await service.settle(attempt())
    expect(links.update).toHaveBeenCalledWith('link-1', {
      amountPaidMinor: 4000,
      status: PaymentLinkStatus.PARTIALLY_PAID,
    })
  })

  it('does nothing for a non-confirmed attempt', async () => {
    const { service, links, handler } = make({ link: debtLink, stillDueMinor: 0 })
    await service.settle(attempt({ status: 'FAILED' }))
    expect(handler.applyPayment).not.toHaveBeenCalled()
    expect(links.update).not.toHaveBeenCalled()
  })

  it('does not re-apply against an already-PAID link', async () => {
    const { service, handler } = make({
      link: { ...debtLink, status: PaymentLinkStatus.PAID },
      stillDueMinor: 0,
    })
    await service.settle(attempt())
    expect(handler.applyPayment).not.toHaveBeenCalled()
  })

  it('leaves the link un-advanced when applyPayment throws (reconcile later)', async () => {
    const { service, links, handler } = make({ link: debtLink, stillDueMinor: 0 })
    handler.applyPayment.mockRejectedValueOnce(new Error('boom'))
    await service.settle(attempt())
    expect(links.update).not.toHaveBeenCalled()
  })
})
