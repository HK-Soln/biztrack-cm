import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { useCanManage } from '@/lib/useCanManage'
import { useLangStore, useT } from '@/i18n'
import { SaleDetailDrawer } from '@/components/sales/SaleDetailDrawer'
import {
  auditDeepLink,
  auditMeta,
  entityAccent,
  entityLabel,
  type AuditMeta,
} from '@/components/activity/audit-format'
import type { LocalAuditLog } from '@shared/ipc'

const PAGE = 10
const WINDOW = 500
type Period = 'today' | 'week' | 'month'
const PERIODS: Period[] = ['today', 'week', 'month']

function dayRange(period: Period): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (period === 'week') start.setDate(start.getDate() - 6)
  else if (period === 'month') start.setDate(start.getDate() - 29)
  return { dateFrom: start.toISOString(), dateTo: now.toISOString() }
}

function initials(name: string | null): string {
  if (!name) return '—'
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '—'
  )
}
function fmtTime(iso: string, lang: string): string {
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString(lang, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
}

const I = {
  warn: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  ),
  bars: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  ),
}
const ENTITY_ICON: Record<string, ReactNode> = {
  sale: (
    <>
      <path d="M6 8h12l1 12H5L6 8Z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </>
  ),
  sale_line: <path d="M4 6h16M4 12h16M4 18h9" />,
  cash_movement: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  cash_session: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  inventory: (
    <>
      <path d="M21 16V8l-9-5-9 5v8l9 5 9-5Z" />
      <path d="M3.3 7 12 12l8.7-5M12 12v10" />
    </>
  ),
  product: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a4 4 0 0 1 8 0v2" />
    </>
  ),
  product_variant: (
    <>
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
    </>
  ),
  product_serial_unit: <path d="M4 7v10M8 7v10M12 7v10M16 7v10M20 7v10" />,
  business_member: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  device: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <path d="M11 18h2" />
    </>
  ),
  pin_authorization: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
}
function EntIcon({ type }: { type: string }): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      {ENTITY_ICON[type] ?? ENTITY_ICON.sale}
    </svg>
  )
}

interface Row {
  r: LocalAuditLog
  meta: AuditMeta
}

