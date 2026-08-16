import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { useCanManage } from '@/lib/useCanManage'
import { useLangStore, useT } from '@/i18n'
import { SaleDetailDrawer } from '@/components/sales/SaleDetailDrawer'
import { formatSaleDateTime } from '@/components/sales/sale-format'
import { actionLabel, auditDeepLink, flagAuditRow } from '@/components/activity/audit-format'
import type { LocalAuditLog } from '@shared/ipc'

const PAGE = 20
const SUMMARY_WINDOW = 500
type Period = 'today' | 'week' | 'month'
const PERIODS: Period[] = ['today', 'week', 'month']

/** Local-day window as ISO bounds — the renderer knows the timezone; the service compares raw. */
function dayRange(period: Period): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (period === 'week') start.setDate(start.getDate() - 6)
  else if (period === 'month') start.setDate(start.getDate() - 29)
  return { dateFrom: start.toISOString(), dateTo: now.toISOString() }
}

export function Activity() {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const navigate = useNavigate()
  const canManage = useCanManage()

  const [period, setPeriod] = useState<Period>('today')
  const [cashier, setCashier] = useState('') // actorId
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [openSaleId, setOpenSaleId] = useState<string | null>(null)

  const range = useMemo(() => dayRange(period), [period])

  useEffect(() => {
    setPage(1)
    setOpenSaleId(null)
  }, [period, cashier, flaggedOnly])

  const members = useQuery({
    queryKey: ['team', 'members'],
    queryFn: () => dataClient.team.listMembers(),
    enabled: canManage,
  })
  const list = useQuery({
    queryKey: ['audit', 'list', range, cashier, page],
    queryFn: () =>
      dataClient.audit.list({
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        actorId: cashier || undefined,
        page,
        limit: PAGE,
      }),
    enabled: canManage,
  })
  // A wider window (unpaginated-ish) purely to build the per-cashier "à vérifier" summary.
  const summary = useQuery({
    queryKey: ['audit', 'summary', range],
    queryFn: () =>
      dataClient.audit.list({
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        limit: SUMMARY_WINDOW,
      }),
    enabled: canManage,
  })

  const riskByCashier = useMemo(() => {
    const rows = summary.data?.data ?? []
    const map = new Map<string, { actorId: string; name: string; count: number }>()
    for (const r of rows) {
      if (!flagAuditRow(r).flagged) continue
      const key = r.actorId ?? r.actorName ?? '—'
      const entry = map.get(key) ?? { actorId: r.actorId ?? '', name: r.actorName ?? '—', count: 0 }
      entry.count += 1
      map.set(key, entry)
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [summary.data])

  const rows = list.data?.data ?? []
  const shown = flaggedOnly ? rows.filter((r) => flagAuditRow(r).flagged) : rows
  const meta = list.data

  const open = (row: LocalAuditLog): void => {
    const link = auditDeepLink(row)
    if (!link) return
    if (link.kind === 'sale') setOpenSaleId(link.id)
    else navigate(`/products/${link.id}`)
  }

  if (!canManage) {
    return (
      <div className="page">
        <p className="cash-muted">{t('activity.notAuthorized')}</p>
      </div>
    )
  }

  return (
    <div className="page activity">
      <header className="page-h">
        <div>
          <h1>{t('activity.title')}</h1>
          <p className="cash-muted">{t('activity.subtitle')}</p>
        </div>
      </header>

      {riskByCashier.length > 0 ? (
        <section className="act-review">
          <div className="lbl2">{t('activity.reviewTitle')}</div>
          <p className="cash-muted" style={{ fontSize: 12.5, margin: '2px 0 10px' }}>
            {t('activity.reviewHint')}
          </p>
          <div className="act-review-cards">
            {riskByCashier.map((r) => (
              <button
                key={r.actorId || r.name}
                type="button"
                className={`act-review-card${cashier === r.actorId ? ' on' : ''}`}
                onClick={() => setCashier((c) => (c === r.actorId ? '' : r.actorId))}
                disabled={!r.actorId}
              >
                <span className="name">{r.name}</span>
                <span className="count">
                  {t('activity.reviewCount').replace('{n}', String(r.count))}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="act-filters">
        <div className="seg">
          {PERIODS.map((p) => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>
              {t(`activity.period.${p}` as never)}
            </button>
          ))}
        </div>
        <select className="act-select" value={cashier} onChange={(e) => setCashier(e.target.value)}>
          <option value="">{t('activity.allCashiers')}</option>
          {(members.data?.members ?? []).map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name ?? m.userId}
            </option>
          ))}
        </select>
        <label className="act-check">
          <input
            type="checkbox"
            checked={flaggedOnly}
            onChange={(e) => setFlaggedOnly(e.target.checked)}
          />
          {t('activity.flaggedOnly')}
        </label>
      </div>

      <div className="act-list">
        {list.isPending ? (
          <p className="cash-muted">{t('activity.loading')}</p>
        ) : shown.length === 0 ? (
          <p className="cash-muted">{t('activity.empty')}</p>
        ) : (
          shown.map((row) => {
            const flag = flagAuditRow(row)
            const link = auditDeepLink(row)
            return (
              <div
                key={row.id}
                className={`act-row${flag.flagged ? ' flagged' : ''}${link ? ' clickable' : ''}`}
                onClick={link ? () => open(row) : undefined}
                role={link ? 'button' : undefined}
                tabIndex={link ? 0 : undefined}
              >
                <div className="ar-main">
                  <div className="ar-action">{actionLabel(t, row.action)}</div>
                  <div className="ar-meta cash-muted">
                    {row.actorName || '—'} · {row.entityLabel || row.entityType} ·{' '}
                    {formatSaleDateTime(row.createdAt, lang)}
                  </div>
                </div>
                <div className="ar-right">
                  {row.amount ? <span className="ar-amt">{money.format(row.amount)}</span> : null}
                  {flag.flagged && flag.reason ? (
                    <span className="chip act-flag">{t(flag.reason)}</span>
                  ) : null}
                </div>
              </div>
            )
          })
        )}
      </div>

      {meta && meta.totalPages > 1 ? (
        <div className="act-pager">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('activity.prev')}
          </button>
          <span className="cash-muted">
            {t('activity.pageOf')
              .replace('{page}', String(meta.page))
              .replace('{total}', String(meta.totalPages))}
          </span>
          <button
            type="button"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('activity.next')}
          </button>
        </div>
      ) : null}

      <SaleDetailDrawer saleId={openSaleId} onClose={() => setOpenSaleId(null)} />
    </div>
  )
}
