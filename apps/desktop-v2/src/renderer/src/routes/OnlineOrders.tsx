import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { errorMessage } from '@/lib/error'
import { OnlineError, OnlineUpsell, isPlanUpgrade } from '@/components/online/OnlineStates'
import {
  ONLINE_ORDER_TRANSITIONS,
  ONLINE_ORDER_COMPLETION_STATUSES,
  ONLINE_PAYMENT_METHODS,
  type OnlineOrderStatus,
  type OnlineFulfillmentType,
  type OnlinePaymentMethod,
  type OnlinePaymentStatus,
  type OnlineCartItem,
  type OrderSerialSelection,
  type LocalSerialUnit,
} from '@shared/ipc'

const I = {
  truck: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" />
      <circle cx="7" cy="17" r="1.6" />
      <circle cx="17" cy="17" r="1.6" />
    </svg>
  ),
  bag: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 9h16l-1-5H5L4 9Z" />
      <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  ),
  print: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v7H8z" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
}

// Ordered fulfilment progression per type (drives the tracking stepper). Kept in lockstep
// with the API state machine (ONLINE_ORDER_TRANSITIONS).
const DELIVERY_FLOW: OnlineOrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_DISPATCH',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
]
const PICKUP_FLOW: OnlineOrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'PICKED_UP',
]
function flowFor(f: OnlineFulfillmentType): OnlineOrderStatus[] {
  return f === 'PICKUP' ? PICKUP_FLOW : DELIVERY_FLOW
}
// Statuses offered in the list filters (both branches; CANCELLED added at the call site).
const FILTER_STATUSES: OnlineOrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_DISPATCH',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'DELIVERY_FAILED',
  'RETURNED',
]
// The primary forward action from a status (excludes the cancel / failed / return
// branches — those are separate actions). For DELIVERY_FAILED this yields OUT_FOR_DELIVERY
// (retry). Undefined at a completed/terminal state.
function primaryNext(
  f: OnlineFulfillmentType,
  s: OnlineOrderStatus,
): OnlineOrderStatus | undefined {
  return (ONLINE_ORDER_TRANSITIONS[f][s] ?? []).find(
    (o) => o !== 'CANCELLED' && o !== 'DELIVERY_FAILED' && o !== 'RETURNED',
  )
}
// Off-flow terminal states (no more fulfilment actions).
function isOffFlow(s: OnlineOrderStatus): boolean {
  return s === 'CANCELLED' || s === 'RETURNED'
}

function statusMeta(
  t: ReturnType<typeof useT>,
  s: OnlineOrderStatus,
): { label: string; cls: string } {
  switch (s) {
    case 'PENDING':
      return { label: t('online.stNew'), cls: 'st-brand' }
    case 'CONFIRMED':
      return { label: t('online.stConfirmed'), cls: 'st-low' }
    case 'PREPARING':
      return { label: t('online.stPreparing'), cls: 'st-low' }
    case 'READY_FOR_PICKUP':
      return { label: t('online.stReadyForPickup'), cls: 'st-low' }
    case 'PICKED_UP':
      return { label: t('online.stPickedUp'), cls: 'st-ok' }
    case 'READY_FOR_DISPATCH':
      return { label: t('online.stReadyForDispatch'), cls: 'st-low' }
    case 'OUT_FOR_DELIVERY':
      return { label: t('online.stOutForDelivery'), cls: 'st-neutral' }
    case 'DELIVERED':
      return { label: t('online.stDelivered'), cls: 'st-ok' }
    case 'DELIVERY_FAILED':
      return { label: t('online.stDeliveryFailed'), cls: 'st-out' }
    case 'RETURNED':
      return { label: t('online.stReturned'), cls: 'st-out' }
    case 'CANCELLED':
      return { label: t('online.stCancelled'), cls: 'st-out' }
    default:
      return { label: s, cls: 'st-neutral' }
  }
}
// Label for the primary forward action, keyed by the CURRENT status.
function advanceLabel(t: ReturnType<typeof useT>, s: OnlineOrderStatus): string {
  switch (s) {
    case 'PENDING':
      return t('online.advance.PENDING')
    case 'CONFIRMED':
      return t('online.advance.CONFIRMED')
    case 'PREPARING':
      return t('online.advance.PREPARING')
    case 'READY_FOR_PICKUP':
      return t('online.advance.READY_FOR_PICKUP')
    case 'READY_FOR_DISPATCH':
      return t('online.advance.READY_FOR_DISPATCH')
    case 'OUT_FOR_DELIVERY':
      return t('online.advance.OUT_FOR_DELIVERY')
    case 'DELIVERY_FAILED':
      return t('online.advance.DELIVERY_FAILED')
    default:
      return ''
  }
}
function initials(name?: string | null): string {
  const p = (name ?? '').trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '—'
}
function paymentLabel(t: ReturnType<typeof useT>, s: OnlinePaymentStatus): string {
  switch (s) {
    case 'PAID':
      return t('online.payPaid')
    case 'AUTHORIZED':
      return t('online.payAuthorized')
    case 'FAILED':
      return t('online.payFailed')
    case 'REFUNDED':
      return t('online.payRefunded')
    case 'PARTIALLY_REFUNDED':
      return t('online.payPartRefund')
    default:
      return t('online.payPending')
  }
}

