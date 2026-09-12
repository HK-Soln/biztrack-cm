/// <reference types="jest" />
import { DebtDirection, PaymentMethod } from '@biztrack/types'
import { ContactReceivablePayableHandler } from '../payable-handlers'

/** debts oldest-first with originalAmount; payments map debtId→paid. */
function make(debts: Array<{ id: string; originalAmount: number; createdAt: string }>, paid: Record<string, number> = {}) {
  const debtsRepo = {
    find: jest.fn(async () => debts.map((d) => ({ ...d, direction: DebtDirection.RECEIVABLE }))),
    findOne: jest.fn(),
  }
  const paymentsRepo = {
    createQueryBuilder: () => ({
      select: () => ({
        addSelect: () => ({
          where: () => ({
            groupBy: () => ({
              getRawMany: async () =>
                Object.entries(paid).map(([debtId, p]) => ({ debtId, paid: String(p) })),
            }),
          }),
        }),
      }),
    }),
  }
  const contactsRepo = { findOne: jest.fn(async () => ({ id: 'c1', name: 'Marie' })) }
  const debtsService = { recordPayment: jest.fn(async () => ({})) }
  const handler = new ContactReceivablePayableHandler(
    debtsRepo as never,
    paymentsRepo as never,
    contactsRepo as never,
    debtsService as never,
  )
  return { handler, debtsService }
}

const ctx = (amountMinor: number) => ({
  amountMinor,
  method: PaymentMethod.MTN_MOMO,
  providerRef: 'ref-1',
  actorUserId: 'u1',
})

describe('ContactReceivablePayableHandler', () => {
  it('resolves the sum of outstanding receivables (original − paid)', async () => {
    const { handler } = make(
      [
        { id: 'd1', originalAmount: 5000, createdAt: '2026-01-01' },
        { id: 'd2', originalAmount: 3000, createdAt: '2026-02-01' },
      ],
      { d1: 2000 },
    )
    const res = await handler.resolve('b1', 'c1')
    // (5000-2000) + 3000 = 6000
    expect(res?.amountDueMinor).toBe(6000)
    expect(res?.customerId).toBe('c1')
  })

  it('allocates a payment oldest-first, partial on the last debt it reaches', async () => {
    const { handler, debtsService } = make([
      { id: 'd1', originalAmount: 5000, createdAt: '2026-01-01' },
      { id: 'd2', originalAmount: 3000, createdAt: '2026-02-01' },
    ])
    await handler.applyPayment('b1', 'c1', ctx(6000)) // pays d1 fully (5000) + d2 partially (1000)
    expect(debtsService.recordPayment).toHaveBeenCalledTimes(2)
    expect(debtsService.recordPayment).toHaveBeenNthCalledWith(
      1,
      'b1',
      expect.anything(),
      DebtDirection.RECEIVABLE,
      'd1',
      expect.objectContaining({ amount: 5000 }),
    )
    expect(debtsService.recordPayment).toHaveBeenNthCalledWith(
      2,
      'b1',
      expect.anything(),
      DebtDirection.RECEIVABLE,
      'd2',
      expect.objectContaining({ amount: 1000 }),
    )
  })

  it('never allocates more than a debt owes, and stops when the amount is exhausted', async () => {
    const { handler, debtsService } = make([
      { id: 'd1', originalAmount: 5000, createdAt: '2026-01-01' },
      { id: 'd2', originalAmount: 3000, createdAt: '2026-02-01' },
    ])
    await handler.applyPayment('b1', 'c1', ctx(2000)) // only touches d1 for 2000
    expect(debtsService.recordPayment).toHaveBeenCalledTimes(1)
    expect(debtsService.recordPayment).toHaveBeenCalledWith(
      'b1',
      expect.anything(),
      DebtDirection.RECEIVABLE,
      'd1',
      expect.objectContaining({ amount: 2000 }),
    )
  })
})
