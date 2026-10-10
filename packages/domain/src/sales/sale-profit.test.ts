import { describe, expect, it } from 'vitest'
import { SaleStatus } from '@biztrack/types'
import {
  netSalesProfit,
  PROFIT_SALE_STATUSES,
  refundProfitImpact,
  sumRefundProfitImpacts,
} from './sale-profit'

describe('PROFIT_SALE_STATUSES', () => {
  it('counts refunded and partially refunded sales, never voided ones', () => {
    expect(PROFIT_SALE_STATUSES).toContain(SaleStatus.COMPLETED)
    expect(PROFIT_SALE_STATUSES).toContain(SaleStatus.PARTIALLY_REFUNDED)
    expect(PROFIT_SALE_STATUSES).toContain(SaleStatus.REFUNDED)
    expect(PROFIT_SALE_STATUSES).not.toContain(SaleStatus.VOIDED)
  })
})

describe('refundProfitImpact (R4)', () => {
  it('subtracts the value actually charged, after discounts, not the list price', () => {
    // 2 units listed at 1000 each, sold for 1700 after discounts; 1 comes back.
    const impact = refundProfitImpact({
      restock: true,
      lines: [{ returnedQuantity: 1, soldQuantity: 2, lineTotal: 1700, costPrice: 600 }],
    })
    expect(impact).toEqual({ revenue: 850, cogs: 600, grossProfit: 250 })
  })

  it('keeps the cost when the goods were not put back into stock', () => {
    const impact = refundProfitImpact({
      restock: false,
      lines: [{ returnedQuantity: 1, soldQuantity: 2, lineTotal: 1700, costPrice: 600 }],
    })
    expect(impact).toEqual({ revenue: 850, cogs: 0, grossProfit: 850 })
  })

  it('sums several returned lines and rounds once to whole XAF', () => {
    const impact = refundProfitImpact({
      restock: true,
      lines: [
        { returnedQuantity: 1, soldQuantity: 3, lineTotal: 1000, costPrice: 200 },
        { returnedQuantity: 0.5, soldQuantity: 2, lineTotal: 3000, costPrice: 1000 },
      ],
    })
    // 333.33 + 750 = 1083.33 → 1083; cost 200 + 500 = 700.
    expect(impact).toEqual({ revenue: 1083, cogs: 700, grossProfit: 383 })
  })

  it('treats an unknown cost as zero', () => {
    const impact = refundProfitImpact({
      restock: true,
      lines: [{ returnedQuantity: 1, soldQuantity: 1, lineTotal: 500, costPrice: null }],
    })
    expect(impact).toEqual({ revenue: 500, cogs: 0, grossProfit: 500 })
  })

  it('is zero for a return with no lines', () => {
    expect(refundProfitImpact({ restock: true, lines: [] })).toEqual({
      revenue: 0,
      cogs: 0,
      grossProfit: 0,
    })
  })
})

describe('netSalesProfit (R4)', () => {
  it('is the period sales less the period refunds', () => {
    const refunds = sumRefundProfitImpacts([
      { revenue: 850, cogs: 600, grossProfit: 250 },
      { revenue: 500, cogs: 0, grossProfit: 500 },
    ])
    expect(refunds).toEqual({ revenue: 1350, cogs: 600, grossProfit: 750 })
    expect(netSalesProfit({ soldRevenue: 10000, soldCogs: 6000, refunds })).toEqual({
      revenue: 8650,
      cogs: 5400,
      grossProfit: 3250,
    })
  })

  it('can go negative on a day with only refunds', () => {
    const refunds = { revenue: 850, cogs: 600, grossProfit: 250 }
    expect(netSalesProfit({ soldRevenue: 0, soldCogs: 0, refunds })).toEqual({
      revenue: -850,
      cogs: -600,
      grossProfit: -250,
    })
  })
})