export function OnlineOrders() {
  const t = useT()
  const bp = useBreakpoint()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const navigate = useNavigate()
  const [status, setStatus] = useState<OnlineOrderStatus | ''>('')
  const [fulfil, setFulfil] = useState<'' | 'DELIVERY' | 'PICKUP'>('')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['online', 'orders', status],
    queryFn: () => dataClient.online.listOrders({ status: status || undefined, limit: 100 }),
    enabled: true,
    retry: false,
  })

  const all = list.data?.data ?? []
  // KPIs from the loaded page (no summary endpoint yet). Computed before any early return
  // so hook order stays stable across the upsell/error branches.
  const kpis = useMemo(() => {
    const newCount = all.filter((o) => o.status === 'PENDING').length
    const inProgress: OnlineOrderStatus[] = [
      'CONFIRMED',
      'PREPARING',
      'READY_FOR_DISPATCH',
      'READY_FOR_PICKUP',
      'OUT_FOR_DELIVERY',
      'DELIVERY_FAILED',
    ]
    const toShip = all.filter((o) => inProgress.includes(o.status)).length
    const delivered = all.filter((o) => o.status === 'DELIVERED' || o.status === 'PICKED_UP')
    const sales = all
      .filter((o) => o.status !== 'CANCELLED' && o.status !== 'RETURNED')
      .reduce((a, o) => a + o.totalAmount, 0)
    return { newCount, toShip, delivered: delivered.length, sales, total: all.length }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data])

  if (list.error && isPlanUpgrade(list.error)) return <OnlineUpsell />

  const rows = all.filter((o) => {
    if (fulfil && o.fulfillmentType !== fulfil) return false
    const q = search.trim().toLowerCase()
    if (
      q &&
      !(
        (o.orderNumber ?? '').toLowerCase().includes(q) ||
        (o.customerName ?? '').toLowerCase().includes(q)
      )
    )
      return false
    return true
  })

  const STATUS_CHIPS: Array<OnlineOrderStatus | ''> = ['', ...FILTER_STATUSES, 'CANCELLED']

  // --- mobile: header + KPIs + search + status chips + order list (reuses OrderDrawer) ---
  if (bp === 'mobile') {
    return (
      <>
        <header className="m-head">
          <button
            type="button"
            className="back"
            onClick={() => navigate(-1)}
            aria-label={t('common.back')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <div className="m-tt">
            <div className="m-title">{t('online.ordersTitle')}</div>
            <div className="m-sub">
              {t('online.kpiOrders').replace('{n}', String(kpis.total))} ·{' '}
              {money.format(kpis.sales)}
            </div>
          </div>
        </header>

        <div className="mkpis" style={{ marginBottom: 16 }}>
          <div className="mkpi">
            <div className="top">
              <span className="ic b">{I.bag}</span>
            </div>
            <div className="v" style={{ color: 'var(--brand)' }}>
              {kpis.newCount}
            </div>
            <div className="k">{t('online.kpiNew')}</div>
          </div>
          <div className="mkpi">
            <div className="top">
              <span className="ic w">{I.truck}</span>
            </div>
            <div className="v" style={{ color: 'var(--warning)' }}>
              {kpis.toShip}
            </div>
            <div className="k">{t('online.kpiToShip')}</div>
          </div>
        </div>

        {list.error ? (
          <OnlineError error={list.error} onRetry={() => list.refetch()} />
        ) : (
          <>
            <div className="msearch" style={{ marginBottom: 12 }}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="9" cy="9" r="6" />
                <path d="m14 14 3 3" />
              </svg>
              <input
                placeholder={t('online.searchOrders')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="mchips" style={{ marginBottom: 16 }}>
              {STATUS_CHIPS.map((s) => (
                <button
                  key={s || 'all'}
                  type="button"
                  className={`mchip${status === s ? ' active' : ''}`}
                  onClick={() => setStatus(s)}
                >
                  {s ? statusMeta(t, s).label : t('online.allStatuses')}
                </button>
              ))}
            </div>
            <div className="mlist">
              {list.isPending && rows.length === 0 ? (
                <div className="mrow" style={{ cursor: 'default' }}>
                  <div className="mt">
                    <div className="sub">{t('online.loading')}</div>
                  </div>
                </div>
              ) : null}
              {!list.isPending && rows.length === 0 ? (
                <div className="mrow" style={{ cursor: 'default' }}>
                  <div className="mt">
                    <div className="sub">{t('online.noOrders')}</div>
                  </div>
                </div>
              ) : null}
              {rows.map((o) => {
                const st = statusMeta(t, o.status)
                return (
                  <button key={o.id} type="button" className="mrow" onClick={() => setOpenId(o.id)}>
                    <div className="th brand round">{initials(o.customerName)}</div>
                    <div className="mt">
                      <div className="nm">
                        #{o.orderNumber} · {o.customerName ?? t('online.guest')}
                      </div>
                      <div className="sub">
                        {o.fulfillmentType === 'PICKUP' ? t('online.pickup') : t('online.delivery')}{' '}
                        · {formatTime(o.createdAt, lang)} · {t('online.colItems')}{' '}
                        {o.items?.length ?? 0}
                      </div>
                    </div>
                    <div className="rt">
                      <div className="v">{money.format(o.totalAmount)}</div>
                      <div className="s">
                        <span className={`mst ${st.cls.replace('st-', 'mst-')}`}>
                          <span className="d" />
                          {st.label}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {openId ? <OrderDrawer id={openId} t={t} onClose={() => setOpenId(null)} /> : null}
      </>
    )
  }

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('online.ordersTitle')}</h1>
          <p>{t('online.ordersSubtitle')}</p>
        </div>
      </div>

      <div className="minihead">
        <div className="m">
          <div className="k">{t('online.kpiSales')}</div>
          <div className="v">{money.format(kpis.sales)}</div>
          <div className="h">{t('online.kpiOrders').replace('{n}', String(kpis.total))}</div>
        </div>
        <div className="m">
          <div className="k">{t('online.kpiNew')}</div>
          <div className="v" style={{ color: 'var(--brand)' }}>
            {kpis.newCount}
          </div>
          <div className="h">{t('online.kpiAwaiting')}</div>
        </div>
        <div className="m">
          <div className="k">{t('online.kpiToShip')}</div>
          <div className="v" style={{ color: 'var(--warning)' }}>
            {kpis.toShip}
          </div>
          <div className="h">{t('online.kpiToShipHint')}</div>
        </div>
        <div className="m">
          <div className="k">{t('online.kpiFulfilled')}</div>
          <div className="v">{kpis.delivered}</div>
          <div className="h">{t('online.kpiFulfilledHint')}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{t('online.orders')}</h3>
          <div className="field" style={{ flex: 1, minWidth: 200, marginLeft: 16 }}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="9" cy="9" r="6" />
              <path d="m14 14 3 3" />
            </svg>
            <input
              className="input ic"
              style={{ height: 36 }}
              placeholder={t('online.searchOrders')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="select"
            style={{ height: 36 }}
            value={status}
            onChange={(e) => setStatus(e.target.value as OnlineOrderStatus | '')}
          >
            <option value="">{t('online.allStatuses')}</option>
            {FILTER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusMeta(t, s).label}
              </option>
            ))}
            <option value="CANCELLED">{statusMeta(t, 'CANCELLED').label}</option>
          </select>
          <select
            className="select"
            style={{ height: 36 }}
            value={fulfil}
            onChange={(e) => setFulfil(e.target.value as '' | 'DELIVERY' | 'PICKUP')}
          >
            <option value="">{t('online.allFulfilment')}</option>
            <option value="DELIVERY">{t('online.delivery')}</option>
            <option value="PICKUP">{t('online.pickup')}</option>
          </select>
        </div>

        {list.error ? (
          <OnlineError error={list.error} onRetry={() => list.refetch()} />
        ) : (
          <>
            <table className="ltbl">
              <thead>
                <tr>
                  <th>{t('online.colOrder')}</th>
                  <th>{t('online.colPlaced')}</th>
                  <th>{t('online.colCustomer')}</th>
                  <th className="center">{t('online.colItems')}</th>
                  <th>{t('online.colFulfilment')}</th>
                  <th>{t('online.colPayment')}</th>
                  <th className="right">{t('online.colTotal')}</th>
                  <th>{t('online.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const st = statusMeta(t, o.status)
                  return (
                    <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(o.id)}>
                      <td className="mono">#{o.orderNumber}</td>
                      <td>{formatTime(o.createdAt, lang)}</td>
                      <td>
                        <div className="ord-cust">
                          <div className="av">{initials(o.customerName)}</div>
                          <div>
                            <div className="nm">{o.customerName ?? t('online.guest')}</div>
                            <div className="sub">{o.customerPhone ?? '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="center">{o.items?.length ?? 0}</td>
                      <td>
                        <span className="deliv">
                          {o.fulfillmentType === 'PICKUP' ? I.bag : I.truck}
                          {o.fulfillmentType === 'PICKUP'
                            ? t('online.pickup')
                            : t('online.delivery')}
                          {o.deliveryCity ? ` · ${o.deliveryCity}` : ''}
                        </span>
                      </td>
                      <td>
                        {o.paymentMethod ? (
                          <span className="pill-tag">{o.paymentMethod}</span>
                        ) : (
                          <span className="pill-tag">—</span>
                        )}
                      </td>
                      <td className="right num">{money.format(o.totalAmount)}</td>
                      <td>
                        <span className={`st ${st.cls}`}>
                          <span className="d" />
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!list.isPending && rows.length === 0 ? (
              <div className="cat-empty" style={{ padding: 28 }}>
                {t('online.noOrders')}
              </div>
            ) : null}
            <div className="panel-foot">
              <span>{t('online.ordersFoot').replace('{n}', String(rows.length))}</span>
            </div>
          </>
        )}
      </div>

      {openId ? <OrderDrawer id={openId} t={t} onClose={() => setOpenId(null)} /> : null}
    </div>
  )
}

// --- order drawer ----------------------------------------------------------
function OrderDrawer({
  id,
  t,
  onClose,
}: {
  id: string
  t: ReturnType<typeof useT>
  onClose: () => void
}) {
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const [serialTarget, setSerialTarget] = useState<OnlineOrderStatus | null>(null)

  const { data: order } = useQuery({
    queryKey: ['online', 'order', id],
    queryFn: () => dataClient.online.getOrder(id),
    enabled: true,
    retry: false,
  })

  // Which order items are serialized (checked against the synced local catalogue —
  // serial ids are the same locally and in the cloud).
  const orderProductIds = useMemo(
    () => [...new Set((order?.items ?? []).map((i) => i.productId))],
    [order],
  )
  const { data: serializedSet } = useQuery({
    queryKey: ['online', 'order-serialized', id, orderProductIds],
    enabled: orderProductIds.length > 0,
    queryFn: async () => {
      const flags = await Promise.all(
        orderProductIds.map(
          async (pid) =>
            [pid, (await dataClient.products.get(pid))?.isSerialized ?? false] as const,
        ),
      )
      return new Set(flags.filter(([, s]) => s).map(([pid]) => pid))
    },
  })
  const pendingSerialItems = useMemo(
    () => (order?.items ?? []).filter((it) => serializedSet?.has(it.productId) && !it.serialUnitId),
    [order, serializedSet],
  )

  const advance = useMutation({
    mutationFn: (input: {
      status: OnlineOrderStatus
      serialUnitSelections?: OrderSerialSelection[]
    }) => dataClient.online.updateOrderStatus(id, input),
    onSuccess: () => {
      setSerialTarget(null)
      void qc.invalidateQueries({ queryKey: ['online'] })
    },
    onError: (e) => setError(errorMessage(e, t('online.statusError'))),
  })

  // Confirm/complete transitions need serials chosen first (the API assigns + reserves them).
  const needsSerials = (target: OnlineOrderStatus | undefined) =>
    !!target &&
    (target === 'CONFIRMED' || ONLINE_ORDER_COMPLETION_STATUSES.includes(target)) &&
    pendingSerialItems.length > 0
  const go = (target: OnlineOrderStatus) => {
    setError(null)
    if (needsSerials(target)) setSerialTarget(target)
    else advance.mutate({ status: target })
  }

  const [payMethod, setPayMethod] = useState<OnlinePaymentMethod | ''>('')
  const pay = useMutation({
    mutationFn: () =>
      dataClient.online.updateOrderPayment(id, {
        paymentStatus: 'PAID',
        paymentMethod: payMethod || undefined,
      }),
    onSuccess: () => {
      setPayMethod('')
      void qc.invalidateQueries({ queryKey: ['online'] })
    },
    onError: (e) => setError(errorMessage(e, t('online.payError'))),
  })

  const o = order
  const paid = o?.paymentStatus === 'PAID'
  // Admin records payment once the order is real (confirmed) and not cancelled.
  const canRecordPayment = o ? o.status !== 'PENDING' && o.status !== 'CANCELLED' && !paid : false
  const cancelled = o ? isOffFlow(o.status) : false
  const flow = o ? flowFor(o.fulfillmentType) : []
  const stageIdx = o ? flow.indexOf(o.status) : -1
  const next = o ? primaryNext(o.fulfillmentType, o.status) : undefined
  const opts = o ? (ONLINE_ORDER_TRANSITIONS[o.fulfillmentType][o.status] ?? []) : []
  const canCancel = opts.includes('CANCELLED')
  const canReturn = opts.includes('RETURNED')
  const canFail = opts.includes('DELIVERY_FAILED')
  const subtotal = o?.items?.reduce((a, it) => a + it.unitPrice * it.quantity, 0) ?? 0
  const fees = o ? Math.max(0, o.totalAmount - subtotal) : 0
  const pickup = o?.fulfillmentType === 'PICKUP'

  return (
    <>
      <div className="drawer-ov open" onClick={onClose} />
      <aside className="drawer open">
        {!o ? (
          <div className="drawer-b">
            <p className="hint">{t('online.loading')}</p>
          </div>
        ) : (
          <>
            <div className="drawer-h">
              <div className="di">{I.bag}</div>
              <div className="ti">
                <h3>#{o.orderNumber}</h3>
                <p>
                  {formatDateTime(o.createdAt, lang)}
                  {o.paymentMethod ? ` · ${o.paymentMethod}` : ''}
                </p>
              </div>
              <button type="button" className="x" onClick={onClose}>
                {I.x}
              </button>
            </div>
            <div className="drawer-b">
              <div className="od-status">
                <span className={`st ${statusMeta(t, o.status).cls}`}>
                  <span className="d" />
                  {statusMeta(t, o.status).label}
                </span>
                <span className="chip-tag">
                  {pickup ? t('online.pickup') : t('online.delivery')}
                </span>
                {o.paymentMethod ? <span className="chip-tag">{o.paymentMethod}</span> : null}
              </div>

              <div className="od-block">
                <div className="bl">{t('online.customer')}</div>
                <div className="od-customer">
                  <div className="a">{initials(o.customerName)}</div>
                  <div>
                    <div className="nm">{o.customerName}</div>
                    <div className="s">{o.customerPhone ?? o.customerEmail ?? '—'}</div>
                  </div>
                </div>
              </div>

              <div className="od-block">
                <div className="bl">
                  {pickup ? t('online.collection') : t('online.deliveryAddress')}
                </div>
                <div className="od-addr">
                  {pickup ? t('online.collectInStore') : o.deliveryAddress || '—'}
                  {!pickup && o.deliveryCity ? <div className="mut">{o.deliveryCity}</div> : null}
                  {o.deliveryNotes ? <div className="mut">{o.deliveryNotes}</div> : null}
                </div>
              </div>

              <div className="od-block">
                <div className="bl">{t('online.fulfilment')}</div>
                <div className="ff">
                  {flow.map((s, i) => {
                    const cls = cancelled
                      ? 'future'
                      : i < stageIdx
                        ? 'done'
                        : i === stageIdx
                          ? 'now'
                          : 'future'
                    return (
                      <div key={s} className={`st-row ${cls}`}>
                        <div className="dot">{cls === 'done' ? I.check : null}</div>
                        <div className="tx">
                          <div className="t">{statusMeta(t, s).label}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {cancelled ? (
                  <p className="hint" style={{ marginTop: 8 }}>
                    {statusMeta(t, o.status).label}
                  </p>
                ) : null}
              </div>

              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  margin: '18px 0 6px',
                }}
              >
                {t('online.items')} · {o.items?.length ?? 0}
              </div>
              {(o.items ?? []).map((it, idx) => (
                <div key={idx} className="receipt-line">
                  <span className="q">{it.quantity}</span>
                  <div className="nm">
                    {it.productName}
                    {it.variantName ? ` · ${it.variantName}` : ''}
                    <div className="u">
                      {money.format(it.unitPrice)} {t('online.each')}
                    </div>
                  </div>
                  <span className="lt">{money.format(it.unitPrice * it.quantity)}</span>
                </div>
              ))}
              <div
                className="receipt-tot"
                style={{ marginTop: 12, borderRadius: 13, border: '1px solid var(--border)' }}
              >
                <div className="tr">
                  <span>{t('online.subtotal')}</span>
                  <span className="num">{money.format(subtotal)}</span>
                </div>
                {fees > 0 ? (
                  <div className="tr">
                    <span>{pickup ? t('online.pickup') : t('online.deliveryFee')}</span>
                    <span className="num">{money.format(fees)}</span>
                  </div>
                ) : null}
                <div className="tr g">
                  <span>{t('online.total')}</span>
                  <span>{money.format(o.totalAmount)}</span>
                </div>
              </div>

              <div className="od-block" style={{ marginTop: 14 }}>
                <div className="bl">{t('online.payment')}</div>
                <div className="od-status" style={{ marginTop: 6 }}>
                  <span className={`st ${paid ? 'st-ok' : 'st-low'}`}>
                    <span className="d" />
                    {paymentLabel(t, o.paymentStatus)}
                  </span>
                  {o.paymentMethod ? <span className="chip-tag">{o.paymentMethod}</span> : null}
                </div>
                {canRecordPayment ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <select
                      className="select"
                      style={{ height: 36, flex: 1 }}
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value as OnlinePaymentMethod | '')}
                    >
                      <option value="">{t('online.selectMethod')}</option>
                      {ONLINE_PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {t(`online.method.${m}`)}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="primary"
                      type="button"
                      disabled={!payMethod}
                      loading={pay.isPending}
                      onClick={() => {
                        setError(null)
                        pay.mutate()
                      }}
                    >
                      {t('online.markPaid')}
                    </Button>
                  </div>
                ) : null}
              </div>
              {error ? (
                <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="drawer-f">
              <Button variant="soft" type="button">
                {I.print}
                {t('online.packingSlip')}
              </Button>
              {cancelled ? (
                <Button variant="soft" type="button" className="grow" disabled style={{ flex: 1 }}>
                  {statusMeta(t, o.status).label}
                </Button>
              ) : (
                <>
                  {next ? (
                    <Button
                      variant="primary"
                      type="button"
                      style={{ flex: 1 }}
                      loading={advance.isPending}
                      onClick={() => go(next)}
                    >
                      {next === 'DELIVERED' || next === 'PICKED_UP' ? I.check : I.truck}
                      {advanceLabel(t, o.status)}
                    </Button>
                  ) : null}
                  {canFail ? (
                    <Button variant="soft" type="button" onClick={() => go('DELIVERY_FAILED')}>
                      {t('online.markFailed')}
                    </Button>
                  ) : null}
                  {canReturn ? (
                    <Button variant="soft" type="button" onClick={() => go('RETURNED')}>
                      {t('online.markReturned')}
                    </Button>
                  ) : null}
                  {canCancel ? (
                    <Button variant="soft" type="button" onClick={() => go('CANCELLED')}>
                      {I.x}
                      {t('online.cancelOrder')}
                    </Button>
                  ) : null}
                  {!next && !canFail && !canReturn && !canCancel ? (
                    <Button variant="soft" type="button" disabled style={{ flex: 1 }}>
                      {I.check}
                      {t('online.fulfilled')}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </>
        )}
      </aside>
      {serialTarget ? (
        <ConfirmSerialsModal
          items={pendingSerialItems}
          busy={advance.isPending}
          onClose={() => setSerialTarget(null)}
          onConfirm={(serialUnitSelections) =>
            advance.mutate({ status: serialTarget, serialUnitSelections })
          }
        />
      ) : null}
    </>
  )
}

// --- confirm-time serial picker (one section per serialized item) ----------
function ConfirmSerialsModal({
  items,
  busy,
  onClose,
  onConfirm,
}: {
  items: OnlineCartItem[]
  busy: boolean
  onClose: () => void
  onConfirm: (selections: OrderSerialSelection[]) => void
}) {
  const t = useT()
  const [picks, setPicks] = useState<Record<number, string[]>>({})
  const allDone = items.every((it, i) => (picks[i]?.length ?? 0) === it.quantity)

  const submit = () => {
    const byKey = new Map<string, OrderSerialSelection>()
    items.forEach((it, i) => {
      const key = `${it.productId}:${it.variantId ?? ''}`
      const sel = byKey.get(key) ?? {
        productId: it.productId,
        variantId: it.variantId ?? null,
        serialUnitIds: [],
      }
      sel.serialUnitIds.push(...(picks[i] ?? []))
      byKey.set(key, sel)
    })
    onConfirm([...byKey.values()])
  }

  return (
    <div
      className="pay-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="pay-modal" style={{ width: 480 }}>
        <div className="pm-head">
          <h3>{t('online.selectSerials')}</h3>
          <button type="button" className="x" onClick={onClose}>
            {I.x}
          </button>
        </div>
        <div className="pm-body" style={{ paddingTop: 12 }}>
          <p className="hint" style={{ marginBottom: 10 }}>
            {t('online.serialsHint')}
          </p>
          {items.map((it, i) => (
            <ItemSerialSection
              key={i}
              item={it}
              selected={picks[i] ?? []}
              onChange={(ids) => setPicks((p) => ({ ...p, [i]: ids }))}
            />
          ))}
          <button
            type="button"
            className="pm-confirm"
            style={{ marginTop: 6 }}
            disabled={!allDone || busy}
            onClick={submit}
          >
            {t('online.confirmWithSerials')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ItemSerialSection({
  item,
  selected,
  onChange,
}: {
  item: OnlineCartItem
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const t = useT()
  const [q, setQ] = useState('')
  const { data: serials = [], isPending } = useQuery<LocalSerialUnit[]>({
    queryKey: ['online', 'item-serials', item.productId, item.variantId ?? '', q],
    queryFn: () =>
      dataClient.products.listInStockSerials(item.productId, item.variantId ?? null, q),
  })
  const picked = new Set(selected)
  const toggle = (uid: string) => {
    const n = new Set(picked)
    if (n.has(uid)) n.delete(uid)
    else if (n.size < item.quantity) n.add(uid)
    onChange([...n])
  }
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="pm-lbl">
        {item.productName}
        {item.variantName ? ` · ${item.variantName}` : ''} —{' '}
        {t('online.pickN').replace('{n}', String(item.quantity))} ({selected.length}/{item.quantity}
        )
      </div>
      <div className="field" style={{ margin: '8px 0' }}>
        {I.search}
        <input
          className="input ic"
          placeholder={t('sell.searchSerials')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {isPending ? (
        <div className="cat-empty">…</div>
      ) : serials.length === 0 ? (
        <div className="cat-empty">{t('sell.noSerials')}</div>
      ) : null}
      <div className="cust-list" style={{ maxHeight: 200, overflowY: 'auto' }}>
        {serials.map((u) => (
          <button
            key={u.id}
            type="button"
            className={picked.has(u.id) ? 'sel' : ''}
            onClick={() => toggle(u.id)}
          >
            <span className={`ctree-cb${picked.has(u.id) ? ' on' : ''}`} aria-hidden>
              {picked.has(u.id) ? I.check : null}
            </span>
            <div className="t">
              <div className="nm">{u.serialNumber}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function formatTime(iso: string | undefined, locale: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}
function formatDateTime(iso: string | undefined, locale: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}
