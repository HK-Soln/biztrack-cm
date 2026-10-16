import { randomUUID } from 'crypto'
import type { DataSource } from 'typeorm'
import { DebtDirection, DebtSource, DebtStatus, PaymentMethod } from '@biztrack/types'
import { Debt } from '@/entities/debt.entity'
import {
  closeIntegrationDataSource,
  getIntegrationDataSource,
} from '@/testing/integration-database'
import { createSalesSyncHarness, type SalesSyncHarness } from '@/testing/sales-sync-harness'

// Debts (slice 10) against a real Postgres: where a debt stands, payments and write-offs,
// the summary and the account statement all come from @biztrack/domain.

describe('debts', () => {
  let dataSource: DataSource
  let h: SalesSyncHarness
  let customerId: string

  beforeAll(async () => {
    dataSource = await getIntegrationDataSource()
  })
  afterAll(async () => {
    await closeIntegrationDataSource()
  })
  beforeEach(async () => {
    h = await createSalesSyncHarness(dataSource)
    customerId = await h.seedCustomer()
  })

  const RECEIVABLE = DebtDirection.RECEIVABLE
  const seedDebt = async (input: { amount: number; createdAt: string; ref?: string }) => {
    const repo = dataSource.getRepository(Debt)
    const debt = await repo.save(
      repo.create({
        businessId: h.businessId,
        contactId: customerId,
        direction: RECEIVABLE,
        sourceType: DebtSource.SALE,
        sourceId: randomUUID(),
        sourceReference: input.ref ?? 'S-1',
        originalAmount: input.amount,
        status: DebtStatus.OUTSTANDING,
        createdAt: new Date(input.createdAt),
      }),
    )
    return debt.id
  }
  const pay = (debtId: string, amount: number, paymentDate = '2026-10-10') =>
    h.debts.recordPayment(h.businessId, h.actor() as never, RECEIVABLE, debtId, {
      amount,
      method: PaymentMethod.CASH,
      paymentDate,
    } as never)

  it('takes payments up to what is owed and settles the debt once', async () => {
    const id = await seedDebt({ amount: 1000, createdAt: '2026-10-01T09:00:00.000Z' })
    await expect(pay(id, 0)).rejects.toMatchObject({ code: 'DEBT_PAYMENT_AMOUNT_INVALID' })
    await expect(pay(id, 100, '2026-09-30')).rejects.toMatchObject({
      code: 'DEBT_PAYMENT_DATE_INVALID',
    })
    await expect(pay(id, 1001)).rejects.toMatchObject({
      code: 'DEBT_PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING',
    })
    expect(await pay(id, 400)).toMatchObject({
      status: DebtStatus.PARTIALLY_PAID,
      outstandingAmount: 600,
    })
    const settled = await pay(id, 600)
    expect(settled).toMatchObject({ status: DebtStatus.SETTLED, outstandingAmount: 0 })
    expect(settled.settledAt).not.toBeNull()
    await expect(pay(id, 1)).rejects.toMatchObject({ code: 'DEBT_PAYMENT_LOCKED' })
  })

  it('writes off an open debt with a reason; it then owes nothing', async () => {
    const id = await seedDebt({ amount: 1000, createdAt: '2026-10-01T09:00:00.000Z' })
    await pay(id, 300)
    const writeOff = (reason: string) =>
      h.debts.writeOff(h.businessId, h.actor() as never, RECEIVABLE, id, { reason } as never)
    await expect(writeOff('  ')).rejects.toMatchObject({ code: 'DEBT_WRITE_OFF_REASON_REQUIRED' })
    expect(await writeOff('Moved away')).toMatchObject({
      status: DebtStatus.WRITTEN_OFF,
      outstandingAmount: 0,
      paidAmount: 300,
    })
    await expect(writeOff('again')).rejects.toMatchObject({ code: 'DEBT_ALREADY_WRITTEN_OFF' })
  })

  it('summarises open, partly paid and written-off debts', async () => {
    const a = await seedDebt({ amount: 1000, createdAt: '2026-10-01T09:00:00.000Z' })
    await seedDebt({ amount: 500, createdAt: '2026-10-02T09:00:00.000Z' })
    const c = await seedDebt({ amount: 800, createdAt: '2026-10-03T09:00:00.000Z' })
    await pay(a, 250)
    await h.debts.writeOff(h.businessId, h.actor() as never, RECEIVABLE, c, {
      reason: 'lost',
    } as never)

    expect(await h.debts.getSummary(h.businessId, RECEIVABLE)).toMatchObject({
      totalOutstanding: 1250,
      outstandingDebtCount: 2,
      partiallyPaidDebtCount: 1,
      partiallyPaidOutstanding: 750,
    })
  })

  it('builds the account statement with its running balance', async () => {
    const a = await seedDebt({ amount: 1000, createdAt: '2026-10-01T09:00:00.000Z', ref: 'S-1' })
    const b = await seedDebt({ amount: 400, createdAt: '2026-10-05T09:00:00.000Z', ref: 'S-2' })
    await pay(a, 300, '2026-10-03')
    await h.debts.writeOff(h.businessId, h.actor() as never, RECEIVABLE, b, {
      reason: 'lost',
    } as never)

    const statement = await h.debts.buildContactStatement(customerId, h.businessId)
    expect(statement.entries.map((e) => [e.type, e.debit, e.credit, e.balance])).toEqual([
      ['DEBT_CREATED', 1000, 0, 1000],
      ['PAYMENT', 0, 300, 700],
      ['DEBT_CREATED', 400, 0, 1100],
      ['WRITE_OFF', 0, 400, 700],
    ])
    expect(statement.closingBalance).toBe(700)
  })
})
