import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
import { errorMessage } from '@/lib/error'
import { OnlineError, OnlineUpsell, isPlanUpgrade } from '@/components/online/OnlineStates'
import type { OnlineOrderStatus } from '@shared/ipc'

const I = {
  truck: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" /><circle cx="7" cy="17" r="1.6" /><circle cx="17" cy="17" r="1.6" /></svg>,
  bag: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 9h16l-1-5H5L4 9Z" /><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" /></svg>,
  x: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m6 6 12 12M18 6 6 18" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="m5 12 4 4L19 6" /></svg>,
  print: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v7H8z" /></svg>,
}

// The fulfilment progression (cancelled/refunded are terminal off-flow states).
const FLOW: OnlineOrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'DISPATCHED', 'DELIVERED']
const NEXT: Partial<Record<OnlineOrderStatus, OnlineOrderStatus>> = {
  PENDING: 'CONFIRMED', CONFIRMED: 'PREPARING', PREPARING: 'DISPATCHED', DISPATCHED: 'DELIVERED',
}

function statusMeta(t: ReturnType<typeof useT>, s: OnlineOrderStatus): { label: string; cls: string } {
  switch (s) {
    case 'PENDING': return { label: t('online.stNew'), cls: 'st-brand' }
    case 'CONFIRMED': return { label: t('online.stConfirmed'), cls: 'st-low' }
    case 'PREPARING': return { label: t('online.stPreparing'), cls: 'st-low' }
    case 'DISPATCHED': return { label: t('online.stShipped'), cls: 'st-neutral' }
    case 'DELIVERED': return { label: t('online.stDelivered'), cls: 'st-ok' }
    case 'CANCELLED': return { label: t('online.stCancelled'), cls: 'st-out' }
    case 'REFUNDED': return { label: t('online.stRefunded'), cls: 'st-out' }
    default: return { label: s, cls: 'st-neutral' }
  }
}
function advanceLabel(t: ReturnType<typeof useT>, s: OnlineOrderStatus): string {
  switch (s) {
    case 'PENDING': return t('online.advance.PENDING')
    case 'CONFIRMED': return t('online.advance.CONFIRMED')
    case 'PREPARING': return t('online.advance.PREPARING')
    case 'DISPATCHED': return t('online.advance.DISPATCHED')
    default: return ''
  }
}
function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '—'
}

