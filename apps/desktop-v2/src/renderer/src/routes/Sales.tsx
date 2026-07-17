import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { SaleDetailDrawer } from '@/components/sales/SaleDetailDrawer'
import { SaleReceiptView } from '@/components/sales/SaleReceiptView'
import { MobileSheet } from '@/components/MobileSheet'
import {
  formatSaleTime,
  saleInitials,
  salePayLabel,
  saleStatusInfo,
} from '@/components/sales/sale-format'
import type { SalesListQuery } from '@shared/ipc'

const PAGE = 12

type Period = 'today' | 'week' | 'month'

const I = {
  export: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="9" cy="9" r="6" />
      <path d="m14 14 3 3" />
    </svg>
  ),
}

// Payment methods shown in the filter. 'CREDIT' is a synthetic filter (no method stored).
const PAY_FILTERS = ['CASH', 'MTN_MOMO', 'ORANGE_MONEY', 'CARD', 'SAVINGS', 'CREDIT'] as const

function ymd(d: Date): string {
  return d.toLocaleDateString('en-CA')
} // local YYYY-MM-DD
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
  const bp = useBreakpoint()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const navigate = useNavigate()

  const [period, setPeriod] = useState<Period>('week')
  const [payment, setPayment] = useState<string>('')
  const [channel, setChannel] = useState<string>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)

  const range = useMemo(() => rangeFor(period), [period])
  const filters = useMemo<SalesListQuery>(
    () => ({
      ...range,
      paymentMethod: payment || undefined,
      source: channel || undefined,
      search: search.trim() || undefined,
    }),
    [range, payment, channel, search],
  )

  // Reset to page 1 (and drop the tablet selection) whenever the filters change.
  useEffect(() => {
    setPage(1)
    setOpenId(null)
  }, [period, payment, channel, search])

  const summary = useQuery({
    queryKey: ['sales', 'summary', range, payment, channel, search],
    queryFn: () => dataClient.sales.summary(filters),
    enabled: true,
  })
  const list = useQuery({
    queryKey: ['sales', 'list', range, payment, channel, search, page],
    queryFn: () => dataClient.sales.list({ ...filters, page, limit: PAGE }),
    enabled: true,
  })
  const rows = list.data?.data ?? []
  const meta = list.data

  const exportCsv = async () => {
    const all = await dataClient.sales.listAll(filters)
    if (all.length === 0) return
    const header = [
      'Sale #',
      'Date',
      'Customer',
      'Payment',
      'Subtotal',
      'Discount',
      'Charges',
      'Total',
      'Paid',
      'Credit',
      'Status',
    ]
    const lines = all.map((r) => [
      r.saleNumber,
      r.soldAt,
      r.customerName ?? 'Walk-in',
      r.paymentMethod ?? (r.creditAmount > 0 ? 'CREDIT' : ''),
      r.subtotal,
      r.discountAmount,
      r.chargesAmount,
      r.totalAmount,
      r.amountPaid,
      r.creditAmount,
      r.status,
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

  const periodSub = `${t('sales.txns').replace('{n}', String(summary.data?.transactions ?? 0))} · ${money.format(summary.data?.revenue ?? 0)}`
  const saleRow = (s: (typeof rows)[number]) => {
    const st = saleStatusInfo(t, s)
    const name = s.customerName ?? t('sales.walkIn')
    return { st, name, initials: saleInitials(name) }
  }

  // --- mobile: header + period segments + KPIs + transaction list + receipt sheet ---
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
            <div className="m-title">{t('sales.title')}</div>
            <div className="m-sub">{periodSub}</div>
          </div>
          <button
            type="button"
            className="m-ic"
            onClick={() => void exportCsv()}
            aria-label={t('sales.export')}
          >
            {I.export}
          </button>
        </header>

        <div className="mseg" style={{ marginBottom: 16 }}>
          {(['today', 'week', 'month'] as Period[]).map((p) => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>
              {t(`sales.${p}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>

        <div className="mkpis" style={{ marginBottom: 18 }}>
          <div className="mkpi">
            <div className="top">
              <span className="ic b">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 3v18h18" />
                  <path d="m7 14 3-4 3 3 4-6" />
                </svg>
              </span>
            </div>
            <div className="v">{money.compact(summary.data?.revenue ?? 0)}</div>
            <div className="k">
              {t('sales.kpiRevenue').replace(
                '{period}',
                t(`sales.${period}` as Parameters<typeof t>[0]).toLowerCase(),
              )}
            </div>
          </div>
          <div className="mkpi">
            <div className="top">
              <span className="ic g">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="2" y="6" width="20" height="12" rx="2" />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
              </span>
            </div>
            <div className="v">{money.compact(summary.data?.averageBasket ?? 0)}</div>
            <div className="k">{t('sales.kpiBasket')}</div>
          </div>
        </div>

        <div className="m-sec">{t('sales.transactions')}</div>
        <div className="mlist">
          {list.isPending && rows.length === 0 ? (
            <div className="mrow" style={{ cursor: 'default' }}>
              <div className="mt">
                <div className="sub">{t('sales.loading')}</div>
              </div>
            </div>
          ) : null}
          {!list.isPending && rows.length === 0 ? (
            <div className="mrow" style={{ cursor: 'default' }}>
              <div className="mt">
                <div className="sub">{t('sales.empty')}</div>
              </div>
            </div>
          ) : null}
          {rows.map((s) => {
            const r = saleRow(s)
            return (
              <button key={s.id} type="button" className="mrow" onClick={() => setOpenId(s.id)}>
                <div className="th brand round">{r.initials}</div>
                <div className="mt">
                  <div className="nm">
                    {r.name} · #{s.saleNumber}
                  </div>
                  <div className="sub">
                    {salePayLabel(t, s.paymentMethod)} · {formatSaleTime(s.soldAt, lang)}
                  </div>
                </div>
                <div className="rt">
                  <div className="v">{money.format(s.totalAmount)}</div>
                  <div className="s">
                    <span className={`mst ${r.st.cls.replace('st-', 'mst-')}`}>
                      <span className="d" />
                      {r.st.label}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {(meta?.totalPages ?? 1) > 1 ? (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
            <button
              type="button"
              className="mbtn"
              style={{ width: 'auto', padding: '0 18px' }}
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t('common.prev')}
            </button>
            <button
              type="button"
              className="mbtn"
              style={{ width: 'auto', padding: '0 18px' }}
              disabled={(meta?.page ?? 1) >= (meta?.totalPages ?? 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('common.next')}
            </button>
          </div>
        ) : null}

        {openId ? (
          <MobileSheet title={t('sales.receipt')} onClose={() => setOpenId(null)}>
            <SaleReceiptView saleId={openId} />
          </MobileSheet>
        ) : null}
      </>
    )
  }

  // --- tablet: two-pane master-detail (transaction list left, receipt right) ---
  if (bp === 'tablet') {
    const selectedId = openId ?? rows[0]?.id ?? null
    return (
      <div className="tpane">
        <div className="page-head" style={{ marginBottom: 16 }}>
          <div>
            <h1>{t('sales.title')}</h1>
            <p>{periodSub}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="seg2">
              {(['today', 'week', 'month'] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={period === p}
                  onClick={() => setPeriod(p)}
                >
                  {t(`sales.${p}` as Parameters<typeof t>[0])}
                </button>
              ))}
            </span>
            <button type="button" className="btn" onClick={() => void exportCsv()}>
              {I.export}
              {t('sales.export')}
            </button>
          </div>
        </div>

        <div className="tsplit">
          <div className="tsplit-list">
            <div className="tslh">
              <span className="chip-tag">
                {t('sales.count')
                  .replace('{n}', String(meta?.total ?? 0))
                  .replace('{amt}', money.format(summary.data?.revenue ?? 0))}
              </span>
              <div style={{ flex: 1 }} />
              <div className="select-wrap" style={{ width: 150 }}>
                <select
                  className="select"
                  style={{ height: 34, fontSize: 12 }}
                  value={payment}
                  onChange={(e) => setPayment(e.target.value)}
                >
                  <option value="">{t('sales.allPayments')}</option>
                  {PAY_FILTERS.map((m) => (
                    <option key={m} value={m}>
                      {salePayLabel(t, m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="tslb">
              {list.isPending && rows.length === 0 ? (
                <div className="cat-empty">{t('sales.loading')}</div>
              ) : null}
              {!list.isPending && rows.length === 0 ? (
                <div className="cat-empty">{t('sales.empty')}</div>
              ) : null}
              {rows.map((s) => {
                const r = saleRow(s)
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`trow${s.id === selectedId ? ' sel' : ''}`}
                    onClick={() => setOpenId(s.id)}
                  >
                    <div className="th brand round">{r.initials}</div>
                    <div className="tt">
                      <div className="nm">
                        {r.name} · #{s.saleNumber}
                      </div>
                      <div className="sub">
                        {salePayLabel(t, s.paymentMethod)} · {formatSaleTime(s.soldAt, lang)}
                      </div>
                    </div>
                    <div className="rt">
                      <div className="v">{money.format(s.totalAmount)}</div>
                      <div className="s">
                        <span className={`st ${r.st.cls}`}>
                          <span className="d" />
                          {r.st.label}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="tsplit-detail">
            {selectedId ? (
              <div className="tsdpad">
                <SaleReceiptView saleId={selectedId} />
              </div>
            ) : (
              <div className="receipt-empty">{t('sales.empty')}</div>
            )}
          </div>
        </div>
      </div>
    )
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
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
              >
                {t(`sales.${p}` as Parameters<typeof t>[0])}
              </button>
            ))}
          </span>
          <button type="button" className="btn" onClick={() => void exportCsv()}>
            {I.export}
            {t('sales.export')}
          </button>
        </div>
      </div>

      <div className="minihead">
        <div className="m">
          <div className="k">
            {t('sales.kpiRevenue').replace(
              '{period}',
              t(`sales.${period}` as Parameters<typeof t>[0]).toLowerCase(),
            )}
          </div>
          <div className="v">{money.format(summary.data?.revenue ?? 0)}</div>
          <div className="h">
            {t('sales.txns').replace('{n}', String(summary.data?.transactions ?? 0))}
          </div>
        </div>
        <div className="m">
          <div className="k">{t('sales.kpiBasket')}</div>
          <div className="v">{money.format(summary.data?.averageBasket ?? 0)}</div>
          <div className="h">
            {t('sales.acrossSales').replace('{n}', String(summary.data?.transactions ?? 0))}
          </div>
        </div>
        <div className="m">
          <div className="k">{t('sales.kpiItems')}</div>
          <div className="v">
            {t('sales.units').replace('{n}', String(summary.data?.itemsSold ?? 0))}
          </div>
          <div className="h">
            {t('sales.acrossSales').replace('{n}', String(summary.data?.transactions ?? 0))}
          </div>
        </div>
        <div className="m">
          <div className="k">{t('sales.kpiRefunds')}</div>
          <div className="v">
            {summary.data?.refundCount ?? 0} · {money.format(summary.data?.refundAmount ?? 0)}
          </div>
          <div className="h">&nbsp;</div>
        </div>
      </div>

      {/* Full-width transactions table; a row opens the detail drawer. */}
      <div className="panel">
        <div className="panel-head">
          <h3>{t('sales.transactions')}</h3>
          <div style={{ flex: 1 }} />
          <div className="select-wrap" style={{ width: 150 }}>
            <select
              className="select"
              style={{ height: 36 }}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="">{t('sales.allChannels')}</option>
              <option value="ONLINE">{t('sales.channelOnline')}</option>
              <option value="IN_STORE">{t('sales.channelInStore')}</option>
            </select>
          </div>
          <div className="select-wrap" style={{ width: 180 }}>
            <select
              className="select"
              style={{ height: 36 }}
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
            >
              <option value="">{t('sales.allPayments')}</option>
              {PAY_FILTERS.map((m) => (
                <option key={m} value={m}>
                  {salePayLabel(t, m)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 200 }}>
            {I.search}
            <input
              className="input ic"
              style={{ height: 36 }}
              placeholder={t('sales.searchPh')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
                  <tr
                    key={s.id}
                    className={s.id === openId ? 'sel' : ''}
                    onClick={() => setOpenId(s.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="mono">{s.saleNumber}</td>
                    <td>{formatSaleTime(s.soldAt, lang)}</td>
                    <td className="trunc" title={s.customerName ?? undefined}>
                      {s.customerName ?? t('sales.walkIn')}
                    </td>
                    <td>
                      <span className="pill-tag">{salePayLabel(t, s.paymentMethod)}</span>
                    </td>
                    <td className="right num">{money.format(s.totalAmount)}</td>
                    <td>
                      <span className={`st ${st.cls}`}>
                        <span className="d" />
                        {st.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {!list.isPending && rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      padding: '32px 12px',
                    }}
                  >
                    {t('sales.empty')}
                  </td>
                </tr>
              ) : null}
              {list.isPending && rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      padding: '32px 12px',
                    }}
                  >
                    {t('sales.loading')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="panel-foot">
          <span>
            {t('sales.count')
              .replace('{n}', String(meta?.total ?? 0))
              .replace('{amt}', money.format(summary.data?.revenue ?? 0))}
          </span>
          <div className="spacer" />
          <span
            className="link"
            aria-disabled={page <= 1}
            onClick={() => {
              if (page > 1) setPage((p) => p - 1)
            }}
          >
            {t('sales.prev')}
          </span>
          <span>
            {t('sales.page')
              .replace('{p}', String(meta?.page ?? 1))
              .replace('{t}', String(meta?.totalPages ?? 1))}
          </span>
          <span
            className="link"
            aria-disabled={(meta?.page ?? 1) >= (meta?.totalPages ?? 1)}
            onClick={() => {
              if ((meta?.page ?? 1) < (meta?.totalPages ?? 1)) setPage((p) => p + 1)
            }}
          >
            {t('sales.next')}
          </span>
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
