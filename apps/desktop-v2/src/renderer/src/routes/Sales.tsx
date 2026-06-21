import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dataClient, isElectron } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
import { ReceiptSendDialog } from '@/components/receipt/ReceiptSendDialog'
import type { LocalSale, SalesListQuery } from '@shared/ipc'

const PAGE = 10

type Period = 'today' | 'week' | 'month'

const I = {
  export: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>,
  search: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="9" cy="9" r="6" /><path d="m14 14 3 3" /></svg>,
  print: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v7H8z" /></svg>,
  send: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4h16v12H7l-3 3z" /></svg>,
}

// Payment methods shown in the filter. 'CREDIT' is a synthetic filter (no method stored).
const PAY_FILTERS = ['CASH', 'MTN_MOMO', 'ORANGE_MONEY', 'CARD', 'SAVINGS', 'CREDIT'] as const

function ymd(d: Date): string { return d.toLocaleDateString('en-CA') } // local YYYY-MM-DD
function rangeFor(period: Period): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const to = ymd(now)
  if (period === 'today') return { dateFrom: to, dateTo: to }
  const from = new Date(now)
  from.setDate(now.getDate() - (period === 'week' ? 6 : 29))
  return { dateFrom: ymd(from), dateTo: to }
}

export function Sales() {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)

  const [period, setPeriod] = useState<Period>('today')
  const [payment, setPayment] = useState<string>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const range = useMemo(() => rangeFor(period), [period])
  const filters = useMemo<SalesListQuery>(
    () => ({ ...range, paymentMethod: payment || undefined, search: search.trim() || undefined }),
    [range, payment, search],
  )

  // Reset to page 1 whenever the filters change.
  useEffect(() => { setPage(1) }, [period, payment, search])

  const summary = useQuery({
    queryKey: ['sales', 'summary', range, payment, search],
    queryFn: () => dataClient.sales.summary(filters),
    enabled: isElectron,
  })
  const list = useQuery({
    queryKey: ['sales', 'list', range, payment, search, page],
    queryFn: () => dataClient.sales.list({ ...filters, page, limit: PAGE }),
    enabled: isElectron,
  })
  const rows = list.data?.data ?? []
  const meta = list.data

  // Auto-select the first row when the selection isn't in the current page.
  useEffect(() => {
    if (rows.length === 0) { setSelectedId(null); return }
    if (!selectedId || !rows.some((r) => r.id === selectedId)) setSelectedId(rows[0]!.id)
  }, [rows, selectedId])

  const exportCsv = async () => {
    const all = await dataClient.sales.listAll(filters)
    if (all.length === 0) return
    const header = ['Sale #', 'Date', 'Customer', 'Payment', 'Subtotal', 'Discount', 'Charges', 'Total', 'Paid', 'Credit', 'Status']
    const lines = all.map((r) => [
      r.saleNumber, r.soldAt, r.customerName ?? 'Walk-in', r.paymentMethod ?? (r.creditAmount > 0 ? 'CREDIT' : ''),
      r.subtotal, r.discountAmount, r.chargesAmount, r.totalAmount, r.amountPaid, r.creditAmount, r.status,
    ])
    const csv = [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales-${period}-${range.dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('sales.title')}</h1>
          <p>{t('sales.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="seg2">
            {(['today', 'week', 'month'] as Period[]).map((p) => (
              <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>{t(`sales.${p}` as Parameters<typeof t>[0])}</button>
            ))}
          </span>
          <button type="button" className="btn" onClick={() => void exportCsv()}>{I.export}{t('sales.export')}</button>
        </div>
      </div>

      <div className="minihead">
        <div className="m"><div className="k">{t('sales.kpiRevenue').replace('{period}', t(`sales.${period}` as Parameters<typeof t>[0]).toLowerCase())}</div><div className="v">{money.format(summary.data?.revenue ?? 0)}</div><div className="h">{t('sales.txns').replace('{n}', String(summary.data?.transactions ?? 0))}</div></div>
        <div className="m"><div className="k">{t('sales.kpiBasket')}</div><div className="v">{money.format(summary.data?.averageBasket ?? 0)}</div><div className="h">{t('sales.acrossSales').replace('{n}', String(summary.data?.transactions ?? 0))}</div></div>
        <div className="m"><div className="k">{t('sales.kpiItems')}</div><div className="v">{t('sales.units').replace('{n}', String(summary.data?.itemsSold ?? 0))}</div><div className="h">{t('sales.acrossSales').replace('{n}', String(summary.data?.transactions ?? 0))}</div></div>
        <div className="m"><div className="k">{t('sales.kpiRefunds')}</div><div className="v">{summary.data?.refundCount ?? 0} · {money.format(summary.data?.refundAmount ?? 0)}</div><div className="h">&nbsp;</div></div>
      </div>

      <div className="salelayout">
        {/* transactions */}
        <div className="panel">
          <div className="panel-head">
            <h3>{t('sales.transactions')}</h3>
            <div style={{ flex: 1 }} />
            <div className="select-wrap" style={{ width: 180 }}>
              <select className="select" style={{ height: 36 }} value={payment} onChange={(e) => setPayment(e.target.value)}>
                <option value="">{t('sales.allPayments')}</option>
                {PAY_FILTERS.map((m) => <option key={m} value={m}>{payLabel(t, m, 0, null)}</option>)}
              </select>
            </div>
            <div className="field" style={{ width: 200 }}>
              {I.search}
              <input className="input ic" style={{ height: 36 }} placeholder={t('sales.searchPh')} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          <div className="saletable-wrap">
            <table className="saletable">
              <thead>
                <tr>
                  <th>{t('sales.colSale')}</th>
                  <th className="hide-sm">{t('sales.colTime')}</th>
                  <th>{t('sales.colCustomer')}</th>
                  <th className="hide-sm">{t('sales.colPayment')}</th>
                  <th className="right">{t('sales.colTotal')}</th>
                  <th>{t('sales.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const st = statusInfo(t, s)
                  return (
                    <tr key={s.id} className={s.id === selectedId ? 'sel' : ''} onClick={() => setSelectedId(s.id)}>
                      <td className="mono">{s.saleNumber}</td>
                      <td className="hide-sm">{formatTime(s.soldAt, lang)}</td>
                      <td>{s.customerName ?? t('sales.walkIn')}</td>
                      <td className="hide-sm"><span className="pill-tag">{payLabel(t, s.paymentMethod, s.creditAmount, s)}</span></td>
                      <td className="right num">{money.format(s.totalAmount)}</td>
                      <td><span className={`st ${st.cls}`}><span className="d" />{st.label}</span></td>
                    </tr>
                  )
                })}
                {!list.isPending && rows.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 12px' }}>{t('sales.empty')}</td></tr>
                ) : null}
                {list.isPending && rows.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 12px' }}>{t('sales.loading')}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="panel-foot">
            <span>{t('sales.count').replace('{n}', String(meta?.total ?? 0)).replace('{amt}', money.format(summary.data?.revenue ?? 0))}</span>
            <div className="spacer" />
            <span
              className="link"
              aria-disabled={page <= 1}
              onClick={() => { if (page > 1) setPage((p) => p - 1) }}
            >{t('sales.prev')}</span>
            <span>{t('sales.page').replace('{p}', String(meta?.page ?? 1)).replace('{t}', String(meta?.totalPages ?? 1))}</span>
            <span
              className="link"
              aria-disabled={(meta?.page ?? 1) >= (meta?.totalPages ?? 1)}
              onClick={() => { if ((meta?.page ?? 1) < (meta?.totalPages ?? 1)) setPage((p) => p + 1) }}
            >{t('sales.next')}</span>
          </div>
        </div>

        {/* receipt detail */}
        <div className="detail">
          {selectedId ? <ReceiptDetail saleId={selectedId} /> : <div className="receipt-empty">{t('sales.selectHint')}</div>}
        </div>
      </div>
    </div>
  )
}

// --- receipt detail pane ---------------------------------------------------
function ReceiptDetail({ saleId }: { saleId: string }) {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const [printing, setPrinting] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [sendOpen, setSendOpen] = useState(false)

  const { data: sale } = useQuery({
    queryKey: ['sales', 'detail', saleId],
    queryFn: () => dataClient.sales.get(saleId),
    enabled: isElectron,
  })
  // The sale row doesn't carry the customer's selfie — look it up for the avatar.
  const { data: customer } = useQuery({
    queryKey: ['contact-selfie', sale?.customerId],
    queryFn: () => dataClient.contacts.get(sale!.customerId!),
    enabled: isElectron && !!sale?.customerId,
  })
  if (!sale) return <div className="receipt-empty">{t('sales.loading')}</div>

  const st = statusInfo(t, sale)
  const flash = (msg: string) => { setNote(msg); window.setTimeout(() => setNote(null), 2400) }
  const print = async () => {
    setPrinting(true)
    try {
      const r = await dataClient.sales.printReceipt(sale.id, lang)
      flash(r.printed ? t('sales.printed') : t('sales.printSaved'))
    } catch {
      flash(t('sales.printFailed'))
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="receipt">
      <div className="receipt-h">
        <div className="rid">{t('sales.receipt')} · {sale.saleNumber}</div>
        <div className="ramt">{money.format(sale.totalAmount)}</div>
        <div className="rmeta">
          <span className={`st ${st.cls}`}><span className="d" />{st.label}</span>
          <span className="chip-tag">{payLabel(t, sale.paymentMethod, sale.creditAmount, sale)}</span>
          <span className="chip-tag">{formatDateTime(sale.soldAt, lang)}</span>
        </div>
      </div>
      <div className="receipt-b">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div className="avatar av-brand" style={{ width: 34, height: 34, fontSize: 12 }}>{customer?.selfieUrl ? <img src={customer.selfieUrl} alt="" /> : initials(sale.customerName ?? t('sales.walkIn'))}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{sale.customerName ?? t('sales.walkIn')}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{sale.customerPhone ?? '—'}</div>
          </div>
        </div>
        {sale.items.map((it) => (
          <div key={it.id} className="receipt-line">
            <span className="q">{it.quantity}</span>
            <div className="nm">{it.productName}{it.variantName ? ` · ${it.variantName}` : ''}{it.serialNumber ? ` · ${it.serialNumber}` : ''}<div className="u">{money.format(it.unitPrice)} {t('sales.each') as string}</div></div>
            <span className="lt">{money.format(it.lineTotal)}</span>
          </div>
        ))}
      </div>
      <div className="receipt-tot">
        <div className="tr"><span>{t('sales.subtotal')}</span><span className="num">{money.format(sale.subtotal)}</span></div>
        {sale.discountAmount > 0 ? <div className="tr"><span>{t('sales.discount')}</span><span className="num">− {money.format(sale.discountAmount)}</span></div> : null}
        {sale.chargesAmount > 0 ? <div className="tr"><span>{t('sales.charges')}</span><span className="num">+ {money.format(sale.chargesAmount)}</span></div> : null}
        {sale.creditAmount > 0 ? <div className="tr"><span>{t('sales.credit')}</span><span className="num">{money.format(sale.creditAmount)}</span></div> : null}
        {sale.changeGiven > 0 ? <div className="tr"><span>{t('sales.change')}</span><span className="num">{money.format(sale.changeGiven)}</span></div> : null}
        <div className="tr g"><span>{sale.creditAmount > 0 ? t('sales.totalDue') : t('sales.totalPaid')}</span><span>{money.format(sale.creditAmount > 0 ? sale.totalAmount : sale.amountPaid)}</span></div>
      </div>
      {note ? <div className="hint" style={{ textAlign: 'center', padding: '8px 18px 0' }}>{note}</div> : null}
      <div className="receipt-act">
        <button type="button" disabled={printing} onClick={() => void print()}>{I.print}{printing ? '…' : t('sales.print')}</button>
        <button type="button" className="primary" onClick={() => setSendOpen(true)}>{I.send}{t('sales.sendReceipt')}</button>
      </div>
      {sendOpen ? <ReceiptSendDialog sale={sale} customerName={sale.customerName ?? t('sales.walkIn')} locale={lang} onClose={() => setSendOpen(false)} /> : null}
    </div>
  )
}

// --- helpers ---------------------------------------------------------------
function statusInfo(t: ReturnType<typeof useT>, s: LocalSale): { cls: string; label: string } {
  if (s.status === 'VOIDED') return { cls: 'st-out', label: t('sales.refunded') }
  if (s.creditAmount > 0) return { cls: 'st-low', label: s.amountPaid > 0 ? t('sales.partial') : t('sales.onCredit') }
  return { cls: 'st-ok', label: t('sales.paid') }
}

function payLabel(t: ReturnType<typeof useT>, method: string | null, _creditAmount: number, _sale: LocalSale | null): string {
  if (!method) return t('sell.credit')
  switch (method) {
    case 'CASH': return t('sell.cash')
    case 'MTN_MOMO': return t('sell.momo')
    case 'ORANGE_MONEY': return t('sell.om')
    case 'CARD': return t('sell.card')
    case 'SAVINGS': return t('sell.deposit')
    case 'MIXED': return t('sell.split')
    case 'CREDIT': return t('sell.credit')
    default: return method
  }
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '—'
  return ((p[0]![0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase()
}
function formatTime(iso: string, locale: string): string {
  try { return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) } catch { return iso }
}
function formatDateTime(iso: string, locale: string): string {
  try { return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) } catch { return iso }
}
function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
