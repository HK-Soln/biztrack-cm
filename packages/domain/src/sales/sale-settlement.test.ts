import { describe, expect, it } from 'vitest'
import { PaymentMethod, SalePaymentKind, SaleStatus } from '@biztrack/types'
import {
  checkSaleCredit,
  decideSaleRefund,
  decideSaleVoid,
  effectivePaymentLines,
  returnDebtReduction,
  saleReturnStatus,
  settleSale,
  settleSaleFromLedger,
  storedPaymentMethod,
} from './sale-settlement'

describe('settleSale', () => {
  it('settles an exact payment with no credit and no change', () => {
    expect(settleSale({ totalAmount: 2000, payments: [{ amount: 2000 }] })).toEqual({
      amountPaid: 2000,
      creditAmount: 0,
      changeGiven: 0,
    })
  })

  it('returns the excess tendered as change', () => {
    expect(settleSale({ totalAmount: 2000, payments: [{ amount: 2500 }] })).toEqual({
      amountPaid: 2500,
      creditAmount: 0,
      changeGiven: 500,
    })
  })

  it('leaves the unpaid balance as credit, with zero change', () => {
    expect(settleSale({ totalAmount: 2000, payments: [{ amount: 500 }] })).toEqual({
      amountPaid: 500,
      creditAmount: 1500,
      changeGiven: 0,
    })
  })

  it('sums split payments', () => {
    const result = settleSale({ totalAmount: 5000, payments: [{ amount: 3000 }, { amount: 2000 }] })
    expect(result.amountPaid).toBe(5000)
    expect(result.creditAmount).toBe(0)
  })

  it('treats a sale with no payment as fully on credit', () => {
    expect(settleSale({ totalAmount: 1200, payments: [] })).toEqual({
      amountPaid: 0,
      creditAmount: 1200,
      changeGiven: 0,
    })
  })

  it('ignores zero, negative and non-finite payment lines', () => {
    const payments = [{ amount: 1000 }, { amount: 0 }, { amount: -50 }, { amount: Number.NaN }]
    expect(effectivePaymentLines(payments)).toEqual([{ amount: 1000 }])
    expect(settleSale({ totalAmount: 1000, payments }).amountPaid).toBe(1000)
  })
})

describe('storedPaymentMethod', () => {
  it('is the method of a single payment', () => {
    expect(storedPaymentMethod([{ method: PaymentMethod.CASH, amount: 500 }])).toBe(
      PaymentMethod.CASH,
    )
  })

  it('is that method when several lines share it', () => {
    expect(
      storedPaymentMethod([
        { method: PaymentMethod.CASH, amount: 500 },
        { method: PaymentMethod.CASH, amount: 300 },
      ]),
    ).toBe(PaymentMethod.CASH)
  })

  it('is MIXED across different methods', () => {
    expect(
      storedPaymentMethod([
        { method: PaymentMethod.CASH, amount: 500 },
        { method: PaymentMethod.MTN_MOMO, amount: 300 },
      ]),
    ).toBe(PaymentMethod.MIXED)
  })

  it('is MIXED when nothing was paid', () => {
    expect(storedPaymentMethod([])).toBe(PaymentMethod.MIXED)
    expect(storedPaymentMethod([{ method: PaymentMethod.CASH, amount: 0 }])).toBe(
      PaymentMethod.MIXED,
    )
  })
})

describe('checkSaleCredit', () => {
  it('accepts a fully paid walk-in sale', () => {
    expect(checkSaleCredit({ creditAmount: 0, hasCustomer: false })).toBeNull()
  })

  it('requires a customer for a credit sale', () => {
    expect(checkSaleCredit({ creditAmount: 500, hasCustomer: false })).toBe(
      'CUSTOMER_REQUIRED_FOR_CREDIT',
    )
    expect(checkSaleCredit({ creditAmount: 500, hasCustomer: true })).toBeNull()
  })

  it('rejects a device credit amount that differs from the computed balance', () => {
    expect(
      checkSaleCredit({ creditAmount: 500, hasCustomer: true, expectedCreditAmount: 400 }),
    ).toBe('SALE_CREDIT_AMOUNT_MISMATCH')
    expect(
      checkSaleCredit({ creditAmount: 500, hasCustomer: true, expectedCreditAmount: 500 }),
    ).toBeNull()
  })
})

