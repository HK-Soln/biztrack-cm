/// <reference types="jest" />
import { PayableType, PaymentLinkStatus } from '@biztrack/types'
import { PaymentLinkService } from '../payment-link.service'

function make(opts: {
  resolved?: { amountDueMinor: number; currency: string; label: string; customerId: string | null } | null
  existing?: Record<string, unknown> | null
}) {
  const links = {
    findOne: jest.fn(async () => opts.existing ?? null),
    create: jest.fn((x: Record<string, unknown>) => x),
    save: jest.fn(async (x: Record<string, unknown>) => ({
      id: 'link-1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...x,
    })),
    find: jest.fn(async () => []),
    update: jest.fn(),
  }
  const handler = {
    type: PayableType.SALE,
    resolve: jest.fn(async () => opts.resolved ?? null),
    applyPayment: jest.fn(),
  }
  const registry = { get: jest.fn(() => handler) }
  const routing = { resolveAvailableMethods: jest.fn(async () => [{ method: 'MTN_MOMO' }]) }
  const income = { resolveCategory: jest.fn(async (id: string) => ({ id, name: 'Misc' })) }
  const config = { get: jest.fn(() => 'https://pay.test') }
  const service = new PaymentLinkService(
    links as never,
    registry as never,
    routing as never,
    income as never,
    config as never,
  )
  return { service, links, handler, routing, income }
}

describe('PaymentLinkService.create', () => {
  it('creates a link from the resolved payable amount + builds the pay URL', async () => {
    const { service, links } = make({
      resolved: { amountDueMinor: 5000, currency: 'XAF', label: 'Sale V-1', customerId: 'c1' },
    })
    const view = await service.create('b1', 'u1', {
      payableType: PayableType.SALE,
      payableId: 'sale-1',
    })
    expect(view.amountMinor).toBe(5000)
    expect(view.url).toBe(`https://pay.test/pay/${view.token}`)
    expect(view.status).toBe(PaymentLinkStatus.ACTIVE)
    expect(links.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payableType: PayableType.SALE,
        amountMinor: 5000,
        allowPartial: true,
        customerId: 'c1',
      }),
    )
  })

  it('returns the existing live link instead of minting a duplicate (non-deposit)', async () => {
    const existing = {
      id: 'link-9',
      token: 'tok9',
      payableType: PayableType.SALE,
      payableId: 'sale-1',
      amountMinor: 5000,
      amountPaidMinor: 0,
      currency: 'XAF',
      allowPartial: true,
      status: PaymentLinkStatus.ACTIVE,
      label: 'Sale',
      customerId: null,
      expiresAt: new Date('2026-02-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }
    const { service, links } = make({
      resolved: { amountDueMinor: 5000, currency: 'XAF', label: 'Sale', customerId: null },
      existing,
    })
    const view = await service.create('b1', 'u1', {
      payableType: PayableType.SALE,
      payableId: 'sale-1',
    })
    expect(view.id).toBe('link-9')
    expect(links.save).not.toHaveBeenCalled()
  })

  it('rejects when nothing is owed on a non-deposit payable', async () => {
    const { service } = make({
      resolved: { amountDueMinor: 0, currency: 'XAF', label: 'Sale', customerId: null },
    })
    await expect(
      service.create('b1', 'u1', { payableType: PayableType.SALE, payableId: 'sale-1' }),
    ).rejects.toThrow()
  })

  it('rejects when the payable cannot be resolved', async () => {
    const { service } = make({ resolved: null })
    await expect(
      service.create('b1', 'u1', { payableType: PayableType.SALE, payableId: 'nope' }),
    ).rejects.toThrow()
  })

  it('refuses to create a link when no provider method is routable (no dead links)', async () => {
    const { service, routing } = make({
      resolved: { amountDueMinor: 5000, currency: 'XAF', label: 'Sale', customerId: 'c1' },
    })
    routing.resolveAvailableMethods.mockResolvedValueOnce([])
    await expect(
      service.create('b1', 'u1', { payableType: PayableType.SALE, payableId: 'sale-1' }),
    ).rejects.toThrow()
  })
})

describe('PaymentLinkService.finalize', () => {
  const link = (over: Record<string, unknown> = {}) => ({
    id: 'link-1',
    token: 'tok',
    payableType: PayableType.SALE,
    payableId: 'sale-1',
    amountMinor: 10000,
    amountPaidMinor: 4000,
    currency: 'XAF',
    allowPartial: true,
    status: PaymentLinkStatus.PARTIALLY_PAID,
    label: 'Sale',
    customerId: 'c1',
    expiresAt: new Date('2026-02-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  })

  function svc(row: Record<string, unknown> | null) {
    const links = { findOne: jest.fn(async () => row), update: jest.fn() }
    const registry = { get: jest.fn() }
    const routing = { resolveAvailableMethods: jest.fn(async () => [{ method: 'MTN_MOMO' }]) }
    const income = { resolveCategory: jest.fn() }
    const config = { get: jest.fn(() => 'https://pay.test') }
    return {
      service: new PaymentLinkService(
        links as never,
        registry as never,
        routing as never,
        income as never,
        config as never,
      ),
      links,
    }
  }

  it('marks a partially-paid SALE link PAID (balance already a receivable)', async () => {
    const { service, links } = svc(link())
    const view = await service.finalize('b1', 'link-1')
    expect(links.update).toHaveBeenCalledWith('link-1', { status: PaymentLinkStatus.PAID })
    expect(view.status).toBe(PaymentLinkStatus.PAID)
  })

  it('is idempotent on an already-paid link', async () => {
    const { service, links } = svc(link({ status: PaymentLinkStatus.PAID }))
    await service.finalize('b1', 'link-1')
    expect(links.update).not.toHaveBeenCalled()
  })

  it('refuses to finalize a DEBT link (no total→credit conversion)', async () => {
    const { service } = svc(link({ payableType: PayableType.DEBT }))
    await expect(service.finalize('b1', 'link-1')).rejects.toThrow()
  })

  it('refuses a cancelled link', async () => {
    const { service } = svc(link({ status: PaymentLinkStatus.CANCELLED }))
    await expect(service.finalize('b1', 'link-1')).rejects.toThrow()
  })
})
