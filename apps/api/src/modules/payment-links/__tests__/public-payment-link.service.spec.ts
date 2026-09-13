/// <reference types="jest" />
import { PayableType, PaymentLinkStatus } from '@biztrack/types'
import { PublicPaymentLinkService } from '../public-payment-link.service'

function make(link: Record<string, unknown>, liveDueMinor: number) {
  const links = {
    findOne: jest.fn(async () => link),
    update: jest.fn(),
  }
  const businesses = { findOne: jest.fn(async () => ({ id: 'b1', name: 'Acme' })) }
  const handler = {
    resolve: jest.fn(async () => ({
      amountDueMinor: liveDueMinor,
      currency: 'XAF',
      label: 'Debt',
      customerId: 'c1',
    })),
  }
  const registry = { get: jest.fn(() => handler) }
  const initiation = {
    initiateLinkPayment: jest.fn(async () => ({ kind: 'pending', attemptId: 'att-1' })),
    getLinkPaymentStatus: jest.fn(),
  }
  const routing = { resolveAvailableMethods: jest.fn(async () => [{ method: 'MTN_MOMO' }]) }
  const service = new PublicPaymentLinkService(
    links as never,
    businesses as never,
    registry as never,
    initiation as never,
    routing as never,
  )
  return { service, initiation, links }
}

const activeDebtLink = {
  id: 'link-1',
  token: 'tok',
  businessId: 'b1',
  payableType: PayableType.DEBT,
  payableId: 'debt-1',
  amountMinor: 10000,
  currency: 'XAF',
  allowPartial: true,
  status: PaymentLinkStatus.ACTIVE,
  label: 'Debt',
  expiresAt: new Date(Date.now() + 86_400_000),
}

describe('PublicPaymentLinkService.initiate — amount is server-bound', () => {
  it('caps a partial amount at the LIVE balance (never charges more than owed)', async () => {
    const { service, initiation } = make(activeDebtLink, 6000) // live balance dropped to 6000
    await service.initiate('tok', {
      method: 'MTN_MOMO',
      clientReference: 'cr1',
      amountMinor: 9000, // payer asked more than the live balance
      customerPhone: '650000000',
    })
    expect(initiation.initiateLinkPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 6000, paymentLinkId: 'link-1' }),
    )
  })

  it('charges the full live amount when no partial amount is given', async () => {
    const { service, initiation } = make(activeDebtLink, 6000)
    await service.initiate('tok', {
      method: 'MTN_MOMO',
      clientReference: 'cr1',
      customerPhone: '650000000',
    })
    expect(initiation.initiateLinkPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 6000 }),
    )
  })

  it('rejects starting a payment on a PAID link', async () => {
    const { service } = make({ ...activeDebtLink, status: PaymentLinkStatus.PAID }, 0)
    await expect(
      service.initiate('tok', { method: 'MTN_MOMO', clientReference: 'cr1' }),
    ).rejects.toThrow()
  })

  it('rejects an unsupported (non-routable) method', async () => {
    const { service } = make(activeDebtLink, 6000)
    await expect(
      service.initiate('tok', { method: 'CASH', clientReference: 'cr1' }),
    ).rejects.toThrow()
  })

  it('expires a link whose window has passed (getPublic)', async () => {
    const { service, links } = make(
      { ...activeDebtLink, expiresAt: new Date(Date.now() - 1000) },
      6000,
    )
    const view = await service.getPublic('tok')
    expect(view.status).toBe(PaymentLinkStatus.EXPIRED)
    expect(links.update).toHaveBeenCalledWith('link-1', { status: PaymentLinkStatus.EXPIRED })
  })
})