describe('settleSaleFromLedger', () => {
  const PAYMENT = SalePaymentKind.PAYMENT
  const REFUND = SalePaymentKind.REFUND

  it('sums payments, leaving the balance as credit', () => {
    expect(
      settleSaleFromLedger({ totalAmount: 5000, entries: [{ kind: PAYMENT, amount: 3000 }] }),
    ).toEqual({ amountPaid: 3000, creditAmount: 2000 })
  })

  it('subtracts refunds and reopens credit', () => {
    expect(
      settleSaleFromLedger({
        totalAmount: 4000,
        entries: [
          { kind: PAYMENT, amount: 4000 },
          { kind: REFUND, amount: 1500 },
        ],
      }),
    ).toEqual({ amountPaid: 2500, creditAmount: 1500 })
  })

  it('does not count returned goods as owed (R9)', () => {
    // Paid in full, 1,500 of goods returned for cash: nothing is owed.
    expect(
      settleSaleFromLedger({
        totalAmount: 4000,
        returnedGoodsValue: 1500,
        entries: [
          { kind: PAYMENT, amount: 4000 },
          { kind: REFUND, amount: 1500 },
        ],
      }),
    ).toEqual({ amountPaid: 2500, creditAmount: 0 })
    // 10,000 with 4,000 paid, 2,000 of goods returned against the debt: 4,000 still owed.
    expect(
      settleSaleFromLedger({
        totalAmount: 10000,
        returnedGoodsValue: 2000,
        entries: [{ kind: PAYMENT, amount: 4000 }],
      }),
    ).toEqual({ amountPaid: 4000, creditAmount: 4000 })
    // Everything returned: nothing owed, whatever was paid.
    expect(
      settleSaleFromLedger({ totalAmount: 10000, returnedGoodsValue: 10000, entries: [] }),
    ).toEqual({ amountPaid: 0, creditAmount: 0 })
  })

  it('never lets the paid amount go below zero', () => {
    expect(
      settleSaleFromLedger({
        totalAmount: 1000,
        entries: [
          { kind: PAYMENT, amount: 500 },
          { kind: REFUND, amount: 900 },
        ],
      }),
    ).toEqual({ amountPaid: 0, creditAmount: 1000 })
  })
})

