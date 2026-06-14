'use client'

import { useState } from 'react'
import { Loader2, MapPin, Package, Phone, StickyNote, User, X } from 'lucide-react'
import { Button } from '@biztrack/ui'
import type {
  OnlineOrderDetail,
  OnlineOrderEventType,
  OnlineOrderStatus,
  UpdateOrderStatusRequest,
} from '@biztrack/types'
import { cn } from '@/lib/utils'
import { formatCurrency } from '../../../_components/dashboard.shared'
import { ORDER_STATUS_META, PAYMENT_STATUS_META, nextActions } from '../order-status'

const EVENT_LABELS: Record<OnlineOrderEventType, string> = {
  ORDER_PLACED: 'Order placed',
  PAYMENT_INITIATED: 'Payment initiated',
  PAYMENT_RECEIVED: 'Payment received',
  PAYMENT_FAILED: 'Payment failed',
  ORDER_CONFIRMED: 'Order confirmed',
  PREPARATION_STARTED: 'Preparation started',
  ORDER_DISPATCHED: 'Order dispatched',
  ORDER_DELIVERED: 'Order delivered',
  ORDER_CANCELLED: 'Order cancelled',
  ORDER_REFUNDED: 'Order refunded',
  NOTE_ADDED: 'Note added',
  DELIVERY_ATTEMPTED: 'Delivery attempted',
}

interface OrderDetailDrawerProps {
  order: OnlineOrderDetail | null
  loading: boolean
  busy: boolean
  localeTag: string
  currency: string
  onClose: () => void
  onUpdateStatus: (id: string, payload: UpdateOrderStatusRequest) => Promise<void>
}

function formatDateTime(iso: string | null | undefined, localeTag: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(localeTag, { dateStyle: 'medium', timeStyle: 'short' })
}

export function OrderDetailDrawer({
  order,
  loading,
  busy,
  localeTag,
  currency,
  onClose,
  onUpdateStatus,
}: OrderDetailDrawerProps) {
  const [internalNote, setInternalNote] = useState('')
  const [customerMessage, setCustomerMessage] = useState('')
  const [pendingTo, setPendingTo] = useState<OnlineOrderStatus | null>(null)

  const apply = async (to: OnlineOrderStatus, requireConfirm: boolean) => {
    if (!order || busy) return
    if (requireConfirm && pendingTo !== to) {
      setPendingTo(to)
      return
    }
    await onUpdateStatus(order.id, {
      status: to,
      internalNote: internalNote.trim() || undefined,
      customerMessage: customerMessage.trim() || undefined,
    })
    setInternalNote('')
    setCustomerMessage('')
    setPendingTo(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {order ? `Order ${order.orderNumber}` : 'Order'}
            </h2>
            {order ? (
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={cn(
                    'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                    ORDER_STATUS_META[order.status].pill,
                  )}
                >
                  {ORDER_STATUS_META[order.status].label}
                </span>
                <span
                  className={cn(
                    'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                    PAYMENT_STATUS_META[order.paymentStatus].pill,
                  )}
                >
                  {PAYMENT_STATUS_META[order.paymentStatus].label}
                </span>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading || !order ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {/* Customer */}
            <section className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-foreground">
                <User className="h-4 w-4 text-muted-foreground" /> {order.customerName}
              </div>
              {order.customerPhone ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" /> {order.customerPhone}
                </div>
              ) : null}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Package className="h-4 w-4" /> {order.fulfillmentType === 'PICKUP' ? 'Pickup' : 'Delivery'}
              </div>
              {order.fulfillmentType === 'DELIVERY' &&
              (order.deliveryAddress || order.deliveryCity) ? (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{[order.deliveryAddress, order.deliveryCity].filter(Boolean).join(', ')}</span>
                </div>
              ) : null}
              {order.deliveryNotes ? (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <StickyNote className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{order.deliveryNotes}</span>
                </div>
              ) : null}
            </section>

            {/* Items */}
            <section className="rounded-xl border border-border">
              <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Items
              </div>
              <ul className="divide-y divide-border">
                {(order.items ?? []).map((item, index) => (
                  <li key={`${item.productId}-${index}`} className="flex justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate text-foreground">
                        {item.productName}
                        {item.variantName ? (
                          <span className="text-muted-foreground"> · {item.variantName}</span>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.quantity} × {formatCurrency(item.unitPrice, localeTag, currency)}
                      </span>
                    </span>
                    <span className="shrink-0 text-foreground">
                      {formatCurrency(item.unitPrice * item.quantity, localeTag, currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t border-border px-3 py-2 text-sm font-semibold text-foreground">
                <span>Total</span>
                <span>{formatCurrency(order.totalAmount, localeTag, currency)}</span>
              </div>
            </section>

            {/* Timeline */}
            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Timeline
              </h3>
              <ol className="space-y-3 border-l border-border pl-4">
                {order.events.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border border-card bg-primary" />
                    <div className="text-sm text-foreground">{EVENT_LABELS[event.eventType]}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(event.createdAt, localeTag)}
                    </div>
                    {event.customerMessage ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">“{event.customerMessage}”</div>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>

            {/* Status actions */}
            {nextActions(order.status).length > 0 ? (
              <section className="space-y-3 rounded-xl border border-border bg-background p-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Update status
                </h3>
                <div className="space-y-2">
                  <textarea
                    value={customerMessage}
                    onChange={(e) => setCustomerMessage(e.target.value)}
                    placeholder="Message to customer (optional)"
                    rows={2}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <textarea
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    placeholder="Internal note (optional)"
                    rows={2}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {nextActions(order.status).map((action) => {
                    const isDanger = action.tone === 'danger'
                    const confirming = pendingTo === action.to
                    return (
                      <Button
                        key={action.to}
                        variant={isDanger ? 'danger' : 'primary'}
                        disabled={busy}
                        onClick={() => apply(action.to, isDanger)}
                      >
                        {busy && confirming ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                        {confirming ? 'Confirm —' : ''} {action.label}
                      </Button>
                    )
                  })}
                </div>
                {pendingTo ? (
                  <p className="text-xs text-muted-foreground">
                    Click the highlighted action again to confirm.
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
