import { ReviewFlagCode, ReviewFlagSeverity, type ReviewFlag } from '@biztrack/types'
import type { MessageKey } from '@/i18n/messages'

// How a review flag reads on screen. Which flag is raised and how serious it is, is decided
// in @biztrack/domain (packages/domain/src/review); this only turns the stored numbers into
// sentences.

type T = (key: MessageKey) => string
type Money = (n: number | null | undefined) => string

const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0))
const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const fill = (template: string, values: Record<string, string>): string =>
  Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, value), template)

export function flagTitle(t: T, code: ReviewFlagCode): string {
  return t(`review.code.${code}` as MessageKey)
}

export function flagNextStep(t: T, flag: ReviewFlag): string {
  if (flag.code === ReviewFlagCode.DISCOUNT_UNAUTHORIZED) {
    return t(`review.do.DISCOUNT_UNAUTHORIZED.${discountReason(flag)}` as MessageKey)
  }
  return t(`review.do.${flag.code}` as MessageKey)
}

// Why a discount was flagged (`SyncedDiscountFinding` in @biztrack/domain). A flag with a
// reason this build does not know reads as the plain over-the-limit case.
const DISCOUNT_REASONS = ['OVER_LIMIT', 'APPROVER_LIMIT', 'TILL_OLD_LIMITS'] as const
function discountReason(flag: ReviewFlag): (typeof DISCOUNT_REASONS)[number] {
  const reason = text(flag.details?.reason)
  return DISCOUNT_REASONS.find((known) => known === reason) ?? 'OVER_LIMIT'
}

export function severityLabel(t: T, severity: ReviewFlagSeverity): string {
  return t(`review.sev.${severity}` as MessageKey)
}

/** The `.sev-bar` modifier and the `.st` pill class for a severity. */
export function severityClasses(severity: ReviewFlagSeverity): { bar: string; pill: string } {
  if (severity === ReviewFlagSeverity.HIGH) return { bar: 'high', pill: 'st-out' }
  if (severity === ReviewFlagSeverity.MEDIUM) return { bar: 'med', pill: 'st-low' }
  return { bar: '', pill: 'st-neutral' }
}

/** One sentence saying what happened, with the numbers behind the flag. */
export function flagReason(t: T, money: Money, flag: ReviewFlag): string {
  const d = flag.details ?? {}
  switch (flag.code) {
    case ReviewFlagCode.REFUND_EXCEEDS_PAID:
      return fill(t('review.why.REFUND_EXCEEDS_PAID'), {
        refund: money(num(d.refundAmount)),
        paid: money(num(d.amountPaid)),
        excess: money(num(d.excess)),
      })
    case ReviewFlagCode.REFUND_AMOUNT_MISMATCH:
      return fill(t('review.why.REFUND_AMOUNT_MISMATCH'), {
        refund: money(num(d.refundAmount)),
        goods: money(num(d.goodsValue)),
        excess: money(num(d.excess)),
      })
    case ReviewFlagCode.REFUND_QUANTITY_MISMATCH: {
      const parts: string[] = []
      if (num(d.appliedQuantity) < num(d.tillQuantity)) {
        parts.push(
          fill(t('review.why.REFUND_QUANTITY_MISMATCH'), {
            till: String(num(d.tillQuantity)),
            applied: String(num(d.appliedQuantity)),
          }),
        )
      }
      if (num(d.unknownLineCount) > 0) {
        parts.push(
          fill(t('review.why.REFUND_QUANTITY_UNKNOWN'), { n: String(num(d.unknownLineCount)) }),
        )
      }
      return parts.join(' ') || flagTitle(t, flag.code)
    }
    case ReviewFlagCode.NEGATIVE_STOCK:
      return fill(t('review.why.NEGATIVE_STOCK'), {
        product: text(d.productName) || t('review.unknownProduct'),
        requested: String(num(d.requested)),
        available: String(num(d.available)),
        shortfall: String(num(d.shortfall)),
      })
    case ReviewFlagCode.SERIAL_ALREADY_SOLD:
      return fill(t('review.why.SERIAL_ALREADY_SOLD'), {
        serial: text(d.serialNumber) || t('review.unknownSerial'),
      })
    case ReviewFlagCode.DISCOUNT_UNAUTHORIZED:
      return fill(t(`review.why.DISCOUNT_UNAUTHORIZED.${discountReason(flag)}` as MessageKey), {
        discount: money(num(d.discountTotal)),
        subtotal: money(num(d.subtotal)),
      })
  }
}

// The stored numbers the drawer lists, in reading order. Ids are left out: they mean
// nothing to the owner.
const DETAIL_ROWS: Array<{ key: string; money?: boolean; suffix?: string }> = [
  { key: 'productName' },
  { key: 'serialNumber' },
  { key: 'refundAmount', money: true },
  { key: 'amountPaid', money: true },
  { key: 'goodsValue', money: true },
  { key: 'excess', money: true },
  { key: 'tillQuantity' },
  { key: 'appliedQuantity' },
  { key: 'unknownLineCount' },
  { key: 'available' },
  { key: 'requested' },
  { key: 'shortfall' },
  { key: 'discountTotal', money: true },
  { key: 'subtotal', money: true },
  { key: 'maxDiscountPercent', suffix: ' %' },
  { key: 'maxCartDiscountPercent', suffix: ' %' },
  { key: 'maxDiscountAmountXaf', money: true },
  { key: 'limitsVersion' },
  { key: 'tillLimitsVersion' },
]

export function flagDetailRows(
  t: T,
  money: Money,
  flag: ReviewFlag,
): Array<{ label: string; value: string }> {
  const d = flag.details ?? {}
  return DETAIL_ROWS.flatMap((row) => {
    const value = d[row.key]
    if (value == null || value === '') return []
    return [
      {
        label: t(`review.detail.${row.key}` as MessageKey),
        value: row.money ? money(num(value)) : `${String(value)}${row.suffix ?? ''}`,
      },
    ]
  })
}

/** The other sale holding a serial unit, when the flag knows it. */
export function flagOtherSaleId(flag: ReviewFlag): string | null {
  return text(flag.details?.soldOnSaleId) || null
}
