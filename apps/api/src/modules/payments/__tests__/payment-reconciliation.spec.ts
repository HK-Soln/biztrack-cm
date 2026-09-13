/// <reference types="jest" />
import { NotificationType, PaymentAttemptStatus } from '@biztrack/types'
import { PaymentReconciliationService } from '../services/payment-reconciliation.service'

function make(stranded: Array<Record<string, unknown>>) {
  const attempts = { find: jest.fn(async () => stranded) }
  const businesses = { findOne: jest.fn(async () => ({ id: 'b1', owner: { language: 'en' } })) }
  const dispatcher = { dispatch: jest.fn(async () => undefined) }
  const service = new PaymentReconciliationService(
    attempts as never,
    businesses as never,
    dispatcher as never,
  )
  return { service, attempts, dispatcher }
}

describe('PaymentReconciliationService.notifyStrandedInStorePayments', () => {
  it('queries CONFIRMED in-store attempts with no sale, and notifies the owner for each', async () => {
    const { service, attempts, dispatcher } = make([
      { id: 'a1', businessId: 'b1', amountMinor: 5000, currency: 'XAF', providerRef: 'r1' },
      { id: 'a2', businessId: 'b1', amountMinor: 3000, currency: 'XAF', providerRef: 'r2' },
    ])

    const n = await service.notifyStrandedInStorePayments(1_000_000_000_000)

    expect(n).toBe(2)
    expect(attempts.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: PaymentAttemptStatus.CONFIRMED }),
      }),
    )
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(2)
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        event: NotificationType.TEAM_ACTIVITY,
        metadata: expect.objectContaining({ reason: 'STRANDED_IN_STORE_PAYMENT', attemptId: 'a1' }),
      }),
    )
  })

  it('notifies nothing when there are no stranded confirmations', async () => {
    const { service, dispatcher } = make([])
    expect(await service.notifyStrandedInStorePayments()).toBe(0)
    expect(dispatcher.dispatch).not.toHaveBeenCalled()
  })

  it('swallows a dispatch failure (best-effort sweep)', async () => {
    const { service, dispatcher } = make([
      { id: 'a1', businessId: 'b1', amountMinor: 5000, currency: 'XAF' },
    ])
    dispatcher.dispatch.mockRejectedValueOnce(new Error('boom'))
    await expect(service.notifyStrandedInStorePayments()).resolves.toBe(1)
  })
})
