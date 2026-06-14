import type { OnlineOrderStatus, OnlinePaymentStatus } from '@biztrack/types'

export interface StatusMeta {
  label: string
  /** Tailwind classes for the status pill (border + bg + text). */
  pill: string
}

export const ORDER_STATUS_META: Record<OnlineOrderStatus, StatusMeta> = {
  PENDING: { label: 'Pending', pill: 'border-amber-500/30 bg-amber-500/10 text-amber-600' },
  CONFIRMED: { label: 'Confirmed', pill: 'border-blue-500/30 bg-blue-500/10 text-blue-600' },
  PREPARING: { label: 'Preparing', pill: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-600' },
  DISPATCHED: { label: 'Dispatched', pill: 'border-violet-500/30 bg-violet-500/10 text-violet-600' },
  DELIVERED: { label: 'Delivered', pill: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' },
  CANCELLED: { label: 'Cancelled', pill: 'border-rose-500/30 bg-rose-500/10 text-rose-600' },
  REFUNDED: { label: 'Refunded', pill: 'border-slate-500/30 bg-slate-500/10 text-slate-500' },
}

export const PAYMENT_STATUS_META: Record<OnlinePaymentStatus, StatusMeta> = {
  PENDING: { label: 'Unpaid', pill: 'border-amber-500/30 bg-amber-500/10 text-amber-600' },
  PAID: { label: 'Paid', pill: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' },
  FAILED: { label: 'Payment failed', pill: 'border-rose-500/30 bg-rose-500/10 text-rose-600' },
  REFUNDED: { label: 'Refunded', pill: 'border-slate-500/30 bg-slate-500/10 text-slate-500' },
}

/** Status filters shown as tabs on the list (ALL first). */
export const STATUS_FILTERS: Array<{ value: OnlineOrderStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PREPARING', label: 'Preparing' },
  { value: 'DISPATCHED', label: 'Dispatched' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'REFUNDED', label: 'Refunded' },
]

export interface StatusAction {
  to: OnlineOrderStatus
  label: string
  /** Primary actions move the order forward; danger actions cancel/refund. */
  tone: 'primary' | 'danger'
}

/**
 * Allowed forward transitions per current status. Marking an order DELIVERED
 * records the deferred financial sale (COD cash collected at delivery), so it is
 * the terminal "happy path" step before an optional refund.
 */
export function nextActions(status: OnlineOrderStatus): StatusAction[] {
  switch (status) {
    case 'PENDING':
      return [
        { to: 'CONFIRMED', label: 'Confirm order', tone: 'primary' },
        { to: 'CANCELLED', label: 'Cancel', tone: 'danger' },
      ]
    case 'CONFIRMED':
      return [
        { to: 'PREPARING', label: 'Start preparing', tone: 'primary' },
        { to: 'CANCELLED', label: 'Cancel', tone: 'danger' },
      ]
    case 'PREPARING':
      return [
        { to: 'DISPATCHED', label: 'Mark dispatched', tone: 'primary' },
        { to: 'CANCELLED', label: 'Cancel', tone: 'danger' },
      ]
    case 'DISPATCHED':
      return [
        { to: 'DELIVERED', label: 'Mark delivered & record sale', tone: 'primary' },
        { to: 'CANCELLED', label: 'Cancel', tone: 'danger' },
      ]
    case 'DELIVERED':
      return [{ to: 'REFUNDED', label: 'Refund order', tone: 'danger' }]
    default:
      return []
  }
}
