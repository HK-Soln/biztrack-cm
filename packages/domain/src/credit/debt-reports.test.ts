import { describe, expect, it } from 'vitest'
import { ContactType, DebtDirection, DebtSource, DebtStatus } from '@biztrack/types'
import {
  ageingBucket,
  buildAgeingReport,
  buildContactStatement,
  contactAgeBand,
  contactBalances,
  contactNetPosition,
  contactsSummary,
  daysUnpaid,
  summarizeDebts,
  type ReportDebt,
} from './debt-reports'

const NOW = new Date('2026-10-16T12:00:00.000Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

const debt = (over: Partial<ReportDebt>): ReportDebt => ({
  contactId: 'c1',
  direction: DebtDirection.RECEIVABLE,
  sourceType: DebtSource.SALE,
  originalAmount: 1000,
  paidAmount: 0,
  status: DebtStatus.OUTSTANDING,
  createdAt: daysAgo(0),
  ...over,
})

describe('ageing', () => {
  it('buckets by days past due at 7, 15 and 30', () => {
    expect([0, 7, 8, 15, 16, 30, 31].map(ageingBucket)).toEqual([
      'current',
      'current',
      'moderate',
      'moderate',
      'aged',
      'aged',
      'overdue',
    ])
  })

  it('ages open debts per contact, keeps the opening balance apart, largest first', () => {
    const report = buildAgeingReport({
      direction: DebtDirection.RECEIVABLE,
      creditDays: 0,
      now: NOW,
      contacts: new Map([
        ['c1', { name: 'A' }],
        ['c2', { name: 'B', phone: '+237' }],
      ]),
      debts: [
        debt({ createdAt: daysAgo(10), paidAmount: 400 }),
        debt({
          sourceType: DebtSource.OPENING_BALANCE,
          originalAmount: 500,
          createdAt: daysAgo(90),
        }),
        debt({ contactId: 'c2', originalAmount: 5000, createdAt: daysAgo(40) }),
        debt({ contactId: 'c2', status: DebtStatus.WRITTEN_OFF }),
        debt({ contactId: 'unknown' }),
        debt({ direction: DebtDirection.PAYABLE }),
      ],
    })
    expect(report.asOf).toBe('2026-10-16')
    expect(report.entries.map((e) => e.contactId)).toEqual(['c2', 'c1'])
    expect(report.entries[1]).toMatchObject({
      openingBalance: 500,
      moderate: 600,
      pastDue: 600,
      totalOutstanding: 1100,
    })
    expect(report.totals).toMatchObject({ overdue: 5000, totalOutstanding: 6100 })
  })
})

describe('summarizeDebts', () => {
  it('counts open and partly paid debts and those settled this month', () => {
    const summary = summarizeDebts({
      direction: DebtDirection.RECEIVABLE,
      now: NOW,
      debts: [
        debt({ paidAmount: 300, status: DebtStatus.PARTIALLY_PAID }),
        debt({}),
        debt({ status: DebtStatus.SETTLED, paidAmount: 1000, settledAt: daysAgo(3) }),
        debt({ status: DebtStatus.SETTLED, paidAmount: 1000, settledAt: daysAgo(40) }),
        debt({ status: DebtStatus.WRITTEN_OFF }),
      ],
    })
    expect(summary).toMatchObject({
      totalOutstanding: 1700,
      outstandingDebtCount: 2,
      partiallyPaidDebtCount: 1,
      partiallyPaidOutstanding: 700,
      settledThisMonthCount: 1,
      settledThisMonthAmount: 1000,
    })
  })
})

describe('buildContactStatement', () => {
  it('runs the balance through debts, payments and a write-off in date order', () => {
    const statement = buildContactStatement({
      direction: DebtDirection.RECEIVABLE,
      debts: [
        {
          ...debt({ createdAt: '2026-10-02T09:00:00.000Z', status: DebtStatus.WRITTEN_OFF }),
          paidAmount: 200,
          sourceReference: 'S-2',
          writtenOffAt: '2026-10-05T09:00:00.000Z',
          payments: [{ amount: 200, method: 'CASH', paymentDate: '2026-10-03' }],
        },
        {
          ...debt({
            sourceType: DebtSource.OPENING_BALANCE,
            originalAmount: 300,
            createdAt: '2026-10-01T00:00:00.000Z',
          }),
          payments: [],
        },
      ],
    })
    expect(statement.openingBalance).toBe(300)
    expect(statement.entries.map((e) => [e.type, e.debit, e.credit, e.balance])).toEqual([
      ['OPENING_BALANCE', 300, 0, 300],
      ['DEBT_CREATED', 1000, 0, 1300],
      ['PAYMENT', 0, 200, 1100],
      ['WRITE_OFF', 0, 800, 300],
    ])
    expect(statement.closingBalance).toBe(300)
  })
})

describe('contact balances', () => {
  it('sums what is owed on open debts each way, with the oldest open debt', () => {
    const balances = contactBalances([
      debt({ paidAmount: 250, createdAt: daysAgo(5) }),
      debt({ direction: DebtDirection.PAYABLE, originalAmount: 400, createdAt: daysAgo(50) }),
      debt({ status: DebtStatus.WRITTEN_OFF }),
      debt({ status: DebtStatus.SETTLED, paidAmount: 1000 }),
    ])
    expect(balances.get('c1')).toEqual({
      totalReceivable: 750,
      totalPayable: 400,
      openDebts: 2,
      oldestUnpaidAt: daysAgo(50),
    })
  })

  it('builds the list header over active contacts', () => {
    expect(
      contactsSummary([
        { type: ContactType.BOTH, isActive: true, totalReceivable: 100, totalPayable: 0 },
        { type: ContactType.SUPPLIER, isActive: true, totalReceivable: 0, totalPayable: 50 },
        { type: ContactType.CUSTOMER, isActive: false, totalReceivable: 999, totalPayable: 0 },
      ]),
    ).toEqual({
      totalReceivable: 100,
      totalPayable: 50,
      allCount: 2,
      customerCount: 1,
      supplierCount: 2,
      debtorCount: 1,
      creditorCount: 1,
    })
  })

  it('works out the net position, leaving written-off debts out', () => {
    expect(
      contactNetPosition([
        debt({ sourceType: DebtSource.OPENING_BALANCE, originalAmount: 200 }),
        debt({ paidAmount: 100 }),
        debt({ direction: DebtDirection.PAYABLE, originalAmount: 500 }),
        debt({ status: DebtStatus.WRITTEN_OFF, paidAmount: 10 }),
      ]),
    ).toEqual({
      receivable: { openingBalance: 200, totalDebts: 900, totalPaid: 100, netBalance: 1100 },
      payable: { openingBalance: 0, totalDebts: 500, totalPaid: 0, netBalance: 500 },
      net: 600,
    })
  })

  it('bands the age of the oldest open debt at 30 and 60 days', () => {
    expect(daysUnpaid(daysAgo(31.5), NOW.getTime())).toBe(31)
    expect(daysUnpaid(null, NOW.getTime())).toBeNull()
    expect([30, 31, 60, 61].map(contactAgeBand)).toEqual([0, 1, 1, 2])
  })
})
