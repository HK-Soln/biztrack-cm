/// <reference types="jest" />
import { SyncService } from '../sync.service'

// Slice 10: a debt synced from a till is checked like the till checks its payments
// (@biztrack/domain checkSyncedDebt) and its status and first settlement date come from
// debtAfterChange. The applier only touches the repos wired here.
const makeService = (existing: Record<string, unknown> | null = null) => {
  const debtRepo = {
    findOne: jest.fn().mockResolvedValue(existing),
    save: jest.fn(async (v: Record<string, unknown>) => ({ id: 'd-1', ...v })),
    create: jest.fn((v: unknown) => v),
  }
  const paymentRepo = {
    save: jest.fn(),
    create: jest.fn((v: unknown) => v),
    delete: jest.fn(),
  }
  const service = Object.create(SyncService.prototype) as any
  service.contactsRepo = { findOne: jest.fn().mockResolvedValue({ id: 'c-1' }) }
  service.resolveContactCreatedById = jest.fn().mockResolvedValue('u-1')
  service.notifyPaymentReceived = jest.fn()
  service.calendar = { resolveForSync: jest.fn().mockResolvedValue('2026-10-16') }
  service.dataSource = {
    transaction: (cb: (m: unknown) => unknown) =>
      cb({
        getRepository: (entity: { name: string }) =>
          entity.name === 'DebtPayment' ? paymentRepo : debtRepo,
      }),
  }
  return { service, debtRepo, paymentRepo }
}

const payment = (id: string, amount: number) => ({
  id,
  amount,
  method: 'CASH',
  paymentDate: '2026-10-10',
})

const op = (payload: Record<string, unknown>) =>
  ({
    recordId: 'd-1',
    action: 'UPSERT',
    recordUpdatedAt: new Date('2026-10-16T08:00:00.000Z'),
    payload: {
      contactId: 'c-1',
      direction: 'RECEIVABLE',
      sourceType: 'SALE',
      sourceId: 's-1',
      originalAmount: 1000,
      status: 'OUTSTANDING',
      payments: [],
      ...payload,
    },
  }) as any

describe('SyncService.applyDebtOperation (slice 10)', () => {
  it('works out where the debt stands from its payments', async () => {
    const { service, debtRepo, paymentRepo } = makeService()

    const result = await service.applyDebtOperation(
      'biz-1',
      op({ status: 'SETTLED', payments: [payment('p-1', 600), payment('p-2', 400)] }),
    )

    expect(result.status).toBe('applied')
    expect(debtRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'SETTLED',
        settledAt: new Date('2026-10-16T08:00:00.000Z'),
      }),
    )
    expect(paymentRepo.save).toHaveBeenCalledTimes(2)
  })

  it('keeps the first settlement date the server recorded', async () => {
    const first = new Date('2026-10-12T10:00:00.000Z')
    const { service, debtRepo } = makeService({
      id: 'd-1',
      updatedAt: new Date('2026-10-12T10:00:00.000Z'),
      settledAt: first,
      payments: [],
    })

    await service.applyDebtOperation('biz-1', op({ payments: [payment('p-1', 1000)] }))

    expect(debtRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SETTLED', settledAt: first }),
    )
  })

  it('refuses payments that add up to more than the debt', async () => {
    const { service, debtRepo } = makeService()

    const result = await service.applyDebtOperation(
      'biz-1',
      op({ payments: [payment('p-1', 600), payment('p-2', 500)] }),
    )

    expect(result).toMatchObject({ status: 'failed' })
    expect(debtRepo.save).not.toHaveBeenCalled()
  })

  it('refuses a payment of nothing', async () => {
    const { service } = makeService()

    const result = await service.applyDebtOperation('biz-1', op({ payments: [payment('p-1', 0)] }))

    expect(result).toMatchObject({ status: 'failed' })
  })
})
