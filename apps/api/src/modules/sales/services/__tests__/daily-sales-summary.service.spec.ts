import { PaymentMethod } from '@biztrack/types'
import { Repository } from 'typeorm'
import { DailySaleSummary } from '@/entities/daily-sale-summary.entity'
import { Sale } from '@/entities/sale.entity'
import { SaleItem } from '@/entities/sale-item.entity'
import { SalePayment } from '@/entities/sale-payment.entity'
import { DailySalesSummaryService } from '../daily-sales-summary.service'

/**
 * BIZ-4.1 (D7): the summary writer must post the Income-Statement revenue (Σ line_total, excl.
 * sale-level charges) into total_revenue/gross_profit, while preserving the transaction total
 * (Σ sale.total_amount, incl. charges) in total_transacted for cash reconciliation.
 */
describe('DailySalesSummaryService (D7 revenue basis)', () => {
  const makeService = () => {
    const query = jest.fn().mockResolvedValue(undefined)
    const repo = { query } as unknown as Repository<DailySaleSummary>
    return { service: new DailySalesSummaryService(repo), query }
  }

  // Two lines summing to 1500 (Σ line_total), plus a 100 sale-level charge → total_amount 1600.
  const items = [
    { lineTotal: 1000, costPrice: 400, quantity: 1, discountAmount: 0 },
    { lineTotal: 500, costPrice: 200, quantity: 1, discountAmount: 0 },
  ] as unknown as SaleItem[]
  const payments = [{ method: PaymentMethod.CASH, amount: 1600 }] as unknown as SalePayment[]
  const sale = {
    businessId: 'biz-1',
    saleDate: '2026-08-27',
    totalAmount: 1600, // subtotal 1500 + 100 charge
    discountAmount: 0,
    creditAmount: 0,
  } as unknown as Sale

  it('increment: total_revenue = Σ line_total, total_transacted = total_amount, gross_profit = revenue − COGS', async () => {
    const { service, query } = makeService()
    await service.incrementForSale(sale, items, payments)

    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('total_transacted')
    // params: [businessId, saleDate, revenue, cost, grossProfit, discounts, cash, mtn, orange, card, credit, creditSales, transacted]
    expect(params[2]).toBe(1500) // total_revenue = Σ line_total (charge excluded)
    expect(params[4]).toBe(900) // gross_profit = 1500 − 600 COGS
    expect(params[12]).toBe(1600) // total_transacted = total_amount (charge included)
  })

  it('void: decrements revenue by Σ line_total and voided_amount/transacted by total_amount', async () => {
    const { service, query } = makeService()
    await service.decrementForVoid(sale, items, payments)

    const [, params] = query.mock.calls[0] as [string, unknown[]]
    expect(params[2]).toBe(1500) // total_revenue decrement basis
    expect(params[12]).toBe(1600) // total_transacted / voided_amount basis
  })

  it('refund: subtracts the refunded revenue and restocked cost on the refund day (R4)', async () => {
    const { service, query } = makeService()
    await service.applyRefund('biz-1', '2026-09-02', { revenue: 850, cogs: 600, grossProfit: 250 })
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(['biz-1', '2026-09-02', 850, 600, 250])
    expect(sql).toContain('total_revenue = daily_sale_summaries.total_revenue - $3::numeric')
    expect(sql).toContain('total_cost = daily_sale_summaries.total_cost - $4::numeric')
    expect(sql).toContain('gross_profit = daily_sale_summaries.gross_profit - $5::numeric')
    expect(sql).toContain('total_refunds = daily_sale_summaries.total_refunds + $3::numeric')
  })

  it('refund: writes nothing when the refund moves neither revenue nor cost', async () => {
    const { service, query } = makeService()
    await service.applyRefund('biz-1', '2026-09-02', { revenue: 0, cogs: 0, grossProfit: 0 })
    expect(query).not.toHaveBeenCalled()
  })
})
