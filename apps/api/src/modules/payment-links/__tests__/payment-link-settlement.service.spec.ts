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
  const realtime = { toBusiness: jest.fn() }
  const attempts = { find: jest.fn(async () => []) }
  const sales = { create: jest.fn(async () => ({ id: 'sale-x' })) }
  const income = { record: jest.fn(async () => ({ id: 'oi-1' })) }
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const service = new PaymentLinkSettlementService(
    links as never,
    businesses as never,
    attempts as never,
    registry as never,
    dispatcher as never,
    realtime as never,
    sales as never,
    income as never,
    logger as never,
  )
  return { service, links, handler, dispatcher, realtime, attempts, sales, income }
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
    const { service, links, handler, dispatcher, realtime } = make({ link: debtLink, stillDueMinor: 0 })
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
    // Live-pushes the settlement to the merchant's business channel.
    expect(realtime.toBusiness).toHaveBeenCalledWith(
      'b1',
      'payment.link',
      expect.objectContaining({ status: 'PAID', amountPaidMinor: 4000, paidNowMinor: 4000 }),
    )
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

  it('SALE_DRAFT: materializes the real sale with its true tender once fully collected', async () => {
    const saleDraftLink = {
      id: 'link-1',
      businessId: 'b1',
      payableType: PayableType.SALE_DRAFT,
      payableId: 'synthetic',
      amountMinor: 4000,
      amountPaidMinor: 0,
      currency: 'XAF',
      status: PaymentLinkStatus.ACTIVE,
      label: 'Sale',
      createdBy: 'cashier-1',
      saleId: null,
      draftPayload: { items: [{ productId: 'p1', quantity: 1, unitPrice: 4000 }] },
    }
    const { service, links, sales, handler } = make({
      link: saleDraftLink,
      stillDueMinor: 0,
    })
    // attempts.find returns [] (default); the just-confirmed attempt is merged in explicitly — its
    // tender (MTN_MOMO) is what the sale records, NOT credit.
    await service.settle(attempt({ amountMinor: 4000 }))
    // No generic handler for SALE_DRAFT.
    expect(handler.applyPayment).not.toHaveBeenCalled()
    // The sale is created with the collected tender + the draft items.
    expect(sales.create).toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({ sub: 'cashier-1', businessId: 'b1' }),
      expect.objectContaining({
        items: saleDraftLink.draftPayload.items,
        payments: [expect.objectContaining({ method: PaymentMethod.MTN_MOMO, amount: 4000 })],
      }),
    )
    expect(links.update).toHaveBeenCalledWith('link-1', { saleId: 'sale-x' })
    expect(links.update).toHaveBeenCalledWith('link-1', {
      amountPaidMinor: 4000,
      status: PaymentLinkStatus.PAID,
    })
  })

  it('SALE_DRAFT: a partial payment accumulates without creating a sale', async () => {
    const saleDraftLink = {
      id: 'link-1',
      businessId: 'b1',
      payableType: PayableType.SALE_DRAFT,
      payableId: 'synthetic',
      amountMinor: 10000,
      amountPaidMinor: 0,
      currency: 'XAF',
      status: PaymentLinkStatus.ACTIVE,
      label: 'Sale',
      createdBy: 'cashier-1',
      saleId: null,
      draftPayload: {},
    }
    const { service, links, sales } = make({ link: saleDraftLink, stillDueMinor: 0 })
    await service.settle(attempt({ amountMinor: 4000 }))
    expect(sales.create).not.toHaveBeenCalled()
    expect(links.update).toHaveBeenCalledWith('link-1', {
      amountPaidMinor: 4000,
      status: PaymentLinkStatus.PARTIALLY_PAID,
    })
  })

  it('GENERAL: books the payment as other income and closes a fully-paid fixed link', async () => {
    const generalLink = {
      id: 'link-1',
      businessId: 'b1',
      payableType: PayableType.GENERAL,
      payableId: 'synthetic',
      amountMinor: 4000,
      amountPaidMinor: 0,
      currency: 'XAF',
      status: PaymentLinkStatus.ACTIVE,
      label: 'Delivery fee',
      createdBy: 'u1',
      draftPayload: { label: 'Delivery fee', note: 'Zone C', incomeCategoryId: 'cat-1' },
    }
    const { service, links, income, handler } = make({ link: generalLink, stillDueMinor: 0 })
    await service.settle(attempt({ amountMinor: 4000 }))
    // No generic payable handler runs for GENERAL.
    expect(handler.applyPayment).not.toHaveBeenCalled()
    // The confirmed attempt's true tender is recognized as other income under the link's category.
    expect(income.record).toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({
        categoryId: 'cat-1',
        amount: 4000,
        paymentMethod: PaymentMethod.MTN_MOMO,
        reference: 'ref-1',
        source: 'PAYMENT_LINK',
        sourceId: 'link-1',
      }),
    )
    expect(links.update).toHaveBeenCalledWith('link-1', {
      amountPaidMinor: 4000,
      status: PaymentLinkStatus.PAID,
    })
  })

  it('GENERAL: an open link (amount 0) is single-shot PAID on the payer-chosen amount', async () => {
    const openLink = {
      id: 'link-1',
      businessId: 'b1',
      payableType: PayableType.GENERAL,
      payableId: 'synthetic',
      amountMinor: 0,
      amountPaidMinor: 0,
      currency: 'XAF',
      status: PaymentLinkStatus.ACTIVE,
      label: 'Donation',
      createdBy: 'u1',
      draftPayload: { label: 'Donation', incomeCategoryId: 'cat-1' },
    }
    const { service, links, income } = make({ link: openLink, stillDueMinor: 0 })
    await service.settle(attempt({ amountMinor: 2500 }))
    expect(income.record).toHaveBeenCalled()
    expect(links.update).toHaveBeenCalledWith('link-1', {
      amountPaidMinor: 2500,
      status: PaymentLinkStatus.PAID,
    })
  })
})