export function OnlineOrders() {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const [status, setStatus] = useState<OnlineOrderStatus | ''>('')
  const [fulfil, setFulfil] = useState<'' | 'DELIVERY' | 'PICKUP'>('')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['online', 'orders', status],
    queryFn: () => dataClient.online.listOrders({ status: status || undefined, limit: 100 }),
    enabled: isElectron,
    retry: false,
  })

  const all = list.data?.data ?? []
  // KPIs from the loaded page (no summary endpoint yet). Computed before any early return
  // so hook order stays stable across the upsell/error branches.
  const kpis = useMemo(() => {
    const newCount = all.filter((o) => o.status === 'PENDING').length
    const toShip = all.filter((o) => o.status === 'CONFIRMED' || o.status === 'PREPARING').length
    const delivered = all.filter((o) => o.status === 'DELIVERED')
    const sales = all.filter((o) => o.status !== 'CANCELLED' && o.status !== 'REFUNDED').reduce((a, o) => a + o.totalAmount, 0)
    return { newCount, toShip, delivered: delivered.length, sales, total: all.length }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data])

  if (list.error && isPlanUpgrade(list.error)) return <OnlineUpsell />

  const rows = all.filter((o) => {
    if (fulfil && o.fulfillmentType !== fulfil) return false
    const q = search.trim().toLowerCase()
    if (q && !(o.orderNumber.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q))) return false
    return true
  })

  return (
    <div className="frame">
      <div className="page-head">
        <div><h1>{t('online.ordersTitle')}</h1><p>{t('online.ordersSubtitle')}</p></div>
      </div>

      <div className="minihead">
        <div className="m"><div className="k">{t('online.kpiSales')}</div><div className="v">{money.format(kpis.sales)}</div><div className="h">{t('online.kpiOrders').replace('{n}', String(kpis.total))}</div></div>
        <div className="m"><div className="k">{t('online.kpiNew')}</div><div className="v" style={{ color: 'var(--brand)' }}>{kpis.newCount}</div><div className="h">{t('online.kpiAwaiting')}</div></div>
        <div className="m"><div className="k">{t('online.kpiToShip')}</div><div className="v" style={{ color: 'var(--warning)' }}>{kpis.toShip}</div><div className="h">{t('online.kpiToShipHint')}</div></div>
        <div className="m"><div className="k">{t('online.kpiFulfilled')}</div><div className="v">{kpis.delivered}</div><div className="h">{t('online.kpiFulfilledHint')}</div></div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{t('online.orders')}</h3><div className="spacer" style={{ flex: 1 }} />
          <select className="select" style={{ height: 36 }} value={status} onChange={(e) => setStatus(e.target.value as OnlineOrderStatus | '')}>
            <option value="">{t('online.allStatuses')}</option>
            {FLOW.map((s) => <option key={s} value={s}>{statusMeta(t, s).label}</option>)}
            <option value="CANCELLED">{statusMeta(t, 'CANCELLED').label}</option>
          </select>
          <select className="select" style={{ height: 36 }} value={fulfil} onChange={(e) => setFulfil(e.target.value as '' | 'DELIVERY' | 'PICKUP')}>
            <option value="">{t('online.allFulfilment')}</option>
            <option value="DELIVERY">{t('online.delivery')}</option>
            <option value="PICKUP">{t('online.pickup')}</option>
          </select>
          <div className="field" style={{ width: 210 }}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="9" cy="9" r="6" /><path d="m14 14 3 3" /></svg>
            <input className="input ic" style={{ height: 36 }} placeholder={t('online.searchOrders')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {list.error ? (
          <OnlineError error={list.error} onRetry={() => list.refetch()} />
        ) : (
          <>
            <table>
              <thead><tr>
                <th>{t('online.colOrder')}</th><th>{t('online.colPlaced')}</th><th>{t('online.colCustomer')}</th>
                <th className="center">{t('online.colItems')}</th><th>{t('online.colFulfilment')}</th><th>{t('online.colPayment')}</th>
                <th className="right">{t('online.colTotal')}</th><th>{t('online.colStatus')}</th>
              </tr></thead>
              <tbody>
                {rows.map((o) => {
                  const st = statusMeta(t, o.status)
                  return (
                    <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(o.id)}>
                      <td className="mono">#{o.orderNumber}</td>
                      <td>{formatTime(o.createdAt, lang)}</td>
                      <td><div className="ord-cust"><div className="av">{initials(o.customerName)}</div><div><div className="nm">{o.customerName}</div><div className="sub">{o.customerPhone ?? '—'}</div></div></div></td>
                      <td className="center">{o.items?.length ?? 0}</td>
                      <td><span className="deliv">{o.fulfillmentType === 'PICKUP' ? I.bag : I.truck}{o.fulfillmentType === 'PICKUP' ? t('online.pickup') : t('online.delivery')}{o.deliveryCity ? ` · ${o.deliveryCity}` : ''}</span></td>
                      <td>{o.paymentMethod ? <span className="pill-tag">{o.paymentMethod}</span> : <span className="pill-tag">—</span>}</td>
                      <td className="right num">{money.format(o.totalAmount)}</td>
                      <td><span className={`st ${st.cls}`}><span className="d" />{st.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!list.isPending && rows.length === 0 ? <div className="cat-empty" style={{ padding: 28 }}>{t('online.noOrders')}</div> : null}
            <div className="panel-foot"><span>{t('online.ordersFoot').replace('{n}', String(rows.length))}</span></div>
          </>
        )}
      </div>

      {openId ? <OrderDrawer id={openId} t={t} onClose={() => setOpenId(null)} /> : null}
    </div>
  )
}

// --- order drawer ----------------------------------------------------------
function OrderDrawer({ id, t, onClose }: { id: string; t: ReturnType<typeof useT>; onClose: () => void }) {
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const { data: order } = useQuery({ queryKey: ['online', 'order', id], queryFn: () => dataClient.online.getOrder(id), enabled: isElectron, retry: false })

  const advance = useMutation({
    mutationFn: (next: OnlineOrderStatus) => dataClient.online.updateOrderStatus(id, { status: next }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['online'] }) },
    onError: (e) => setError(errorMessage(e, t('online.statusError'))),
  })

  const o = order
  const cancelled = o ? (o.status === 'CANCELLED' || o.status === 'REFUNDED') : false
  const stageIdx = o ? FLOW.indexOf(o.status) : -1
  const next = o ? NEXT[o.status] : undefined
  const subtotal = o?.items?.reduce((a, it) => a + it.unitPrice * it.quantity, 0) ?? 0
  const fees = o ? Math.max(0, o.totalAmount - subtotal) : 0
  const pickup = o?.fulfillmentType === 'PICKUP'

  return (
    <>
      <div className="drawer-ov open" onClick={onClose} />
      <aside className="drawer open">
        {!o ? <div className="drawer-b"><p className="hint">{t('online.loading')}</p></div> : (
          <>
            <div className="drawer-h">
              <div className="di">{I.bag}</div>
              <div className="ti"><h3>#{o.orderNumber}</h3><p>{formatDateTime(o.createdAt, lang)}{o.paymentMethod ? ` · ${o.paymentMethod}` : ''}</p></div>
              <button type="button" className="x" onClick={onClose}>{I.x}</button>
            </div>
            <div className="drawer-b">
              <div className="od-status">
                <span className={`st ${statusMeta(t, o.status).cls}`}><span className="d" />{statusMeta(t, o.status).label}</span>
                <span className="chip-tag">{pickup ? t('online.pickup') : t('online.delivery')}</span>
                {o.paymentMethod ? <span className="chip-tag">{o.paymentMethod}</span> : null}
              </div>

              <div className="od-block">
                <div className="bl">{t('online.customer')}</div>
                <div className="od-customer"><div className="a">{initials(o.customerName)}</div><div><div className="nm">{o.customerName}</div><div className="s">{o.customerPhone ?? o.customerEmail ?? '—'}</div></div></div>
              </div>

              <div className="od-block">
                <div className="bl">{pickup ? t('online.collection') : t('online.deliveryAddress')}</div>
                <div className="od-addr">
                  {pickup ? t('online.collectInStore') : (o.deliveryAddress || '—')}
                  {!pickup && o.deliveryCity ? <div className="mut">{o.deliveryCity}</div> : null}
                  {o.deliveryNotes ? <div className="mut">{o.deliveryNotes}</div> : null}
                </div>
              </div>

              <div className="od-block">
                <div className="bl">{t('online.fulfilment')}</div>
                <div className="ff">
                  {FLOW.map((s, i) => {
                    const cls = cancelled ? 'future' : i < stageIdx ? 'done' : i === stageIdx ? 'now' : 'future'
                    return (
                      <div key={s} className={`st-row ${cls}`}>
                        <div className="dot">{cls === 'done' ? I.check : null}</div>
                        <div className="tx"><div className="t">{statusMeta(t, s).label}</div></div>
                      </div>
                    )
                  })}
                </div>
                {cancelled ? <p className="hint" style={{ marginTop: 8 }}>{statusMeta(t, o.status).label}</p> : null}
              </div>

              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '18px 0 6px' }}>{t('online.items')} · {o.items?.length ?? 0}</div>
              {(o.items ?? []).map((it, idx) => (
                <div key={idx} className="receipt-line">
                  <span className="q">{it.quantity}</span>
                  <div className="nm">{it.productName}{it.variantName ? ` · ${it.variantName}` : ''}<div className="u">{money.format(it.unitPrice)} {t('online.each')}</div></div>
                  <span className="lt">{money.format(it.unitPrice * it.quantity)}</span>
                </div>
              ))}
              <div className="receipt-tot" style={{ marginTop: 12, borderRadius: 13, border: '1px solid var(--border)' }}>
                <div className="tr"><span>{t('online.subtotal')}</span><span className="num">{money.format(subtotal)}</span></div>
                {fees > 0 ? <div className="tr"><span>{pickup ? t('online.pickup') : t('online.deliveryFee')}</span><span className="num">{money.format(fees)}</span></div> : null}
                <div className="tr g"><span>{t('online.total')}</span><span>{money.format(o.totalAmount)}</span></div>
              </div>
              {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{error}</p> : null}
            </div>
            <div className="drawer-f">
              <Button variant="soft" type="button">{I.print}{t('online.packingSlip')}</Button>
              {cancelled ? (
                <Button variant="soft" type="button" className="grow" disabled style={{ flex: 1 }}>{statusMeta(t, o.status).label}</Button>
              ) : next ? (
                <Button variant="primary" type="button" style={{ flex: 1 }} loading={advance.isPending} onClick={() => { setError(null); advance.mutate(next) }}>{o.status === 'DISPATCHED' ? I.check : I.truck}{advanceLabel(t, o.status)}</Button>
              ) : (
                <Button variant="soft" type="button" disabled style={{ flex: 1 }}>{I.check}{t('online.fulfilled')}</Button>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  )
}

function formatTime(iso: string | undefined, locale: string): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) } catch { return iso }
}
function formatDateTime(iso: string | undefined, locale: string): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) } catch { return iso }
}
