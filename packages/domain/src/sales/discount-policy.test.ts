import { describe, expect, it } from 'vitest'
import {
  evaluateDiscountAuthorization,
  isBelowCost,
  type RoleDiscountLimits,
} from './discount-policy'

const NO_LIMITS: RoleDiscountLimits = {
  maxDiscountPercent: null,
  maxCartDiscountPercent: null,
  maxDiscountAmountXaf: null,
}

describe('evaluateDiscountAuthorization', () => {
  it('never triggers when all limits are null', () => {
    const r = evaluateDiscountAuthorization(NO_LIMITS, {
      lines: [{ discountAmount: 5000, listedLineValue: 10000 }],
      cartDiscount: 4000,
      subtotal: 10000,
    })
    expect(r.overLimit).toBe(false)
    expect(r.reasons).toEqual([])
  })

  it('flags a line discount over the line percent limit', () => {
    const r = evaluateDiscountAuthorization(
      { ...NO_LIMITS, maxDiscountPercent: 10 },
      {
        lines: [
          { discountAmount: 500, listedLineValue: 10000 }, // 5% ok
          { discountAmount: 2000, listedLineValue: 10000 }, // 20% over
        ],
        cartDiscount: 0,
        subtotal: 20000,
      },
    )
    expect(r.overLimit).toBe(true)
    expect(r.reasons).toContain('LINE_PERCENT')
  })

  it('allows a line discount exactly at the limit', () => {
    const r = evaluateDiscountAuthorization(
      { ...NO_LIMITS, maxDiscountPercent: 10 },
      {
        lines: [{ discountAmount: 1000, listedLineValue: 10000 }],
        cartDiscount: 0,
        subtotal: 10000,
      },
    )
    expect(r.overLimit).toBe(false)
  })

  it('flags a cart discount over the cart percent limit', () => {
    const r = evaluateDiscountAuthorization(
      { ...NO_LIMITS, maxCartDiscountPercent: 5 },
      { lines: [], cartDiscount: 800, subtotal: 10000 }, // 8% over 5%
    )
    expect(r.reasons).toEqual(['CART_PERCENT'])
  })

  it('flags total discount over the amount limit (lines + cart)', () => {
    const r = evaluateDiscountAuthorization(
      { ...NO_LIMITS, maxDiscountAmountXaf: 1000 },
      {
        lines: [{ discountAmount: 600, listedLineValue: 10000 }],
        cartDiscount: 600,
        subtotal: 10000,
      }, // 1200 > 1000
    )
    expect(r.reasons).toEqual(['TOTAL_AMOUNT'])
  })

  it('reports every exceeded limit at once', () => {
    const r = evaluateDiscountAuthorization(
      { maxDiscountPercent: 5, maxCartDiscountPercent: 5, maxDiscountAmountXaf: 100 },
      {
        lines: [{ discountAmount: 5000, listedLineValue: 10000 }], // 50% line, 5000 amount
        cartDiscount: 5000, // 50% cart
        subtotal: 10000,
      },
    )
    expect(r.overLimit).toBe(true)
    expect(r.reasons.sort()).toEqual(['CART_PERCENT', 'LINE_PERCENT', 'TOTAL_AMOUNT'])
  })

  it('treats a zero listed value as 0% (never divides by zero)', () => {
    const r = evaluateDiscountAuthorization(
      { ...NO_LIMITS, maxDiscountPercent: 10 },
      { lines: [{ discountAmount: 500, listedLineValue: 0 }], cartDiscount: 0, subtotal: 0 },
    )
    expect(r.overLimit).toBe(false)
  })
})

describe('isBelowCost', () => {
  it('is true when a line is charged below its cost', () => {
    expect(isBelowCost([{ chargedUnitPrice: 800, cost: 1000 }])).toBe(true)
  })

  it('is false when every line is at or above cost', () => {
    expect(isBelowCost([{ chargedUnitPrice: 1000, cost: 1000 }])).toBe(false)
    expect(isBelowCost([{ chargedUnitPrice: 1200, cost: 1000 }])).toBe(false)
  })

  it('skips null/undefined cost silently', () => {
    expect(isBelowCost([{ chargedUnitPrice: 1, cost: null }])).toBe(false)
    expect(isBelowCost([{ chargedUnitPrice: 1, cost: undefined }])).toBe(false)
  })

  it('flags the sale when any single line is below cost', () => {
    expect(
      isBelowCost([
        { chargedUnitPrice: 2000, cost: 1000 },
        { chargedUnitPrice: 500, cost: 1000 }, // this one
      ]),
    ).toBe(true)
  })
})
