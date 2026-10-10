import { describe, expect, it } from 'vitest'
import { hasPriceDrift, priceSale, priceSaleLine, roundQuantity } from './sale-pricing'

describe('priceSaleLine (BIZ-1.2 OVERRIDE model)', () => {
  it('rings a plain line at the charged price with no discount', () => {
    expect(priceSaleLine({ quantity: 2, unitPrice: 1000 })).toEqual({
      quantity: 2,
      unitPrice: 1000,
      unitPriceListed: 1000,
      chargedUnitPrice: 1000,
      discountAmount: 0,
      cartDiscountAlloc: 0,
      lineTotal: 2000,
      lineDiscounts: [],
    })
  })

  it('rungs a bargained line at the listed price and folds the gap into an OVERRIDE discount', () => {
    const line = priceSaleLine({ quantity: 2, unitPrice: 900, unitPriceListed: 1000 })
    expect(line.unitPrice).toBe(1000)
    expect(line.chargedUnitPrice).toBe(900)
    expect(line.discountAmount).toBe(200)
    expect(line.lineTotal).toBe(1800)
    expect(line.lineDiscounts).toEqual([
      { discountType: 'OVERRIDE', amount: 200, reasonCode: 'NEGOTIATED', reasonNote: null },
    ])
  })

  it('keeps the cashier reason on the OVERRIDE discount', () => {
    const line = priceSaleLine({
      quantity: 1,
      unitPrice: 800,
      unitPriceListed: 1000,
      reasonCode: 'DAMAGED',
      reasonNote: 'dented box',
    })
    expect(line.lineDiscounts).toEqual([
      { discountType: 'OVERRIDE', amount: 200, reasonCode: 'DAMAGED', reasonNote: 'dented box' },
    ])
  })

  it('adds an explicit line discount on top of the override, each as its own row', () => {
    const line = priceSaleLine({
      quantity: 2,
      unitPrice: 900,
      unitPriceListed: 1000,
      discountAmount: 100,
    })
    expect(line.discountAmount).toBe(300)
    expect(line.lineTotal).toBe(1700)
    expect(line.lineDiscounts.map((d) => [d.discountType, d.amount])).toEqual([
      ['OVERRIDE', 200],
      ['FIXED_AMOUNT', 100],
    ])
    expect(line.lineDiscounts.reduce((sum, d) => sum + d.amount, 0)).toBe(line.discountAmount)
  })

  it('keeps a price above listed as a markup, never a negative discount', () => {
    const line = priceSaleLine({ quantity: 1, unitPrice: 1200, unitPriceListed: 1000 })
    expect(line.unitPrice).toBe(1200)
    expect(line.unitPriceListed).toBe(1000)
    expect(line.discountAmount).toBe(0)
    expect(line.lineTotal).toBe(1200)
    expect(line.lineDiscounts).toEqual([])
  })

  it('rounds a fractional-quantity line to whole XAF', () => {
    expect(priceSaleLine({ quantity: 1.5, unitPrice: 333 }).lineTotal).toBe(500)
  })

  it('reconciles a bargained fractional line: listed × qty − discount === lineTotal', () => {
    // 0.5 × (1000 − 995) = 2.5 → an OVERRIDE of 3, so the line is 500 − 3 = 497.
    const line = priceSaleLine({ quantity: 0.5, unitPrice: 995, unitPriceListed: 1000 })
    expect(line.discountAmount).toBe(3)
    expect(line.lineTotal).toBe(497)
    expect(line.unitPrice * line.quantity - line.discountAmount).toBe(line.lineTotal)
  })

  it('never lets a line total go below zero', () => {
    expect(priceSaleLine({ quantity: 1, unitPrice: 500, discountAmount: 900 }).lineTotal).toBe(0)
  })

  it('treats a negative line discount as none', () => {
    const line = priceSaleLine({ quantity: 1, unitPrice: 500, discountAmount: -50 })
    expect(line.discountAmount).toBe(0)
    expect(line.lineTotal).toBe(500)
  })
})

describe('priceSale (totals + BIZ-1.3 cart-discount allocation)', () => {
  it('sums lines into the subtotal and total', () => {
    const sale = priceSale({
      lines: [
        { quantity: 2, unitPrice: 1000 },
        { quantity: 1, unitPrice: 3000 },
      ],
    })
    expect(sale.subtotal).toBe(5000)
    expect(sale.discountAmount).toBe(0)
    expect(sale.chargesAmount).toBe(0)
    expect(sale.totalAmount).toBe(5000)
  })

  it('applies the cart discount and charges to the total', () => {
    const sale = priceSale({
      lines: [
        { quantity: 1, unitPrice: 1000 },
        { quantity: 1, unitPrice: 3000 },
      ],
      cartDiscount: 500,
      charges: 200,
    })
    expect(sale.subtotal).toBe(4000)
    expect(sale.totalAmount).toBe(3700)
    expect(sale.lines.map((l) => l.cartDiscountAlloc)).toEqual([125, 375])
    expect(sale.lines.map((l) => l.lineTotal)).toEqual([875, 2625])
  })

  it('allocates the cart discount exactly, remainder to the largest line', () => {
    const sale = priceSale({
      lines: [
        { quantity: 1, unitPrice: 100 },
        { quantity: 1, unitPrice: 100 },
        { quantity: 1, unitPrice: 100 },
      ],
      cartDiscount: 100,
    })
    const allocated = sale.lines.reduce((sum, l) => sum + l.cartDiscountAlloc, 0)
    expect(allocated).toBe(sale.discountAmount)
    expect(sale.lines.reduce((sum, l) => sum + l.lineTotal, 0)).toBe(
      sale.subtotal - sale.discountAmount,
    )
  })

  it('caps the cart discount at the subtotal', () => {
    const sale = priceSale({ lines: [{ quantity: 1, unitPrice: 1000 }], cartDiscount: 5000 })
    expect(sale.discountAmount).toBe(1000)
    expect(sale.totalAmount).toBe(0)
    expect(sale.lines[0]?.lineTotal).toBe(0)
  })

  it('ignores a negative cart discount or negative charges', () => {
    const sale = priceSale({
      lines: [{ quantity: 1, unitPrice: 1000 }],
      cartDiscount: -300,
      charges: -200,
    })
    expect(sale.discountAmount).toBe(0)
    expect(sale.chargesAmount).toBe(0)
    expect(sale.totalAmount).toBe(1000)
  })

  it('prices an empty sale as zero', () => {
    expect(priceSale({ lines: [] })).toEqual({
      lines: [],
      subtotal: 0,
      discountAmount: 0,
      chargesAmount: 0,
      totalAmount: 0,
    })
  })
})

describe('roundQuantity', () => {
  it('keeps at most three decimals', () => {
    expect(roundQuantity(1.23456)).toBe(1.235)
    expect(roundQuantity(2)).toBe(2)
  })
})

describe('hasPriceDrift', () => {
  it('flags a charged price more than 10% off the selling price', () => {
    expect(hasPriceDrift(1000, 1000)).toBe(false)
    expect(hasPriceDrift(1100, 1000)).toBe(false)
    expect(hasPriceDrift(1101, 1000)).toBe(true)
    expect(hasPriceDrift(880, 1000)).toBe(true)
  })

  it('flags any positive price on a zero-priced product', () => {
    expect(hasPriceDrift(0, 0)).toBe(false)
    expect(hasPriceDrift(1, 0)).toBe(true)
  })
})
