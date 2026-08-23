import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@biztrack/ui/biztrack'
import { PeriodStatus, type AccountingPeriod, type FiscalYearWithPeriods } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { useT, useLangStore } from '@/i18n'
import { errorMessage } from '@/lib/error'

// A period's machine label is 'YYYY-MM'; show it as a readable, localized 'Jan 2027' / 'janv. 2027'.
function periodLabel(machine: string, lang: 'en' | 'fr'): string {
  const [y, m] = machine.split('-').map((n) => Number(n))
  if (!y || !m) return machine
  const d = new Date(Date.UTC(y, m - 1, 1))
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d)
}

// Settings → Accounting periods (BIZ-5.2/5.3). Server-owned, online-only, owner-gated. Lists
// each fiscal year's periods with their close lifecycle, and lets the owner close / lock them.

function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

const STATUS_CLASS: Record<PeriodStatus, string> = {
  [PeriodStatus.OPEN]: 'st-neutral',
  [PeriodStatus.CLOSING]: 'st-low',
  [PeriodStatus.CLOSED]: 'st-ok',
  [PeriodStatus.LOCKED]: 'st-ok',
}

export function AccountingPeriodsSection() {
  const t = useT()
  const lang = useLangStore((s) => s.lang)
  const qc = useQueryClient()
  const online = useOnline()
  const [error, setError] = useState<string | null>(null)
  // Which fiscal years are expanded. Unset → defaults to open for the current year, collapsed for
  // the rest (so the screen opens focused on "now" without hiding past/future years).
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({})

  const profileQ = useQuery({
    queryKey: ['business', 'profile'],
    queryFn: () => dataClient.business.getProfile(),
  })
  const isOwner = profileQ.data?.role === 'OWNER'
  const canManage = isOwner && online
  // Today's local date in the business timezone ('YYYY-MM-DD'), for the "current" markers and to
  // gate closing to periods that have actually ended.
  const todayStr = new Date().toLocaleDateString('en-CA', {
    timeZone: profileQ.data?.timezone || 'Africa/Douala',
  })
  const hasEnded = (p: AccountingPeriod) => p.endDate < todayStr
  const isCurrent = (p: AccountingPeriod) => p.startDate <= todayStr && p.endDate >= todayStr
  const isCurrentYear = (fy: FiscalYearWithPeriods) =>
    fy.startDate <= todayStr && fy.endDate >= todayStr
  const isYearOpen = (fy: FiscalYearWithPeriods) => openOverride[fy.id] ?? isCurrentYear(fy)
  const toggleYear = (fy: FiscalYearWithPeriods) =>
    setOpenOverride((prev) => ({ ...prev, [fy.id]: !(prev[fy.id] ?? isCurrentYear(fy)) }))

  const q = useQuery({
    queryKey: ['fiscal', 'calendar'],
    queryFn: () => dataClient.fiscal.calendar(),
    enabled: online,
  })

  // Surface "now" first: the current fiscal year leads (remaining years ascending), and inside
  // each year the current period is pinned to the top (remaining periods in calendar order).
  const data = q.data
  const calendar = useMemo(() => {
    if (!data) return data
    const spans = (start: string, end: string) => start <= todayStr && end >= todayStr
    const years = [...data].sort((a, b) => {
      const r = (spans(a.startDate, a.endDate) ? 0 : 1) - (spans(b.startDate, b.endDate) ? 0 : 1)
      if (r !== 0) return r
      return a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0
    })
    return years.map((fy: FiscalYearWithPeriods) => ({
      ...fy,
      periods: [...fy.periods].sort((a, b) => {
        const r = (spans(a.startDate, a.endDate) ? 0 : 1) - (spans(b.startDate, b.endDate) ? 0 : 1)
        if (r !== 0) return r
        return a.periodNumber - b.periodNumber
      }),
    }))
  }, [data, todayStr])

  const statusLabel = (s: PeriodStatus): string =>
    ({
      [PeriodStatus.OPEN]: t('periods.open'),
      [PeriodStatus.CLOSING]: t('periods.closing'),
      [PeriodStatus.CLOSED]: t('periods.closed'),
      [PeriodStatus.LOCKED]: t('periods.locked'),
    })[s]

  const close = useMutation({
    mutationFn: (id: string) => dataClient.fiscal.closePeriod(id),
    onSuccess: () => {
      setError(null)
      void qc.invalidateQueries({ queryKey: ['fiscal', 'calendar'] })
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const lock = useMutation({
    mutationFn: (id: string) => dataClient.fiscal.lockPeriod(id),
    onSuccess: () => {
      setError(null)
      void qc.invalidateQueries({ queryKey: ['fiscal', 'calendar'] })
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const pendingId =
    (close.isPending ? close.variables : undefined) ?? (lock.isPending ? lock.variables : undefined)

  const action = (p: AccountingPeriod) => {
    if (p.status === PeriodStatus.OPEN) {
      // A period can only be closed after it has ended — never the current or a future month.
      if (!hasEnded(p)) {
        return (
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('periods.notEnded')}</span>
        )
      }
      return (
        <Button
          type="button"
          variant="soft"
          disabled={!canManage || pendingId === p.id}
          onClick={() => close.mutate(p.id)}
        >
          {t('periods.close')}
        </Button>
      )
    }
    if (p.status === PeriodStatus.CLOSED) {
      return (
        <Button
          type="button"
          variant="soft"
          disabled={!canManage || pendingId === p.id}
          onClick={() => lock.mutate(p.id)}
        >
          {t('periods.lock')}
        </Button>
      )
    }
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!online ? (
        <div className="banner">
          <span>{t('periods.onlineOnly')}</span>
        </div>
      ) : !isOwner ? (
        <div className="banner">
          <span>{t('periods.ownerOnly')}</span>
        </div>
      ) : null}
      {error ? (
        <div className="banner warn">
          <span>{error}</span>
        </div>
      ) : null}

      <div className="card">
        <div className="card-h">
          <div>
            <h3>{t('periods.title')}</h3>
            <p>{t('periods.sub')}</p>
          </div>
        </div>

        {q.isLoading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>…</div>
        ) : !calendar || calendar.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('periods.empty')}</div>
        ) : (
          calendar.map((fy) => {
            const open = isYearOpen(fy)
            return (
              <div key={fy.id} style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => toggleYear(fy)}
                  aria-expanded={open}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 4px',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    font: 'inherit',
                    fontWeight: 600,
                    fontSize: 14,
                    textAlign: 'left',
                    color: 'inherit',
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    width={16}
                    height={16}
                    style={{
                      transition: 'transform 0.15s',
                      transform: open ? 'rotate(90deg)' : 'none',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                  <span>
                    {t('periods.fiscalYear')} {fy.label}
                  </span>
                  {isCurrentYear(fy) ? (
                    <span className="st st-ok">
                      <span className="d" />
                      {t('periods.current')}
                    </span>
                  ) : null}
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>
                    {fy.periods.length} {t('periods.period').toLowerCase()}
                  </span>
                </button>
                {open ? (
                  <table className="ltbl" style={{ marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th>{t('periods.period')}</th>
                        <th>{t('periods.dates')}</th>
                        <th>{t('periods.status')}</th>
                        <th className="right">{t('periods.action')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fy.periods.map((p) => (
                        <tr
                          key={p.id}
                          style={
                            isCurrent(p)
                              ? { background: 'var(--surface-2, rgba(0,0,0,0.03))' }
                              : undefined
                          }
                        >
                          <td>
                            {periodLabel(p.label, lang)}
                            {isCurrent(p) ? (
                              <span
                                style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 8 }}
                              >
                                {t('periods.current')}
                              </span>
                            ) : null}
                          </td>
                          <td style={{ color: 'var(--text-2)' }}>
                            {p.startDate} → {p.endDate}
                          </td>
                          <td>
                            <span className={`st ${STATUS_CLASS[p.status]}`}>
                              <span className="d" />
                              {statusLabel(p.status)}
                            </span>
                          </td>
                          <td className="right">{action(p)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
