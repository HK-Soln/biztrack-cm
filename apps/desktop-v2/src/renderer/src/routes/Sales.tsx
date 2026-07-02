import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
import { SaleDetailDrawer } from '@/components/sales/SaleDetailDrawer'
import { formatSaleTime, salePayLabel, saleStatusInfo } from '@/components/sales/sale-format'
import type { SalesListQuery } from '@shared/ipc'

const PAGE = 12

type Period = 'today' | 'week' | 'month'

const I = {
  export: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>,
  search: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="9" cy="9" r="6" /><path d="m14 14 3 3" /></svg>,
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

  const [period, setPeriod] = useState<Period>('week')
  const [payment, setPayment] = useState<string>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)

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
    enabled: true,
  })
  const list = useQuery({
    queryKey: ['sales', 'list', range, payment, search, page],
    queryFn: () => dataClient.sales.list({ ...filters, page, limit: PAGE }),
    enabled: true,
  })
  const rows = list.data?.data ?? []
  const meta = list.data

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

      {/* Full-width transactions table; a row opens the detail drawer. */}
      <div className="panel">
        <div className="panel-head">
          <h3>{t('sales.transactions')}</h3>
          <div style={{ flex: 1 }} />
          <div className="select-wrap" style={{ width: 180 }}>
            <select className="select" style={{ height: 36 }} value={payment} onChange={(e) => setPayment(e.target.value)}>
              <option value="">{t('sales.allPayments')}</option>
              {PAY_FILTERS.map((m) => <option key={m} value={m}>{salePayLabel(t, m)}</option>)}
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
                <th>{t('sales.colTime')}</th>
                <th>{t('sales.colCustomer')}</th>
                <th>{t('sales.colPayment')}</th>
                <th className="right">{t('sales.colTotal')}</th>
                <th>{t('sales.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const st = saleStatusInfo(t, s)
                return (
                  <tr key={s.id} className={s.id === openId ? 'sel' : ''} onClick={() => setOpenId(s.id)} style={{ cursor: 'pointer' }}>
                    <td className="mono">{s.saleNumber}</td>
                    <td>{formatSaleTime(s.soldAt, lang)}</td>
                    <td>{s.customerName ?? t('sales.walkIn')}</td>
                    <td><span className="pill-tag">{salePayLabel(t, s.paymentMethod)}</span></td>
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

      <SaleDetailDrawer saleId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
