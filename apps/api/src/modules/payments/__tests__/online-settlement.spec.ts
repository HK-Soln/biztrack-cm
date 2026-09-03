import { PaymentConfirmationType } from '@biztrack/types'
import { PaymentAttemptsService } from '../services/payment-attempts.service'
import type { ProviderEvent } from '../adapters/payment-provider.adapter'

/** Build a service with in-memory repo doubles. `order` seeds the online order the attempt settles. */
function makeService(opts: {
  attempt: Record<string, unknown> | null
  order: Record<string, unknown> | null
}) {
  const attempts = {
    findOne: jest.fn(async () => opts.attempt),
    save: jest.fn(async (a: Record<string, unknown>) => a),
  }
  const onlineOrders = {
    findOne: jest.fn(async () => opts.order),
    update: jest.fn(async () => ({})),
  }
  const onlineOrderEvents = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn(async (x: unknown) => x),
  }
  const service = new PaymentAttemptsService(
    attempts as never,
    onlineOrders as never,
    onlineOrderEvents as never,
  )
  return { service, attempts, onlineOrders, onlineOrderEvents }
}

const confirmedEvent: ProviderEvent = {
  providerRef: 'pi_1',
  status: 'CONFIRMED',
  eventId: 'evt_1',
  raw: {},
}

describe('PaymentAttemptsService — online settlement (build 9)', () => {
  it('marks the order PAID + writes a PAYMENT_GATEWAY event on a confirmed gateway payment', async () => {
    const { service, onlineOrders, onlineOrderEvents } = makeService({
      attempt: {
        id: 'a1',
        businessId: 'b1',
        providerRef: 'pi_1',
        status: 'PENDING',
        onlineOrderId: 'o1',
        saleId: null,
      },
      order: {
        id: 'o1',
        businessId: 'b1',
        paymentStatus: 'PENDING',
        paymentReference: null,
        trackingToken: 't1',
      },
    })

    await service.applyProviderEvent('b1', confirmedEvent, PaymentConfirmationType.WEBHOOK)

    expect(onlineOrders.update).toHaveBeenCalledWith('o1', {
      paymentStatus: 'PAID',
      paymentReference: 'pi_1',
    })
    expect(onlineOrderEvents.save).toHaveBeenCalledTimes(1)
    expect(onlineOrderEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'PAYMENT_RECEIVED', triggeredBy: 'PAYMENT_GATEWAY' }),
    )
  })

  it('is idempotent — an already-PAID order is not updated again', async () => {
    const { service, onlineOrders, onlineOrderEvents } = makeService({
      attempt: {
        id: 'a1',
        businessId: 'b1',
        providerRef: 'pi_1',
        status: 'PENDING',
        onlineOrderId: 'o1',
        saleId: null,
      },
      order: { id: 'o1', businessId: 'b1', paymentStatus: 'PAID', trackingToken: 't1' },
    })

    await service.applyProviderEvent('b1', confirmedEvent, PaymentConfirmationType.WEBHOOK)

    expect(onlineOrders.update).not.toHaveBeenCalled()
    expect(onlineOrderEvents.save).not.toHaveBeenCalled()
  })

  it('does not touch online orders for an in-store attempt (no online_order_id)', async () => {
    const { service, onlineOrders } = makeService({
      attempt: {
        id: 'a2',
        businessId: 'b1',
        providerRef: 'pi_1',
        status: 'PENDING',
        onlineOrderId: null,
        saleId: 's1',
      },
      order: null,
    })

    await service.applyProviderEvent('b1', confirmedEvent, PaymentConfirmationType.WEBHOOK)

    expect(onlineOrders.findOne).not.toHaveBeenCalled()
  })
})