describe('decideSaleRefund', () => {
  const items = [
    { id: 'si-1', quantity: 2, lineTotal: 4000 },
    { id: 'si-2', quantity: 1, lineTotal: 1500 },
  ]

  it('returns every line on a full return and refunds the goods value', () => {
    const decision = decideSaleRefund({ items, amountPaid: 5500 })
    expect(decision).toEqual({
      ok: true,
      lines: [
        { saleItemId: 'si-1', quantity: 2, requestIndex: null },
        { saleItemId: 'si-2', quantity: 1, requestIndex: null },
      ],
      isFullReturn: true,
      goodsValue: 5500,
      refundAmount: 5500,
      debtReduction: 0,
      status: SaleStatus.REFUNDED,
    })
  })

  describe('when the customer still owes on the sale (R10)', () => {
    // 10 units at 1,000. Paid 4,000 at the till, 6,000 on credit.
    const credit = [{ id: 'si-1', quantity: 10, lineTotal: 10000 }]
    const returning = (quantity: number, over: Record<string, unknown> = {}) => {
      const decision = decideSaleRefund({
        items: credit,
        returns: [{ saleItemId: 'si-1', quantity }],
        amountPaid: 4000,
        outstandingBalance: 6000,
        ...over,
      })
      if (!decision.ok) throw new Error(decision.code)
      return decision
    }

    it('takes the goods off the debt and hands back nothing while a balance is left', () => {
      expect(returning(2)).toMatchObject({ goodsValue: 2000, refundAmount: 0, debtReduction: 2000 })
    })

    it('refunds only what is beyond the debt', () => {
      expect(returning(8)).toMatchObject({
        goodsValue: 8000,
        refundAmount: 2000,
        debtReduction: 6000,
      })
    })

    it('does not let the cashier hand back more than that', () => {
      expect(returning(2, { requestedAmount: 2000 })).toMatchObject({
        refundAmount: 0,
        debtReduction: 2000,
      })
      expect(returning(8, { requestedAmount: 4000 })).toMatchObject({ refundAmount: 2000 })
    })

    it('lets the cashier hand back less', () => {
      expect(returning(8, { requestedAmount: 500 })).toMatchObject({
        refundAmount: 500,
        debtReduction: 6000,
      })
    })

    it('counts what was paid on the debt as money received', () => {
      // 3,000 of the 6,000 was paid off since: 7,000 received, 3,000 still owed.
      expect(returning(10, { amountPaid: 7000, outstandingBalance: 3000 })).toMatchObject({
        goodsValue: 10000,
        refundAmount: 7000,
        debtReduction: 3000,
      })
    })
  })

  describe('returnDebtReduction', () => {
    it('is the goods value not handed back, up to what is owed', () => {
      const reduce = (goodsValue: number, cashRefunded: number, outstandingBalance: number) =>
        returnDebtReduction({ goodsValue, cashRefunded, outstandingBalance })
      expect(reduce(2000, 0, 6000)).toBe(2000)
      expect(reduce(8000, 2000, 6000)).toBe(6000)
      // A till that handed the money back anyway: the debt is not reduced as well.
      expect(reduce(2000, 2000, 6000)).toBe(0)
      expect(reduce(2000, 5000, 6000)).toBe(0)
      expect(reduce(2000, 0, 0)).toBe(0)
    })
  })

  it('values a partial return at the discounted per-unit price', () => {
    const decision = decideSaleRefund({
      items,
      returns: [{ saleItemId: 'si-1', quantity: 1 }],
      amountPaid: 5500,
    })
    expect(decision).toMatchObject({
      ok: true,
      lines: [{ saleItemId: 'si-1', quantity: 1, requestIndex: 0 }],
      isFullReturn: false,
      goodsValue: 2000,
      refundAmount: 2000,
      status: SaleStatus.PARTIALLY_REFUNDED,
    })
  })

  it('is a full return when every line is returned explicitly', () => {
    const decision = decideSaleRefund({
      items,
      returns: [
        { saleItemId: 'si-1', quantity: 2 },
        { saleItemId: 'si-2', quantity: 1 },
      ],
      amountPaid: 5500,
    })
    expect(decision).toMatchObject({ ok: true, isFullReturn: true, status: SaleStatus.REFUNDED })
  })

  it('caps the returned quantity at the quantity sold', () => {
    const decision = decideSaleRefund({
      items,
      returns: [{ saleItemId: 'si-2', quantity: 5 }],
      amountPaid: 5500,
    })
    expect(decision).toMatchObject({ ok: true, lines: [{ saleItemId: 'si-2', quantity: 1 }] })
  })

  it('returns a fractional quantity of a weighed line', () => {
    const decision = decideSaleRefund({
      items: [{ id: 'si-kg', quantity: 2, lineTotal: 3000 }],
      returns: [{ saleItemId: 'si-kg', quantity: 0.5 }],
      amountPaid: 3000,
    })
    expect(decision).toMatchObject({
      ok: true,
      lines: [{ saleItemId: 'si-kg', quantity: 0.5 }],
      goodsValue: 750,
      status: SaleStatus.PARTIALLY_REFUNDED,
    })
  })

  it('caps the money returned at what was paid', () => {
    const decision = decideSaleRefund({ items, amountPaid: 1000 })
    expect(decision).toMatchObject({ ok: true, goodsValue: 5500, refundAmount: 1000 })
  })

  it('refunds nothing on an unpaid credit sale', () => {
    expect(decideSaleRefund({ items, amountPaid: 0 })).toMatchObject({ ok: true, refundAmount: 0 })
  })

  it('honours a requested amount below the goods value', () => {
    const decision = decideSaleRefund({ items, requestedAmount: 3000, amountPaid: 5500 })
    expect(decision).toMatchObject({ ok: true, refundAmount: 3000 })
  })

  it('treats a negative requested amount as zero', () => {
    const decision = decideSaleRefund({ items, requestedAmount: -100, amountPaid: 5500 })
    expect(decision).toMatchObject({ ok: true, refundAmount: 0 })
  })

  it('rejects a line that is not on the sale', () => {
    expect(
      decideSaleRefund({
        items,
        returns: [{ saleItemId: 'other', quantity: 1 }],
        amountPaid: 5500,
      }),
    ).toEqual({ ok: false, code: 'RETURN_ITEM_NOT_FOUND' })
  })

  it('rejects a return with no positive quantity', () => {
    expect(
      decideSaleRefund({ items, returns: [{ saleItemId: 'si-1', quantity: 0 }], amountPaid: 5500 }),
    ).toEqual({ ok: false, code: 'NOTHING_TO_RETURN' })
  })

  it('completes a sale when a second partial return brings back the rest (R5)', () => {
    const decision = decideSaleRefund({
      items: [
        { id: 'si-1', quantity: 2, lineTotal: 4000, returnedQuantity: 1 },
        { id: 'si-2', quantity: 1, lineTotal: 1500, returnedQuantity: 1 },
      ],
      returns: [{ saleItemId: 'si-1', quantity: 1 }],
      amountPaid: 2000,
    })
    expect(decision).toMatchObject({
      ok: true,
      isFullReturn: true,
      status: SaleStatus.REFUNDED,
      goodsValue: 2000,
    })
  })

  it('only returns what is left of a line after earlier returns', () => {
    const decision = decideSaleRefund({
      items: [{ id: 'si-1', quantity: 2, lineTotal: 4000, returnedQuantity: 1.5 }],
      returns: [{ saleItemId: 'si-1', quantity: 2 }],
      amountPaid: 4000,
    })
    expect(decision).toMatchObject({
      ok: true,
      lines: [{ saleItemId: 'si-1', quantity: 0.5 }],
      goodsValue: 1000,
      status: SaleStatus.REFUNDED,
    })
  })

  it('a full return after a partial one brings back only the remainder', () => {
    const decision = decideSaleRefund({
      items: [
        { id: 'si-1', quantity: 2, lineTotal: 4000, returnedQuantity: 2 },
        { id: 'si-2', quantity: 1, lineTotal: 1500 },
      ],
      amountPaid: 1500,
    })
    expect(decision).toMatchObject({
      ok: true,
      lines: [{ saleItemId: 'si-2', quantity: 1, requestIndex: null }],
      goodsValue: 1500,
      status: SaleStatus.REFUNDED,
    })
  })

  it('rejects a return when everything already came back', () => {
    expect(
      decideSaleRefund({
        items: [{ id: 'si-1', quantity: 2, lineTotal: 4000, returnedQuantity: 2 }],
        amountPaid: 0,
      }),
    ).toEqual({ ok: false, code: 'NOTHING_TO_RETURN' })
  })

  it('caps repeated request lines for the same item at the quantity sold', () => {
    const decision = decideSaleRefund({
      items: [{ id: 'si-1', quantity: 2, lineTotal: 4000 }],
      returns: [
        { saleItemId: 'si-1', quantity: 2 },
        { saleItemId: 'si-1', quantity: 1 },
      ],
      amountPaid: 4000,
    })
    expect(decision).toMatchObject({
      ok: true,
      lines: [{ saleItemId: 'si-1', quantity: 2, requestIndex: 0 }],
      goodsValue: 4000,
    })
  })
})

