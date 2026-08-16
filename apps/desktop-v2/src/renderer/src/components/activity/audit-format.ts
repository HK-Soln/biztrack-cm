// Activity screen (BIZ-2.11) — audit action labels + the client-side risk heuristic.
// The heuristic is deliberately framed as "à vérifier" (a place to look), never a fraud
// score: it points the owner at events worth a second glance, not a verdict.
import type { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import type { LocalAuditLog } from '@shared/ipc'

/** ± band a shift may close within before its variance is worth reviewing (mirrors the cash tolerance). */
const VARIANCE_TOLERANCE = 100

export function actionLabel(t: ReturnType<typeof useT>, action: string): string {
  return t(`activity.action.${action}` as MessageKey)
}

export interface AuditFlag {
  flagged: boolean
  /** i18n key for the reason this event is worth reviewing. */
  reason?: MessageKey
}

/**
 * Whether an audit row is worth a second look, and why. Reads the event's `changes` payload
 * (shape varies by action). Covers the BIZ-2.11 list: voids, unauthorized/below-cost
 * discounts, negative stock adjustments, cash-out, failed PINs, out-of-tolerance closes, and
 * a device clock change.
 */
export function flagAuditRow(row: Pick<LocalAuditLog, 'action' | 'changes'>): AuditFlag {
  const after = (row.changes?.after ?? {}) as Record<string, unknown>
  const before = (row.changes?.before ?? {}) as Record<string, unknown>
  switch (row.action) {
    case 'SALE_VOIDED':
      return { flagged: true, reason: 'activity.flag.void' }
    case 'DISCOUNT_APPLIED':
      return after.unauthorized || after.belowCost
        ? { flagged: true, reason: 'activity.flag.discount' }
        : { flagged: false }
    case 'STOCK_ADJUSTED':
      return Number(after.stock) < Number(before.stock)
        ? { flagged: true, reason: 'activity.flag.stock' }
        : { flagged: false }
    case 'CASH_MOVEMENT':
      return after.direction === 'OUT'
        ? { flagged: true, reason: 'activity.flag.cashOut' }
        : { flagged: false }
    case 'PIN_FAILED':
    case 'PIN_LOCKED':
      return { flagged: true, reason: 'activity.flag.pin' }
    case 'SHIFT_CLOSED':
      return Math.abs(Number(after.varianceCash) || 0) > VARIANCE_TOLERANCE
        ? { flagged: true, reason: 'activity.flag.variance' }
        : { flagged: false }
    case 'DEVICE_TIME_CHANGED':
      return { flagged: true, reason: 'activity.flag.clock' }
    default:
      return { flagged: false }
  }
}

/** Where a row deep-links, if anywhere. `sale` opens the sale drawer; `product` navigates. */
export function auditDeepLink(
  row: Pick<LocalAuditLog, 'entityType' | 'entityId'>,
): { kind: 'sale' | 'product'; id: string } | null {
  if (row.entityType === 'sale') return { kind: 'sale', id: row.entityId }
  if (row.entityType === 'product' || row.entityType === 'inventory')
    return { kind: 'product', id: row.entityId }
  return null
}
