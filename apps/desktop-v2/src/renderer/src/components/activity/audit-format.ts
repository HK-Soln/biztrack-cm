// Activity Logs (BIZ-2.11) — audit presentation: action labels, per-entity accent/label, and
// the severity + before→after "diff" derived from each event's `changes` payload. Ported from
// the approved desktop design (audit-data.js). The heuristic is framed as "à vérifier" — a
// place to look, never a fraud score.
import type { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import type { LocalAuditLog } from '@shared/ipc'

const VARIANCE_TOLERANCE = 100

export type Severity = 'high' | 'med' | null
export type EntityAccent = 'brand' | 'success' | 'warning' | 'danger'

export interface DiffLine {
  label: string
  before?: string | null
  after: string
  tone?: 'neg' | 'pos'
}
export interface AuditMeta {
  label: string
  sev: Severity
  why: string | null
  diff: DiffLine[]
}

/** entityType → accent colour + i18n label key. Icons live in the component (JSX). */
export const ENTITY: Record<string, { accent: EntityAccent; labelKey: MessageKey }> = {
  sale: { accent: 'brand', labelKey: 'activity.entity.sale' },
  sale_line: { accent: 'brand', labelKey: 'activity.entity.sale_line' },
  cash_movement: { accent: 'success', labelKey: 'activity.entity.cash_movement' },
  cash_session: { accent: 'success', labelKey: 'activity.entity.cash_session' },
  inventory: { accent: 'warning', labelKey: 'activity.entity.inventory' },
  product: { accent: 'brand', labelKey: 'activity.entity.product' },
  product_variant: { accent: 'brand', labelKey: 'activity.entity.product_variant' },
  product_serial_unit: { accent: 'brand', labelKey: 'activity.entity.product_serial_unit' },
  business_member: { accent: 'brand', labelKey: 'activity.entity.business_member' },
  device: { accent: 'danger', labelKey: 'activity.entity.device' },
  pin_authorization: { accent: 'danger', labelKey: 'activity.entity.pin_authorization' },
}

export function entityAccent(entityType: string): EntityAccent {
  return ENTITY[entityType]?.accent ?? 'brand'
}
export function entityLabel(t: ReturnType<typeof useT>, entityType: string): string {
  const key = ENTITY[entityType]?.labelKey
  return key ? t(key) : entityType
}

export function actionLabel(t: ReturnType<typeof useT>, action: string): string {
  return t(`activity.action.${action}` as MessageKey)
}

/** Base severity that doesn't depend on the payload. */
const BASE_SEV: Record<string, Severity> = {
  DEVICE_TIME_CHANGED: 'high',
  SALE_VOIDED: 'high',
  PIN_FAILED: 'high',
  PIN_LOCKED: 'high',
}

/**
 * Derive the label, severity ("à vérifier"), a short reason, and a compact before→after diff
 * for one audit row. `money` formats whole XAF (from useCurrency).
 */
export function auditMeta(
  t: ReturnType<typeof useT>,
  row: LocalAuditLog,
  money: (n: number) => string,
): AuditMeta {
  const a = (row.changes?.after ?? null) as Record<string, unknown> | null
  const b = (row.changes?.before ?? null) as Record<string, unknown> | null
  const num = (v: unknown): number => Number(v ?? 0)
  const fill = (key: MessageKey, token: string, value: string): string =>
    t(key).replace(token, value)

  let sev: Severity = BASE_SEV[row.action] ?? null
  let why: string | null = null
  const diff: DiffLine[] = []

  switch (row.action) {
    case 'DEVICE_TIME_CHANGED':
      if (a) {
        const s = Math.round(num(a.driftMs) / 1000)
        why = fill('activity.why.drift', '{s}', String(s))
        diff.push({ label: t('activity.field.drift'), after: `${s} s` })
      }
      break
    case 'SHIFT_CLOSED':
      if (a) {
        diff.push({
          label: t('activity.field.expectedCounted'),
          before: money(num(a.expectedCash)),
          after: money(num(a.countedCash)),
        })
        const v = num(a.varianceCash)
        if (Math.abs(v) > VARIANCE_TOLERANCE) {
          sev = 'high'
          why = fill('activity.why.variance', '{v}', money(v))
          diff.push({
            label: t('activity.field.variance'),
            after: money(v),
            tone: v < 0 ? 'neg' : 'pos',
          })
        }
      }
      break
    case 'PIN_FAILED':
    case 'PIN_LOCKED':
      why = row.entityLabel || t('activity.why.pinFail')
      break
    case 'DISCOUNT_APPLIED':
      if (a) {
        if (a.unauthorized) {
          sev = 'high'
          why = t('activity.why.unauthorized')
        } else if (a.belowCost) {
          sev = 'high'
          why = t('activity.why.belowCost')
        }
        diff.push({ label: t('activity.field.discount'), after: money(num(row.amount)) })
      }
      break
    case 'SALE_VOIDED':
      if (a) {
        why = (a.voidReason as string) || actionLabel(t, row.action)
        diff.push({
          label: t('activity.field.status'),
          before: b?.status as string,
          after: a.status as string,
        })
      }
      break
    case 'CASH_MOVEMENT':
      if (a) {
        const out = a.direction === 'OUT'
        if (a.kind === 'OWNER_DRAW') {
          sev = 'high'
          why = t('activity.why.ownerDraw')
        }
        diff.push({
          label: t(`cash.kind.${String(a.kind)}` as MessageKey),
          after: `${out ? '− ' : '+ '}${money(num(a.amount))}`,
          tone: out ? 'neg' : 'pos',
        })
      }
      break
    case 'STOCK_ADJUSTED':
      if (a) {
        if (a.adjust === 'REMOVE') {
          sev = sev ?? 'med'
          const reason = a.reason ? ` · ${a.reason as string}` : ''
          why = t('activity.why.stockRemove') + reason
        }
        diff.push({
          label: t('activity.field.stock'),
          before: b ? String(num(b.stock)) : null,
          after: String(num(a.stock)),
          tone: b && num(a.stock) < num(b.stock) ? 'neg' : undefined,
        })
      }
      break
    case 'PRICE_CHANGED':
      if (a) {
        diff.push({
          label: t('activity.field.price'),
          before: b ? money(num(b.sellingPrice)) : null,
          after: money(num(a.sellingPrice)),
        })
      }
      break
    case 'SALE_LINE_REMOVED':
      if (b) {
        diff.push({
          label: t('activity.field.removed'),
          before: `${num(b.quantity)} × ${money(num(b.unitPrice))}`,
          after: '—',
        })
      }
      break
    case 'USER_ROLE_CHANGED':
      if (a)
        diff.push({
          label: t('activity.field.role'),
          before: b?.role as string,
          after: a.role as string,
        })
      break
    case 'UPDATE':
      if (a && b) {
        if (a.name !== b.name)
          diff.push({
            label: t('activity.field.name'),
            before: b.name as string,
            after: a.name as string,
          })
        if (a.categoryId !== b.categoryId)
          diff.push({
            label: t('activity.field.category'),
            before: b.categoryId as string,
            after: a.categoryId as string,
          })
      }
      break
    case 'CREATE':
      if (a) {
        if (a.totalAmount != null)
          diff.push({
            label: t('activity.field.total'),
            after: `${money(num(a.totalAmount))} · ${num(a.items)}`,
          })
        else if (a.sellingPrice != null)
          diff.push({ label: t('activity.field.sellingPrice'), after: money(num(a.sellingPrice)) })
      }
      break
    case 'SHIFT_OPENED':
      if (a)
        diff.push({ label: t('activity.field.openingFloat'), after: money(num(a.openingFloat)) })
      break
    default:
      break
  }

  return { label: actionLabel(t, row.action), sev, why, diff }
}

/**
 * Where a row deep-links, if anywhere. `sale` opens the sale drawer; everything product-related
 * navigates to the product detail. Products/inventory link by their own id; a variant or serial
 * unit links by the productId carried in its `changes` payload (its entityId is the variant/unit).
 */
export function auditDeepLink(
  row: Pick<LocalAuditLog, 'entityType' | 'entityId' | 'changes'>,
): { kind: 'sale' | 'product'; id: string } | null {
  if (row.entityType === 'sale') return { kind: 'sale', id: row.entityId }
  if (row.entityType === 'product' || row.entityType === 'inventory')
    return { kind: 'product', id: row.entityId }
  if (row.entityType === 'product_variant' || row.entityType === 'product_serial_unit') {
    const after = row.changes?.after as { productId?: string } | null
    const before = row.changes?.before as { productId?: string } | null
    const productId = after?.productId ?? before?.productId
    return productId ? { kind: 'product', id: productId } : null
  }
  return null
}