export function Activity() {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const navigate = useNavigate()
  const canManage = useCanManage()
  const [sp, setSp] = useSearchParams()

  // Filters live in the URL so navigating away and back restores the view.
  const period = (sp.get('period') as Period) || 'today'
  const sevF = sp.get('sev') ?? ''
  const entF = sp.get('ent') ?? ''
  const actorF = sp.get('actor') ?? ''
  const q = sp.get('q') ?? ''
  const page = Math.max(1, Number(sp.get('page') ?? '1'))
  const [selected, setSelected] = useState<Row | null>(null)
  const [openSaleId, setOpenSaleId] = useState<string | null>(null)

  // Changing a filter resets the page; page navigation keeps the filters.
  const update = (patch: Record<string, string>, resetPage = true): void => {
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(patch)) {
          if (v) n.set(k, v)
          else n.delete(k)
        }
        if (resetPage) n.delete('page')
        return n
      },
      { replace: true },
    )
  }

  const range = useMemo(() => dayRange(period), [period])

  const list = useQuery({
    queryKey: ['audit', 'window', range],
    queryFn: () =>
      dataClient.audit.list({ dateFrom: range.dateFrom, dateTo: range.dateTo, limit: WINDOW }),
    enabled: canManage,
  })

  const all = useMemo<Row[]>(
    () => (list.data?.data ?? []).map((r) => ({ r, meta: auditMeta(t, r, money.format) })),
    [list.data, t, money],
  )

  const actors = useMemo(() => {
    const set = new Map<string, string>() // name → name
    for (const { r } of all) if (r.actorName) set.set(r.actorName, r.actorName)
    return [...set.keys()]
  }, [all])

  const filtered = useMemo(
    () =>
      all.filter(({ r, meta }) => {
        if (sevF === 'flag' && !meta.sev) return false
        if (sevF === 'clean' && meta.sev) return false
        if (entF && r.entityType !== entF) return false
        if (actorF && r.actorName !== actorF) return false
        if (q) {
          const hay = `${meta.label} ${r.entityLabel ?? ''} ${r.actorName ?? ''}`.toLowerCase()
          if (!hay.includes(q.toLowerCase())) return false
        }
        return true
      }),
    [all, sevF, entF, actorF, q],
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const paged = filtered.slice((page - 1) * PAGE, page * PAGE)

  // KPI + side summaries, over the whole loaded window.
  const kpi = useMemo(() => {
    const flagged = all.filter((x) => x.meta.sev)
    const seqs = all.map((x) => x.r.sequence).filter((n): n is number => n != null)
    const varianceRows = all.filter((x) => x.r.action === 'SHIFT_CLOSED')
    const variance = varianceRows.reduce(
      (s, x) =>
        s + Number((x.r.changes?.after as { varianceCash?: number } | null)?.varianceCash ?? 0),
      0,
    )
    const outOfBalance = varianceRows.filter(
      (x) =>
        Number((x.r.changes?.after as { varianceCash?: number } | null)?.varianceCash ?? 0) !== 0,
    ).length
    const synced = all.filter((x) => x.r.serverTime).length
    return {
      total: all.length,
      seqMin: seqs.length ? Math.min(...seqs) : 0,
      seqMax: seqs.length ? Math.max(...seqs) : 0,
      flagged: flagged.length,
      flaggedActors: new Set(flagged.map((x) => x.r.actorName)).size,
      variance,
      outOfBalance,
      synced,
      pending: all.length - synced,
    }
  }, [all])

  const byActor = useMemo(() => {
    const m = new Map<string, { name: string; total: number; flagged: number }>()
    for (const { r, meta } of all) {
      const key = r.actorName ?? '—'
      const e = m.get(key) ?? { name: key, total: 0, flagged: 0 }
      e.total += 1
      if (meta.sev) e.flagged += 1
      m.set(key, e)
    }
    return [...m.values()].sort((a, b) => b.flagged - a.flagged || b.total - a.total)
  }, [all])

  const byType = useMemo(() => {
    const m = new Map<string, number>()
    for (const { r } of all) {
      const label = entityLabel(t, r.entityType)
      m.set(label, (m.get(label) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [all, t])

  const openTxn = (r: LocalAuditLog): void => {
    const link = auditDeepLink(r)
    setSelected(null)
    if (!link) return
    if (link.kind === 'sale') setOpenSaleId(link.id)
    else navigate(`/products/${link.id}`)
  }

  if (!canManage) {
    return (
      <div className="frame">
        <p className="cash-muted">{t('activity.notAuthorized')}</p>
      </div>
    )
  }

  return (
    <div className="frame activity">
      <div className="page-head">
        <div>
          <h1>{t('activity.title')}</h1>
          <p>{t('activity.subtitle')}</p>
        </div>
        <span className="seg2">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => update({ period: p })}
            >
              {t(`activity.period.${p}` as never)}
            </button>
          ))}
        </span>
      </div>

      <div className="minihead">
        <div className="m">
          <div className="k">{t('activity.kpi.events')}</div>
          <div className="v">{kpi.total}</div>
          <div className="h">
            {t('activity.kpi.seq')
              .replace('{a}', String(kpi.seqMin))
              .replace('{b}', String(kpi.seqMax))}
          </div>
        </div>
        <div className="m">
          <div className="k">{t('activity.kpi.flagged')}</div>
          <div className="v" style={{ color: kpi.flagged ? 'var(--danger)' : undefined }}>
            {kpi.flagged}
          </div>
          <div className="h">
            {t('activity.kpi.flaggedSub').replace('{n}', String(kpi.flaggedActors))}
          </div>
        </div>
        <div className="m">
          <div className="k">{t('activity.kpi.variance')}</div>
          <div className="v" style={{ color: kpi.variance !== 0 ? 'var(--danger)' : undefined }}>
            {money.format(kpi.variance)}
          </div>
          <div className="h">
            {t('activity.kpi.varianceSub').replace('{n}', String(kpi.outOfBalance))}
          </div>
        </div>
        <div className="m">
          <div className="k">{t('activity.kpi.pending')}</div>
          <div className="v" style={{ color: kpi.pending ? 'var(--warning)' : undefined }}>
            {kpi.pending}
          </div>
          <div className="h">{t('activity.kpi.pendingSub').replace('{n}', String(kpi.synced))}</div>
        </div>
      </div>

      <div className="act-grid">
        <div className="panel" style={{ minWidth: 0, overflow: 'hidden' }}>
          <div className="panel-head">
            <h3>{t('activity.activity')}</h3>
            <div className="spacer" style={{ flex: 1 }} />
            <select
              className="select"
              value={sevF}
              onChange={(e) => update({ sev: e.target.value })}
            >
              <option value="">{t('activity.filter.allEvents')}</option>
              <option value="flag">{t('activity.filter.flaggedOnly')}</option>
              <option value="clean">{t('activity.filter.cleanOnly')}</option>
            </select>
            <select
              className="select"
              value={entF}
              onChange={(e) => update({ ent: e.target.value })}
            >
              <option value="">{t('activity.filter.allTypes')}</option>
              <option value="sale">{t('activity.entity.sale')}</option>
              <option value="cash_movement">{t('activity.entity.cash_movement')}</option>
              <option value="cash_session">{t('activity.entity.cash_session')}</option>
              <option value="inventory">{t('activity.entity.inventory')}</option>
              <option value="product">{t('activity.entity.product')}</option>
              <option value="business_member">{t('activity.entity.business_member')}</option>
              <option value="device">{t('activity.entity.device')}</option>
            </select>
            <select
              className="select"
              value={actorF}
              onChange={(e) => update({ actor: e.target.value })}
            >
              <option value="">{t('activity.filter.allActors')}</option>
              {actors.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <div className="field" style={{ width: 170 }}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="9" cy="9" r="6" />
                <path d="m14 14 3 3" />
              </svg>
              <input
                className="input ic"
                placeholder={t('activity.filter.search')}
                value={q}
                onChange={(e) => update({ q: e.target.value })}
              />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="act-table">
              <thead>
                <tr>
                  <th className="sev-cell" />
                  <th>{t('activity.col.event')}</th>
                  <th>{t('activity.col.changed')}</th>
                  <th>{t('activity.col.actor')}</th>
                  <th className="right">{t('activity.col.amount')}</th>
                  <th>{t('activity.col.time')}</th>
                </tr>
              </thead>
              <tbody>
                {list.isPending ? (
                  <tr>
                    <td colSpan={6} className="cash-muted" style={{ padding: 20 }}>
                      {t('activity.loading')}
                    </td>
                  </tr>
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="cash-muted" style={{ padding: 20 }}>
                      {t('activity.empty')}
                    </td>
                  </tr>
                ) : (
                  paged.map((row) => {
                    const { r, meta } = row
                    return (
                      <tr key={r.id} onClick={() => setSelected(row)}>
                        <td className="sev-cell">
                          <span className={`sev-bar ${meta.sev ?? ''}`} />
                        </td>
                        <td>
                          <div className="ent">
                            <div className={`ei ${entityAccent(r.entityType)}`}>
                              <EntIcon type={r.entityType} />
                            </div>
                            <div>
                              <div className="nm">
                                {entityLabel(t, r.entityType)} · {meta.label}
                              </div>
                              <div className="sub">{r.entityLabel || r.entityId}</div>
                              {meta.why ? (
                                <div className={`why${meta.sev === 'med' ? ' med' : ''}`}>
                                  {I.warn}
                                  {meta.why}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td>
                          {meta.diff.length ? (
                            <div className="diff">
                              {meta.diff.map((d, i) => (
                                <div className="dl" key={i}>
                                  <span className="k">{d.label}</span>
                                  {d.before != null && d.before !== '' ? (
                                    <>
                                      <span className="a">{d.before}</span>
                                      <span className="arw">→</span>
                                    </>
                                  ) : null}
                                  <span className={`b${d.tone ? ` ${d.tone}` : ''}`}>
                                    {d.after}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="cash-muted">—</span>
                          )}
                        </td>
                        <td>
                          <div className="actor">
                            <div className="av">{initials(r.actorName)}</div>
                            <div>
                              <div className="nm">{r.actorName || '—'}</div>
                              <div className="rl">{r.actorRole || t('activity.system')}</div>
                            </div>
                          </div>
                        </td>
                        <td className="right num">
                          {r.amount != null ? (
                            money.format(r.amount)
                          ) : (
                            <span className="cash-muted">—</span>
                          )}
                        </td>
                        <td className="act-time">
                          <span
                            className="syncdot"
                            style={{
                              background: r.serverTime ? 'var(--success)' : 'var(--warning)',
                            }}
                            title={r.serverTime ? t('activity.synced') : t('activity.deviceOnly')}
                          />
                          {fmtTime(r.createdAt, lang)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="act-foot">
            <span className="cash-muted">
              {t('activity.count')
                .replace('{shown}', String(filtered.length))
                .replace('{total}', String(all.length))}
            </span>
            <div className="spacer" style={{ flex: 1 }} />
            <button
              className="btn"
              disabled={page <= 1}
              onClick={() => update({ page: String(page - 1) }, false)}
            >
              {t('activity.prev')}
            </button>
            <button
              className="btn"
              disabled={page >= totalPages}
              onClick={() => update({ page: String(page + 1) }, false)}
            >
              {t('activity.next')}
            </button>
          </div>
        </div>

        <div className="act-side">
          <div className="verif">
            <div className="vh">
              {I.warn}
              {t('activity.reviewByCashier')}
            </div>
            <div>
              {byActor.map((a) => (
                <button
                  key={a.name}
                  type="button"
                  className="vrow"
                  onClick={() => update({ actor: actorF === a.name ? '' : a.name })}
                >
                  <div className="av">{initials(a.name)}</div>
                  <div className="nm">
                    {a.name}
                    <div className="sub2">
                      {a.total} {a.total === 1 ? t('activity.event') : t('activity.events')}
                    </div>
                  </div>
                  <span className={`ct${a.flagged ? '' : ' zero'}`}>
                    {a.flagged
                      ? t('activity.flaggedN').replace('{n}', String(a.flagged))
                      : t('activity.clean')}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="verif">
            <div className="vh muted">
              {I.bars}
              {t('activity.byType')}
            </div>
            <div>
              {byType.map(([label, count]) => (
                <div className="tyrow" key={label}>
                  <span className="ty-l">{label}</span>
                  <span className="ty-bar">
                    <i style={{ width: `${Math.round((count / (all.length || 1)) * 100)}%` }} />
                  </span>
                  <span className="ty-n">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {selected ? (
        <AuditDrawer
          row={selected}
          onClose={() => setSelected(null)}
          onView={openTxn}
          canView={!!auditDeepLink(selected.r)}
        />
      ) : null}
      <SaleDetailDrawer saleId={openSaleId} onClose={() => setOpenSaleId(null)} />
    </div>
  )
}

function AuditDrawer({
  row,
  onClose,
  onView,
  canView,
}: {
  row: Row
  onClose: () => void
  onView: (r: LocalAuditLog) => void
  canView: boolean
}): ReactNode {
  const t = useT()
  const money = useCurrency()
  const { r, meta } = row
  const dt = (iso: string | null | undefined): string =>
    iso ? iso.replace('T', ' ').slice(0, 19) : ''
  return (
    <>
      <div className="drawer-ov open" onClick={onClose} />
      <aside className="drawer open activity-drawer">
        <div className="drawer-h">
          <div className="di">
            <EntIcon type={r.entityType} />
          </div>
          <div className="ti">
            <h3>
              {entityLabel(t, r.entityType)} · {meta.label}
            </h3>
            <p>{r.entityLabel || r.entityId}</p>
          </div>
          <button type="button" className="x" onClick={onClose}>
            {I.x}
          </button>
        </div>
        <div className="drawer-b">
          {meta.sev ? (
            <div className="dd-flag">
              {I.warn}
              {meta.why || t('activity.flagged')}
            </div>
          ) : null}

          <div className="dd-block">
            <div className="bl">{t('activity.drawer.actor')}</div>
            <div className="actor">
              <div className="av" style={{ width: 38, height: 38, fontSize: 13 }}>
                {initials(r.actorName)}
              </div>
              <div>
                <div className="nm" style={{ fontSize: 14 }}>
                  {r.actorName || '—'}
                </div>
                <div className="rl">{r.actorRole || t('activity.system')}</div>
              </div>
            </div>
          </div>

          <div className="dd-block">
            <div className="bl">{t('activity.drawer.event')}</div>
            <div className="kv">
              <span className="k">{t('activity.drawer.action')}</span>
              <span className="v mono">{r.action}</span>
            </div>
            <div className="kv">
              <span className="k">{t('activity.drawer.entity')}</span>
              <span className="v">
                {entityLabel(t, r.entityType)} · <span className="mono">{r.entityId}</span>
              </span>
            </div>
            {r.sequence != null ? (
              <div className="kv">
                <span className="k">{t('activity.drawer.sequence')}</span>
                <span className="v mono">#{r.sequence}</span>
              </div>
            ) : null}
            {r.amount != null ? (
              <div className="kv">
                <span className="k">{t('activity.drawer.amount')}</span>
                <span className="v">{money.format(r.amount)}</span>
              </div>
            ) : null}
          </div>

          {meta.diff.length ? (
            <div className="dd-block">
              <div className="bl">{t('activity.drawer.changes')}</div>
              {meta.diff.map((d, i) => (
                <div className="kv" key={i}>
                  <span className="k">{d.label}</span>
                  <span className="v">
                    {d.before != null && d.before !== '' ? (
                      <>
                        <span className="was">{d.before}</span> →{' '}
                      </>
                    ) : null}
                    {d.after}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="dd-block">
            <div className="bl">{t('activity.drawer.timing')}</div>
            <div className="kv">
              <span className="k">{t('activity.drawer.deviceTime')}</span>
              <span className="v mono">{dt(r.deviceTime ?? r.createdAt)}</span>
            </div>
            <div className="kv">
              <span className="k">{t('activity.drawer.serverTime')}</span>
              <span className="v mono">
                {r.serverTime ? (
                  dt(r.serverTime)
                ) : (
                  <span style={{ color: 'var(--warning)' }}>{t('activity.drawer.notSynced')}</span>
                )}
              </span>
            </div>
          </div>

          <div className="dd-raw-label">{t('activity.drawer.rawPayload')}</div>
          <div className="jsonbox">{JSON.stringify(r.changes, null, 2)}</div>
        </div>
        <div className="drawer-f">
          {canView ? (
            <button type="button" className="btn btn-primary grow" onClick={() => onView(r)}>
              {t('activity.drawer.viewTxn')}
            </button>
          ) : (
            <button type="button" className="btn grow" onClick={onClose}>
              {t('activity.drawer.done')}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