describe('saleReturnStatus (R5)', () => {
  it('is REFUNDED only when every line is returned in full, by quantity', () => {
    expect(
      saleReturnStatus([
        { quantity: 2, returnedQuantity: 2 },
        { quantity: 0.5, returnedQuantity: 0.5 },
      ]),
    ).toBe(SaleStatus.REFUNDED)
    expect(
      saleReturnStatus([
        { quantity: 2, returnedQuantity: 2 },
        { quantity: 1, returnedQuantity: 0 },
      ]),
    ).toBe(SaleStatus.PARTIALLY_REFUNDED)
    expect(saleReturnStatus([{ quantity: 1 }])).toBe(SaleStatus.PARTIALLY_REFUNDED)
  })
})

describe('decideSaleVoid', () => {
  const items = [
    { id: 'si-1', quantity: 2, lineTotal: 1700, costPrice: 500 },
    { id: 'si-2', quantity: 1, lineTotal: 1500, costPrice: 900 },
  ]

  it('voids a sale with no refund in full', () => {
    expect(decideSaleVoid({ status: SaleStatus.COMPLETED, items })).toEqual({
      ok: true,
      lines: [
        { saleItemId: 'si-1', quantity: 2 },
        { saleItemId: 'si-2', quantity: 1 },
      ],
      balance: { revenue: 3200, cogs: 1900, grossProfit: 1300 },
    })
  })

  it('voids only the balance left after a partial refund', () => {
    // One unit of si-1 already came back and took 850 off revenue.
    const decision = decideSaleVoid({
      status: SaleStatus.PARTIALLY_REFUNDED,
      items: [{ ...items[0]!, returnedQuantity: 1 }, items[1]!],
      refundedRevenue: 850,
    })
    expect(decision).toEqual({
      ok: true,
      lines: [
        { saleItemId: 'si-1', quantity: 1 },
        { saleItemId: 'si-2', quantity: 1 },
      ],
      balance: { revenue: 2350, cogs: 1400, grossProfit: 950 },
    })
  })

  it('leaves out a line that was returned in full', () => {
    const decision = decideSaleVoid({
      status: SaleStatus.PARTIALLY_REFUNDED,
      items: [items[0]!, { ...items[1]!, returnedQuantity: 1 }],
      refundedRevenue: 1500,
    })
    expect(decision).toMatchObject({
      ok: true,
      lines: [{ saleItemId: 'si-1', quantity: 2 }],
      balance: { revenue: 1700, cogs: 1000 },
    })
  })

  it('refuses to void a fully refunded sale', () => {
    expect(decideSaleVoid({ status: SaleStatus.REFUNDED, items })).toEqual({
      ok: false,
      code: 'FULLY_REFUNDED',
    })
    expect(
      decideSaleVoid({
        status: SaleStatus.PARTIALLY_REFUNDED,
        items: items.map((item) => ({ ...item, returnedQuantity: item.quantity })),
        refundedRevenue: 3200,
      }),
    ).toEqual({ ok: false, code: 'FULLY_REFUNDED' })
  })

  it('refuses to void a sale twice', () => {
    expect(decideSaleVoid({ status: SaleStatus.VOIDED, items })).toEqual({
      ok: false,
      code: 'ALREADY_VOIDED',
    })
  })
})
