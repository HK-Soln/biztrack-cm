import { describe, expect, it } from 'vitest'
import { ReviewFlagCode, ReviewFlagSeverity } from '@biztrack/types'
import {
  discountNeedsAuthorization,
  sameDiscountPolicy,
  type RoleDiscountPolicyVersion,
} from '../sales/discount-policy'
import { reviewSyncedDiscount } from './sync-review'

const policy = (over: Partial<RoleDiscountPolicyVersion> = {}): RoleDiscountPolicyVersion => ({
  maxDiscountPercent: null,
  maxCartDiscountPercent: 10,
  maxDiscountAmountXaf: null,
  allowBelowCost: false,
  version: 2,
  ...over,
})

// A 2,000 cart discount on a 10,000 sale: 20%.
const discount = {
  lines: [{ discountAmount: 0, listedLineValue: 10000 }],
  cartDiscount: 2000,
  subtotal: 10000,
}
const quiet = { unauthorized: false, authorizedBy: null }

const review = (over: Partial<Parameters<typeof reviewSyncedDiscount>[0]> = {}) =>
  reviewSyncedDiscount({
    saleId: 'sale-1',
    discount,
    belowCost: false,
    till: quiet,
    cashierPolicy: policy(),
    ...over,
  })

describe('reviewSyncedDiscount (R2)', () => {
  it('raises nothing when the discount was within the limits at the time', () => {
    expect(review({ cashierPolicy: policy({ maxCartDiscountPercent: 20 }) })).toBeNull()
  })

  it('lets the till verdict stand when there is no history for the time of the sale', () => {
    expect(review({ cashierPolicy: null })).toBeNull()
  })

  it('adds nothing when the till already recorded the discount as unauthorized', () => {
    expect(review({ till: { unauthorized: true, authorizedBy: null } })).toBeNull()
  })

  it('flags a discount over the limit that nobody approved', () => {
    expect(review()).toMatchObject({
      code: ReviewFlagCode.DISCOUNT_UNAUTHORIZED,
      severity: ReviewFlagSeverity.MEDIUM,
      entityId: 'sale-1',
      dedupeKey: 'sale-1:discount',
      details: {
        reason: 'OVER_LIMIT',
        exceeded: ['CART_PERCENT'],
        discountTotal: 2000,
        subtotal: 10000,
        maxCartDiscountPercent: 10,
        limitsVersion: 2,
        tillLimitsVersion: null,
      },
    })
  })

  it('is low when the discount was within the older limits the till still had', () => {
    const flag = review({ tillPolicy: policy({ maxCartDiscountPercent: 25, version: 1 }) })
    expect(flag).toMatchObject({
      severity: ReviewFlagSeverity.LOW,
      details: { reason: 'TILL_OLD_LIMITS', limitsVersion: 2, tillLimitsVersion: 1 },
    })
  })

  it('is the real flag when the discount was over the older limits too', () => {
    const flag = review({ tillPolicy: policy({ maxCartDiscountPercent: 15, version: 1 }) })
    expect(flag).toMatchObject({
      severity: ReviewFlagSeverity.MEDIUM,
      details: { reason: 'OVER_LIMIT' },
    })
  })

  it('does not excuse a till that says it used the limits in force', () => {
    const flag = review({ tillPolicy: policy({ maxCartDiscountPercent: 25, version: 2 }) })
    expect(flag?.details.reason).toBe('OVER_LIMIT')
  })

  describe('when a manager approved', () => {
    const approved = { unauthorized: false, authorizedBy: 'manager-1' }

    it('accepts the approval when the manager limits covered the discount', () => {
      expect(
        review({ till: approved, approverPolicy: policy({ maxCartDiscountPercent: 30 }) }),
      ).toBeNull()
      expect(
        review({ till: approved, approverPolicy: policy({ maxCartDiscountPercent: null }) }),
      ).toBeNull()
    })

    it('flags it when it was over the manager limits too', () => {
      const flag = review({
        till: approved,
        approverPolicy: policy({ maxCartDiscountPercent: 15, version: 4 }),
      })
      expect(flag).toMatchObject({
        severity: ReviewFlagSeverity.MEDIUM,
        details: {
          reason: 'APPROVER_LIMIT',
          exceeded: ['CART_PERCENT'],
          maxCartDiscountPercent: 15,
          authorizedBy: 'manager-1',
        },
      })
    })

    it('lets the approval stand when there is no history for the manager', () => {
      expect(review({ till: approved, approverPolicy: null })).toBeNull()
    })

    it('accepts any approval of a below-cost sale that is within the limits', () => {
      expect(
        review({
          till: approved,
          belowCost: true,
          cashierPolicy: policy({ maxCartDiscountPercent: 50 }),
          approverPolicy: policy({ maxCartDiscountPercent: 50, allowBelowCost: false }),
        }),
      ).toBeNull()
    })
  })

  it('flags a below-cost sale nobody approved when the role may not sell below cost', () => {
    const flag = review({ belowCost: true, cashierPolicy: policy({ maxCartDiscountPercent: 50 }) })
    expect(flag?.details).toMatchObject({ reason: 'OVER_LIMIT', exceeded: ['BELOW_COST'] })
    expect(
      review({
        belowCost: true,
        cashierPolicy: policy({ maxCartDiscountPercent: 50, allowBelowCost: true }),
      }),
    ).toBeNull()
  })
})

describe('discountNeedsAuthorization', () => {
  it('needs a manager when a limit is exceeded or a blocked line is below cost', () => {
    expect(discountNeedsAuthorization(policy(), discount, false)).toMatchObject({
      needsAuthorization: true,
      overLimit: true,
      belowCostBlocked: false,
    })
    const within = policy({ maxCartDiscountPercent: 50 })
    expect(discountNeedsAuthorization(within, discount, false).needsAuthorization).toBe(false)
    expect(discountNeedsAuthorization(within, discount, true)).toMatchObject({
      needsAuthorization: true,
      overLimit: false,
      belowCostBlocked: true,
    })
    expect(
      discountNeedsAuthorization({ ...within, allowBelowCost: true }, discount, true)
        .needsAuthorization,
    ).toBe(false)
  })
})

describe('sameDiscountPolicy', () => {
  it('ignores the version and number formatting, and sees every real change', () => {
    expect(sameDiscountPolicy(policy(), policy({ version: 9 }))).toBe(true)
    expect(
      sameDiscountPolicy(policy(), {
        ...policy(),
        maxCartDiscountPercent: '10.00' as unknown as number,
      }),
    ).toBe(true)
    expect(sameDiscountPolicy(policy(), policy({ maxCartDiscountPercent: 12 }))).toBe(false)
    expect(sameDiscountPolicy(policy(), policy({ maxCartDiscountPercent: null }))).toBe(false)
    expect(sameDiscountPolicy(policy(), policy({ maxDiscountAmountXaf: 0 }))).toBe(false)
    expect(sameDiscountPolicy(policy(), policy({ allowBelowCost: true }))).toBe(false)
  })
})
