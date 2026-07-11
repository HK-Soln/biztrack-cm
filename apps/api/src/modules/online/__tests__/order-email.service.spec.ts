/// <reference types="jest" />
import { OrderEmailService } from '../order-email.service'

const makeService = (
  business: Record<string, unknown> | null = {
    id: 'biz-1',
    name: 'Akwa Store',
    email: 'shop@akwa.cm',
    currency: 'XAF',
  },
) => {
  const businessesRepo = { findOne: jest.fn(async () => business) }
  const email = {
    sendRaw: jest.fn(async () => ({ id: 'em-1' })),
    noReplySender: 'BizTrack CM <noreply@biztrack.cm>',
  }
  const config = { get: jest.fn(() => 'https://biztrack.cm') }
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const service = new OrderEmailService(
    businessesRepo as any,
    email as any,
    config as any,
    logger as any,
  )
  return { service, email, businessesRepo }
}

const order = (over: Record<string, unknown> = {}) =>
  ({
    id: 'order-1',
    businessId: 'biz-1',
    orderNumber: 'ORD-1',
    customerName: 'Marie',
    customerEmail: 'marie@example.com',
    totalAmount: 15000,
    ...over,
  }) as any

describe('OrderEmailService.sendStatusEmail', () => {
  it('sends a branded order-received email on PENDING', async () => {
    const { service, email } = makeService()
    await service.sendStatusEmail(order(), 'PENDING')

    expect(email.sendRaw).toHaveBeenCalledTimes(1)
    const payload = (email.sendRaw as jest.Mock).mock.calls[0][0] as any
    expect(payload.to).toBe('marie@example.com')
    expect(payload.from).toContain('noreply@biztrack.cm')
    expect(payload.reply_to).toBe('shop@akwa.cm')
    expect(payload.subject).toContain('ORD-1')
    expect(payload.html).toContain('Akwa Store')
    expect(payload.html).toContain('Powered by')
  })

  it('does NOT email on CONFIRMED (placement already covered it)', async () => {
    const { service, email } = makeService()
    await service.sendStatusEmail(order(), 'CONFIRMED')
    expect(email.sendRaw).not.toHaveBeenCalled()
  })

  it('skips when the order has no customer email', async () => {
    const { service, email } = makeService()
    await service.sendStatusEmail(order({ customerEmail: null }), 'DELIVERED')
    expect(email.sendRaw).not.toHaveBeenCalled()
  })

  it('never throws when sending fails', async () => {
    const { service, email } = makeService()
    email.sendRaw = jest.fn(async () => {
      throw new Error('resend down')
    })
    await expect(service.sendStatusEmail(order(), 'DELIVERED')).resolves.toBeUndefined()
  })
})
