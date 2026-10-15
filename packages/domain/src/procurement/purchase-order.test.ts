import { describe, expect, it } from 'vitest'
import { checkPurchaseOrder, priceOrderLines } from './purchase-order'

describe('priceOrderLines', () => {
  it('prices each line and totals the order in whole francs', () => {
    const { lines, total } = priceOrderLines([
      { id: 'a', quantity: 10, unitPrice: 600 },
      { id: 'b', quantity: 3, unitPrice: 333.33 },
      { id: 'c', quantity: 2 },
    ])
    expect(lines.map((l) => [l.id, l.lineTotal])).toEqual([
      ['a', 6000],
      ['b', 1000],
      ['c', 0],
    ])
    expect(total).toBe(7000)
  })
})

describe('checkPurchaseOrder', () => {
  it('needs lines, a quantity on each, and a total above zero', () => {
    expect(checkPurchaseOrder([])).toBe('PO_ITEMS_REQUIRED')
    expect(checkPurchaseOrder([{ quantity: 0, unitPrice: 100 }])).toBe('PO_ITEM_QTY_INVALID')
    expect(checkPurchaseOrder([{ quantity: Number.NaN, unitPrice: 100 }])).toBe(
      'PO_ITEM_QTY_INVALID',
    )
    expect(checkPurchaseOrder([{ quantity: 5, unitPrice: 0 }])).toBe('PO_TOTAL_ZERO')
    expect(checkPurchaseOrder([{ quantity: 5, unitPrice: 100 }])).toBeNull()
  })
})
