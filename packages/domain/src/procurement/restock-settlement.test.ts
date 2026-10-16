import { describe, expect, it } from 'vitest'
import {
  checkRestockCredit,
  restockAdjustmentAmount,
  restockTotals,
  settleRestock,
} from './restock-settlement'

describe('restockAdjustmentAmount', () => {
  it('takes a percentage of the goods or a fixed amount, in whole francs', () => {
    expect(restockAdjustmentAmount({ kind: 'PERCENT', value: 5, subtotal: 10333 })).toBe(517)
    expect(restockAdjustmentAmount({ kind: 'FIXED', value: 1500.4, subtotal: 10000 })).toBe(1500)
  })
  it('never goes below zero and ignores a value that is not a number', () => {
    expect(restockAdjustmentAmount({ kind: 'FIXED', value: -200, subtotal: 10000 })).toBe(0)
    expect(restockAdjustmentAmount({ kind: 'PERCENT', value: NaN, subtotal: 10000 })).toBe(0)
  })
})

describe('restockTotals', () => {
  it('is goods less discounts plus charges, never below zero', () => {
    expect(restockTotals({ subtotal: 10000, discounts: [500], charges: [1200, 300] })).toEqual({
      subtotal: 10000,
      discountAmount: 500,
      chargesAmount: 1500,
      totalAmount: 11000,
    })
    expect(restockTotals({ subtotal: 1000, discounts: [5000] }).totalAmount).toBe(0)
  })
})

describe('settleRestock', () => {
  const lines = [
    { quantity: 10, unitCost: 600 },
    { quantity: 2, unitCost: 1500 },
  ]

  it('values the goods from the lines and leaves the unpaid part on credit', () => {
    expect(settleRestock({ lines, discounts: [1000], payments: [5000] })).toEqual({
      ok: true,
      subtotal: 9000,
      discountAmount: 1000,
      chargesAmount: 0,
      totalAmount: 8000,
      amountPaid: 5000,
      creditAmount: 3000,
    })
  })

  it('is paid in full when no payment is given', () => {
    expect(settleRestock({ lines })).toMatchObject({ amountPaid: 9000, creditAmount: 0 })
  })

  it('caps a single amount paid at the total', () => {
    expect(settleRestock({ lines, amountPaid: 20000 })).toMatchObject({
      amountPaid: 9000,
      creditAmount: 0,
    })
  })

  it('refuses split payments above the total', () => {
    expect(settleRestock({ lines, payments: [6000, 4000] })).toEqual({
      ok: false,
      code: 'RESTOCK_PAYMENT_EXCEEDS_TOTAL',
      details: { amountPaid: 10000, totalAmount: 9000 },
    })
  })

  it('uses an invoice subtotal when a line has no cost, and needs one then', () => {
    const uncosted = [{ quantity: 10, unitCost: null }]
    expect(settleRestock({ lines: uncosted, subtotal: 7000 })).toMatchObject({
      ok: true,
      totalAmount: 7000,
    })
    expect(settleRestock({ lines: uncosted })).toEqual({
      ok: false,
      code: 'RESTOCK_TOTAL_AMOUNT_REQUIRED',
    })
  })

  it('refuses an invoice subtotal that does not match the lines', () => {
    expect(settleRestock({ lines, subtotal: 9500 })).toMatchObject({
      ok: false,
      code: 'RESTOCK_TOTAL_AMOUNT_MISMATCH',
    })
    expect(settleRestock({ lines, subtotal: 9000 })).toMatchObject({ ok: true })
  })

  it('works in whole francs', () => {
    expect(settleRestock({ lines: [{ quantity: 3, unitCost: 333.33 }] })).toMatchObject({
      subtotal: 1000,
      totalAmount: 1000,
    })
  })
})

describe('checkRestockCredit', () => {
  it('needs a supplier and the invoice for anything left on credit', () => {
    const credit = { creditAmount: 3000, hasSupplier: true, hasInvoiceFile: true }
    expect(checkRestockCredit(credit)).toBeNull()
    expect(checkRestockCredit({ ...credit, hasSupplier: false })).toBe(
      'SUPPLIER_REQUIRED_FOR_CREDIT',
    )
    expect(checkRestockCredit({ ...credit, hasInvoiceFile: false })).toBe(
      'INVOICE_REQUIRED_FOR_CREDIT',
    )
    expect(checkRestockCredit({ creditAmount: 0, hasSupplier: false, hasInvoiceFile: false })).toBe(
      null,
    )
  })
})
