import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ReviewFlagCode,
  ReviewFlagSeverity,
  ReviewFlagStatus,
  type ReviewFlag,
} from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { errorMessage } from '@/lib/error'
import { useCanReviewFlags, useOpenReviewFlags } from '@/lib/useReviewFlags'
import { useLangStore, useT } from '@/i18n'
import { SaleDetailDrawer } from '@/components/sales/SaleDetailDrawer'
import { OnlineError } from '@/components/online/OnlineStates'
import {
  flagDetailRows,
  flagNextStep,
  flagOtherSaleId,
  flagReason,
  flagTitle,
  severityClasses,
  severityLabel,
} from '@/components/activity/review-flag-format'

const PAGE = 20
const SEVERITIES = [ReviewFlagSeverity.HIGH, ReviewFlagSeverity.MEDIUM, ReviewFlagSeverity.LOW]
const CODES = Object.values(ReviewFlagCode)

const I = {
  warn: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  ),
}

function fmtWhen(iso: string | null | undefined, lang: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(lang, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ReviewFlags() {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const qc = useQueryClient()
  const allowed = useCanReviewFlags()
  const [sp, setSp] = useSearchParams()

  // Filters live in the URL so a notification link and the back button land on the same view.
  const status =
    sp.get('status') === ReviewFlagStatus.RESOLVED
      ? ReviewFlagStatus.RESOLVED
      : ReviewFlagStatus.OPEN
  const severity = (SEVERITIES.find((s) => s === sp.get('sev')) ?? '') as ReviewFlagSeverity | ''
  const code = (CODES.find((c) => c === sp.get('code')) ?? '') as ReviewFlagCode | ''
  const page = Math.max(1, Number(sp.get('page') ?? '1'))
  const [selected, setSelected] = useState<ReviewFlag | null>(null)
  const [openSaleId, setOpenSaleId] = useState<string | null>(null)

  const update = (patch: Record<string, string>, resetPage = true): void => {
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        if (resetPage) next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  const list = useQuery({
    queryKey: ['review-flags', 'list', status, severity, code, page],
    queryFn: () =>
      dataClient.reviewFlags.list({
        status,
        severity: severity || undefined,
        code: code || undefined,
        page,
        limit: PAGE,
      }),
    enabled: allowed,
    placeholderData: keepPreviousData,
  })
  const count = useOpenReviewFlags()

  if (!allowed) {
    return (
      <div className="frame">
        <p className="cash-muted">{t('review.notAuthorized')}</p>
      </div>
    )
  }

  const rows = list.data?.data ?? []
  const totalPages = Math.max(1, list.data?.totalPages ?? 1)
  const showResolved = status === ReviewFlagStatus.RESOLVED

  return (
    <div className="frame activity">
      <div className="page-head">
        <div>
          <h1>{t('review.title')}</h1>
          <p>{t('review.subtitle')}</p>
        </div>
        <span className="seg2">
          <button type="button" aria-pressed={!showResolved} onClick={() => update({ status: '' })}>
            {t('review.tab.open')}
          </button>
          <button
            type="button"
            aria-pressed={showResolved}
            onClick={() => update({ status: ReviewFlagStatus.RESOLVED })}
          >
            {t('review.tab.resolved')}
          </button>
        </span>
      </div>

      <div className="minihead">
        <div className="m">
          <div className="k">{t('review.kpi.open')}</div>
          <div className="v">{count?.open ?? '—'}</div>
          <div className="h">{t('review.kpi.openSub')}</div>
        </div>
        <div className="m">
          <div className="k">{t('review.kpi.high')}</div>
          <div className="v" style={{ color: count?.high ? 'var(--danger)' : undefined }}>
            {count?.high ?? '—'}
          </div>
          <div className="h">{t('review.kpi.highSub')}</div>
        </div>
      </div>

      <div className="panel" style={{ minWidth: 0, overflow: 'hidden' }}>
        <div className="panel-head">
          <h3>{showResolved ? t('review.tab.resolved') : t('review.tab.open')}</h3>
          <div className="spacer" style={{ flex: 1 }} />
          <select
            className="select"
            value={severity}
            onChange={(e) => update({ sev: e.target.value })}
          >
            <option value="">{t('review.filter.allSeverities')}</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {severityLabel(t, s)}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={code}
            onChange={(e) => update({ code: e.target.value })}
          >
            <option value="">{t('review.filter.allKinds')}</option>
            {CODES.map((c) => (
              <option key={c} value={c}>
                {flagTitle(t, c)}
              </option>
            ))}
          </select>
        </div>

        {list.isError ? (
          <OnlineError error={list.error} onRetry={() => void list.refetch()} />
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="act-table">
                <thead>
                  <tr>
                    <th className="sev-cell" />
                    <th>{t('review.col.what')}</th>
                    <th>{t('review.col.sale')}</th>
                    <th>{t('review.col.level')}</th>
                    <th>{showResolved ? t('review.col.resolved') : t('review.col.when')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.isPending ? (
                    <tr>
                      <td colSpan={5} className="cash-muted" style={{ padding: 20 }}>
                        {t('review.loading')}
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="cash-muted" style={{ padding: 20 }}>
                        {showResolved ? t('review.emptyResolved') : t('review.emptyOpen')}
                      </td>
                    </tr>
                  ) : (
                    rows.map((flag) => {
                      const sev = severityClasses(flag.severity)
                      return (
                        <tr key={flag.id} onClick={() => setSelected(flag)}>
                          <td className="sev-cell">
                            <span className={`sev-bar ${sev.bar}`} />
                          </td>
                          <td>
                            <div className="ent">
                              <div>
                                <div className="nm">{flagTitle(t, flag.code)}</div>
                                <div className="sub">{flagReason(t, money.format, flag)}</div>
                              </div>
                            </div>
                          </td>
                          <td className="num">{flag.entityLabel || '—'}</td>
                          <td>
                            <span className={`st ${sev.pill}`}>
                              {severityLabel(t, flag.severity)}
                            </span>
                          </td>
                          <td className="act-time">
                            {fmtWhen(showResolved ? flag.resolvedAt : flag.createdAt, lang)}
                            {showResolved && flag.resolvedByName ? (
                              <div className="cash-muted">{flag.resolvedByName}</div>
                            ) : null}
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
                {t('review.count').replace('{n}', String(list.data?.total ?? 0))}
              </span>
              <div className="spacer" style={{ flex: 1 }} />
              <button
                className="btn"
                disabled={page <= 1}
                onClick={() => update({ page: String(page - 1) }, false)}
              >
                {t('review.prev')}
              </button>
              <button
                className="btn"
                disabled={page >= totalPages}
                onClick={() => update({ page: String(page + 1) }, false)}
              >
                {t('review.next')}
              </button>
            </div>
          </>
        )}
      </div>

      {selected ? (
        <FlagDrawer
          flag={selected}
          onClose={() => setSelected(null)}
          onOpenSale={(saleId) => {
            setSelected(null)
            setOpenSaleId(saleId)
          }}
          onResolved={() => {
            setSelected(null)
            void qc.invalidateQueries({ queryKey: ['review-flags'] })
          }}
        />
      ) : null}
      <SaleDetailDrawer saleId={openSaleId} onClose={() => setOpenSaleId(null)} />
    </div>
  )
}

function FlagDrawer({
  flag,
  onClose,
  onOpenSale,
  onResolved,
}: {
  flag: ReviewFlag
  onClose: () => void
  onOpenSale: (saleId: string) => void
  onResolved: () => void
}): ReactNode {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const [note, setNote] = useState('')
  const open = flag.status === ReviewFlagStatus.OPEN
  const details = flagDetailRows(t, money.format, flag)
  const otherSaleId = flagOtherSaleId(flag)

  const resolve = useMutation({
    mutationFn: () => dataClient.reviewFlags.resolve(flag.id, note),
    onSuccess: onResolved,
  })

  return (
    <>
      <div className="drawer-ov open" onClick={onClose} />
      <aside className="drawer open activity-drawer">
        <div className="drawer-h">
          <div className="di">{I.warn}</div>
          <div className="ti">
            <h3>{flagTitle(t, flag.code)}</h3>
            <p>{flag.entityLabel || flag.entityId}</p>
          </div>
          <button type="button" className="x" onClick={onClose}>
            {I.x}
          </button>
        </div>
        <div className="drawer-b">
          <div className="dd-flag">
            {I.warn}
            {flagReason(t, money.format, flag)}
          </div>

          <div className="dd-block">
            <div className="bl">{t('review.drawer.whatToDo')}</div>
            <div style={{ fontSize: 13 }}>{flagNextStep(t, flag.code)}</div>
          </div>

          {details.length ? (
            <div className="dd-block">
              <div className="bl">{t('review.drawer.numbers')}</div>
              {details.map((row) => (
                <div className="kv" key={row.label}>
                  <span className="k">{row.label}</span>
                  <span className="v">{row.value}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="dd-block">
            <div className="bl">{t('review.drawer.status')}</div>
            <div className="kv">
              <span className="k">{t('review.col.level')}</span>
              <span className="v">{severityLabel(t, flag.severity)}</span>
            </div>
            <div className="kv">
              <span className="k">{t('review.drawer.raised')}</span>
              <span className="v">{fmtWhen(flag.createdAt, lang)}</span>
            </div>
            {!open ? (
              <>
                <div className="kv">
                  <span className="k">{t('review.drawer.resolvedAt')}</span>
                  <span className="v">{fmtWhen(flag.resolvedAt, lang)}</span>
                </div>
                {flag.resolvedByName ? (
                  <div className="kv">
                    <span className="k">{t('review.drawer.resolvedBy')}</span>
                    <span className="v">{flag.resolvedByName}</span>
                  </div>
                ) : null}
                {flag.resolutionNote ? (
                  <div className="kv">
                    <span className="k">{t('review.drawer.note')}</span>
                    <span className="v">{flag.resolutionNote}</span>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 13 }}>
            <button type="button" className="btn" onClick={() => onOpenSale(flag.entityId)}>
              {t('review.drawer.viewSale')}
            </button>
            {otherSaleId ? (
              <button type="button" className="btn" onClick={() => onOpenSale(otherSaleId)}>
                {t('review.drawer.otherSale')}
              </button>
            ) : null}
          </div>

          {open ? (
            <div className="dd-block">
              <div className="bl">{t('review.drawer.note')}</div>
              <textarea
                className="input"
                rows={3}
                maxLength={1000}
                placeholder={t('review.drawer.notePlaceholder')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              {resolve.isError ? (
                <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }}>
                  {errorMessage(resolve.error, t('review.resolveFailed'))}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="drawer-f">
          {open ? (
            <button
              type="button"
              className="btn btn-primary grow"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate()}
            >
              {resolve.isPending ? t('review.drawer.resolving') : t('review.drawer.resolve')}
            </button>
          ) : (
            <button type="button" className="btn grow" onClick={onClose}>
              {t('review.drawer.close')}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
