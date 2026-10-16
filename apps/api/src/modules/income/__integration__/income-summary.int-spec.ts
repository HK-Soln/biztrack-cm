import { randomUUID } from 'crypto'
import type { DataSource } from 'typeorm'
import { IncomeCategory } from '@/entities/income-category.entity'
import { OtherIncome } from '@/entities/other-income.entity'
import { IncomeService } from '@/modules/income/income.service'
import {
  closeIntegrationDataSource,
  getIntegrationDataSource,
} from '@/testing/integration-database'
import { createSalesSyncHarness, type SalesSyncHarness } from '@/testing/sales-sync-harness'

// GET /income/summary against a real Postgres: the totals, change and shares are
// @biztrack/domain's `summarizeAmounts`; this checks the SQL that feeds it.

describe('the other-income summary', () => {
  let dataSource: DataSource
  let h: SalesSyncHarness
  let income: IncomeService

  beforeAll(async () => {
    dataSource = await getIntegrationDataSource()
  })
  afterAll(async () => {
    await closeIntegrationDataSource()
  })
  beforeEach(async () => {
    h = await createSalesSyncHarness(dataSource)
    income = new IncomeService(
      dataSource.getRepository(OtherIncome),
      dataSource.getRepository(IncomeCategory),
      {} as never,
      {} as never,
    )
  })

  const category = async (name: string, color: string) => {
    const id = randomUUID()
    await dataSource.query(
      `INSERT INTO income_categories (id, business_id, name, slug, color, sort_order)
       VALUES ($1, $2, $3, $4, $5, 0)`,
      [id, h.businessId, name, `${name.toLowerCase()}-${id.slice(0, 6)}`, color],
    )
    return id
  }
  const record = async (
    categoryId: string,
    amount: number,
    date: string,
    source = 'MANUAL',
    deleted = false,
  ) => {
    await dataSource.query(
      `INSERT INTO other_incomes (id, business_id, category_id, description, amount, source, date, deleted_at)
       VALUES ($1, $2, $3, 'Entry', $4, $5, $6, $7)`,
      [randomUUID(), h.businessId, categoryId, amount, source, date, deleted ? new Date() : null],
    )
  }

  it('totals the period, compares it with the one before and shares it by category', async () => {
    const delivery = await category('Delivery', '#0EA5E9')
    const misc = await category('Misc', '#64748B')
    await record(delivery, 6000, '2026-10-03')
    await record(delivery, 3000, '2026-10-05', 'PAYMENT_LINK')
    await record(misc, 3000, '2026-10-09')
    // Outside the period, or deleted: not counted.
    await record(misc, 50000, '2026-11-01')
    await record(misc, 7000, '2026-10-04', 'MANUAL', true)
    // The ten days just before: 8,000.
    await record(misc, 8000, '2026-09-25')

    const summary = await income.getSummaryCard(h.businessId, {
      from: '2026-10-01',
      to: '2026-10-10',
    })

    expect(summary).toMatchObject({
      total: 12000,
      count: 3,
      previousTotal: 8000,
      changePct: 50,
      avgPerDay: 1200,
      fromLinks: 3000,
      currency: 'XAF',
    })
    expect(summary.byCategory).toEqual([
      { categoryId: delivery, name: 'Delivery', color: '#0EA5E9', amount: 9000, percentage: 75 },
      { categoryId: misc, name: 'Misc', color: '#64748B', amount: 3000, percentage: 25 },
    ])
    expect(summary.largest).toMatchObject({ categoryId: delivery })
  })

  it('narrows to one category, and has no change with no range', async () => {
    const delivery = await category('Delivery', '#0EA5E9')
    const misc = await category('Misc', '#64748B')
    await record(delivery, 6000, '2026-10-03')
    await record(misc, 3000, '2026-10-09')

    const summary = await income.getSummaryCard(h.businessId, { categoryId: misc })
    expect(summary).toMatchObject({ total: 3000, count: 1, changePct: 0, avgPerDay: 100 })
    expect(summary.byCategory).toHaveLength(1)
  })
})
