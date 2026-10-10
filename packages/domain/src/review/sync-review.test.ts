import { describe, expect, it } from 'vitest'
import { ReviewFlagCode, ReviewFlagSeverity } from '@biztrack/types'
import {
  reviewSerialAlreadySold,
  reviewStockAfterSyncedSale,
  reviewSyncedRefund,
} from './sync-review'

const refund = {
  saleId: 'sale-1',
  returnId: 'ret-1',
  tillRefundAmount: 2000,
  amountPaid: 4000,
  goodsValue: 2000,
  tillQuantity: 1,
  appliedQuantity: 1,
  unknownLineCount: 0,
}

describe('reviewSyncedRefund (R1)', () => {
  it('raises nothing when the till refunded the goods value', () => {
    expect(reviewSyncedRefund(refund)).toEqual([])
  })

  it('raises nothing when the till refunded less than the goods value', () => {
    expect(reviewSyncedRefund({ ...refund, tillRefundAmount: 500 })).toEqual([])
  })

  it('flags a refund above the goods value as MEDIUM', () => {
    const flags = reviewSyncedRefund({ ...refund, tillRefundAmount: 2500 })
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatchObject({
      code: ReviewFlagCode.REFUND_AMOUNT_MISMATCH,
      severity: ReviewFlagSeverity.MEDIUM,
      entityType: 'sale',
      entityId: 'sale-1',
      dedupeKey: 'ret-1:amount',
      details: { refundAmount: 2500, goodsValue: 2000, excess: 500 },
    })
  })

  it('flags a refund above what was paid as HIGH, and only that', () => {
    const flags = reviewSyncedRefund({ ...refund, tillRefundAmount: 5000 })
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatchObject({
      code: ReviewFlagCode.REFUND_EXCEEDS_PAID,
      severity: ReviewFlagSeverity.HIGH,
      dedupeKey: 'ret-1:exceeds-paid',
      details: { refundAmount: 5000, amountPaid: 4000, excess: 1000 },
    })
  })

  it('flags any refund on an unpaid sale as HIGH', () => {
    const flags = reviewSyncedRefund({ ...refund, tillRefundAmount: 1, amountPaid: 0 })
    expect(flags.map((f) => f.code)).toEqual([ReviewFlagCode.REFUND_EXCEEDS_PAID])
  })

  it('flags lines the server could not apply as sent', () => {
    const short = reviewSyncedRefund({ ...refund, tillQuantity: 3, appliedQuantity: 1 })
    expect(short.map((f) => f.code)).toEqual([ReviewFlagCode.REFUND_QUANTITY_MISMATCH])
    const unknown = reviewSyncedRefund({ ...refund, unknownLineCount: 1 })
    expect(unknown[0]).toMatchObject({
      code: ReviewFlagCode.REFUND_QUANTITY_MISMATCH,
      severity: ReviewFlagSeverity.MEDIUM,
      dedupeKey: 'ret-1:quantity',
    })
  })

  it('can raise an amount flag and a quantity flag together', () => {
    const flags = reviewSyncedRefund({
      ...refund,
      tillRefundAmount: 5000,
      tillQuantity: 2,
      appliedQuantity: 1,
    })
    expect(flags.map((f) => f.code)).toEqual([
      ReviewFlagCode.REFUND_EXCEEDS_PAID,
      ReviewFlagCode.REFUND_QUANTITY_MISMATCH,
    ])
  })
})

describe('reviewStockAfterSyncedSale (R3)', () => {
  const stock = { saleId: 'sale-1', productId: 'p-1', available: 5, requested: 3 }

  it('raises nothing while stock stays at or above zero', () => {
    expect(reviewStockAfterSyncedSale(stock)).toBeNull()
    expect(reviewStockAfterSyncedSale({ ...stock, requested: 5 })).toBeNull()
  })

  it('flags stock that goes below zero, with the shortfall', () => {
    expect(
      reviewStockAfterSyncedSale({ ...stock, requested: 8, variantId: 'v-1', outletId: 'o-1' }),
    ).toMatchObject({
      code: ReviewFlagCode.NEGATIVE_STOCK,
      severity: ReviewFlagSeverity.MEDIUM,
      entityId: 'sale-1',
      dedupeKey: 'sale-1:stock:p-1:v-1',
      outletId: 'o-1',
      details: { available: 5, requested: 8, shortfall: 3 },
    })
  })
})

describe('reviewSerialAlreadySold (R3)', () => {
  it('flags the conflict as HIGH and names the sale holding the unit', () => {
    expect(
      reviewSerialAlreadySold({
        saleId: 'sale-2',
        serialUnitId: 'su-1',
        serialNumber: 'IMEI-1',
        soldOnSaleId: 'sale-1',
      }),
    ).toMatchObject({
      code: ReviewFlagCode.SERIAL_ALREADY_SOLD,
      severity: ReviewFlagSeverity.HIGH,
      entityId: 'sale-2',
      dedupeKey: 'sale-2:serial:su-1',
      details: { serialUnitId: 'su-1', serialNumber: 'IMEI-1', soldOnSaleId: 'sale-1' },
    })
  })
})
