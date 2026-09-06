/// <reference types="jest" />
import { PaymentAttemptInitiationType, PaymentAttemptStatus, PaymentMethod } from '@biztrack/types'
import { PaymentInitiationService } from '../services/payment-initiation.service'

/** Build the service with in-memory doubles. `adapter` decides link vs push; `routed` the route. */
function make(opts: {
  adapter?: Record<string, unknown> | null
  routed?: Record<string, unknown> | null
  existingAttempt?: Record<string, unknown> | null
  statusAttempt?: Record<string, unknown> | null
}) {
  const attempts = {
    findOne: jest.fn(async (q: { where?: { idempotencyKey?: string; id?: string } }) => {
      if (q?.where?.idempotencyKey) return opts.existingAttempt ?? null
      if (q?.where?.id) return opts.statusAttempt ?? null
      return null
    }),
    create: jest.fn((x: Record<string, unknown>) => x),
    save: jest.fn(async (x: Record<string, unknown>) => ({ id: 'att-1', ...x })),
    update: jest.fn(),
    count: jest.fn(async () => 0),
  }
  const connections = { findOne: jest.fn() }
  const routing = { resolveProviderForMethod: jest.fn(async () => opts.routed ?? null) }
  const adapters = { get: jest.fn(() => opts.adapter ?? null) }
  const credentials = { getDecryptedCredentials: jest.fn(async () => ({ key: 'x' })) }
  const attemptsService = { applyProviderEvent: jest.fn() }
  const config = { get: jest.fn(() => undefined) }
  const queue = { add: jest.fn() }
  const service = new PaymentInitiationService(
    attempts as never,
    connections as never,
    routing as never,
    adapters as never,
    credentials as never,
    attemptsService as never,
    config as never,
    queue as never,
  )
  return { service, attempts, routing, adapters, queue }
}

const mtnRoute = { connection: { id: 'conn-1', providerCode: 'MTN', webhookToken: 'wt' } }
const stripeRoute = { connection: { id: 'conn-2', providerCode: 'STRIPE', webhookToken: 'wt' } }
const baseInput = {
  businessId: 'b1',
  amountMinor: 1500,
  currency: 'XAF',
  reference: 'In-store payment',
  cashSessionId: 'cs-1',
  clientReference: 'cr-1',
}

describe('PaymentInitiationService.initiateInStorePayment', () => {
  it('fires a MoMo push (USSD_PUSH attempt, cashSessionId set, saleId null) + enqueues the poll', async () => {
    const adapter = { initiateUssdPush: jest.fn(async () => ({ providerRef: 'ref-1' })) }
    const { service, attempts, queue } = make({ adapter, routed: mtnRoute })

    const res = await service.initiateInStorePayment({
      ...baseInput,
      method: PaymentMethod.MTN_MOMO,
      customerPhone: '650000000',
    })

    expect(res).toEqual({ kind: 'pending', attemptId: 'att-1', providerRef: 'ref-1' })
    expect(attempts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        saleId: null,
        cashSessionId: 'cs-1',
        initiationType: PaymentAttemptInitiationType.USSD_PUSH,
        idempotencyKey: 'instore_cr-1',
        status: PaymentAttemptStatus.INITIATED,
      }),
    )
    expect(adapter.initiateUssdPush).toHaveBeenCalled()
    expect(queue.add).toHaveBeenCalledTimes(1) // background reconcile safety net
  })

  it('creates a card link (LINK attempt, redirect) and does NOT enqueue a poll', async () => {
    const expiresAt = '2026-01-01T00:10:00.000Z'
    const adapter = {
      createPaymentLink: jest.fn(async () => ({ providerRef: 'pi_1', url: 'https://pay/x', expiresAt })),
    }
    const { service, attempts, queue } = make({ adapter, routed: stripeRoute })

    const res = await service.initiateInStorePayment({ ...baseInput, method: PaymentMethod.CARD })

    expect(res).toEqual({
      kind: 'redirect',
      attemptId: 'att-1',
      providerRef: 'pi_1',
      url: 'https://pay/x',
      expiresAt,
    })
    expect(attempts.create).toHaveBeenCalledWith(
      expect.objectContaining({ initiationType: PaymentAttemptInitiationType.LINK }),
    )
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('returns null when the method has no verified route', async () => {
    const { service, attempts } = make({ routed: null })
    const res = await service.initiateInStorePayment({ ...baseInput, method: PaymentMethod.MTN_MOMO })
    expect(res).toBeNull()
    expect(attempts.save).not.toHaveBeenCalled()
  })

  it('is idempotent on clientReference — a re-submit returns the existing attempt, no new row', async () => {
    const existingAttempt = { id: 'att-9', providerRef: 'ref-9', linkUrl: null, expiresAt: null }
    const adapter = { initiateUssdPush: jest.fn() }
    const { service, attempts, routing } = make({ adapter, routed: mtnRoute, existingAttempt })

    const res = await service.initiateInStorePayment({
      ...baseInput,
      method: PaymentMethod.MTN_MOMO,
      customerPhone: '650000000',
    })

    expect(res).toEqual({ kind: 'pending', attemptId: 'att-9', providerRef: 'ref-9' })
    expect(routing.resolveProviderForMethod).not.toHaveBeenCalled()
    expect(attempts.save).not.toHaveBeenCalled()
    expect(adapter.initiateUssdPush).not.toHaveBeenCalled()
  })

  it('rejects (marks the attempt FAILED) when a push has no phone number', async () => {
    const adapter = { initiateUssdPush: jest.fn() }
    const { service, attempts } = make({ adapter, routed: mtnRoute })

    await expect(
      service.initiateInStorePayment({ ...baseInput, method: PaymentMethod.MTN_MOMO }),
    ).rejects.toThrow()
    expect(adapter.initiateUssdPush).not.toHaveBeenCalled()
    expect(attempts.update).toHaveBeenCalledWith(
      'att-1',
      expect.objectContaining({ status: PaymentAttemptStatus.FAILED }),
    )
  })
})

describe('PaymentInitiationService.getInStorePaymentStatus', () => {
  it('returns PAID + providerRef for a confirmed attempt', async () => {
    const statusAttempt = {
      id: 'att-1',
      status: PaymentAttemptStatus.CONFIRMED,
      providerRef: 'ref-1',
    }
    const { service } = make({ statusAttempt })
    const res = await service.getInStorePaymentStatus('b1', 'att-1')
    expect(res).toEqual({ status: 'PAID', reason: undefined, providerRef: 'ref-1' })
  })

  it('surfaces a whitelisted failure reason for a failed attempt', async () => {
    const statusAttempt = {
      id: 'att-1',
      status: PaymentAttemptStatus.FAILED,
      providerRef: 'ref-1',
      failedReason: 'NOT_ENOUGH_FUNDS',
    }
    const { service } = make({ statusAttempt })
    const res = await service.getInStorePaymentStatus('b1', 'att-1')
    expect(res).toEqual({ status: 'FAILED', reason: 'NOT_ENOUGH_FUNDS', providerRef: 'ref-1' })
  })

  it('returns null for an unknown attempt', async () => {
    const { service } = make({ statusAttempt: null })
    const res = await service.getInStorePaymentStatus('b1', 'nope')
    expect(res).toBeNull()
  })
})
