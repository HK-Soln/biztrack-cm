import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@biztrack/ui/biztrack'
import { PeriodStatus, type AccountingPeriod } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { useT } from '@/i18n'
import { errorMessage } from '@/lib/error'

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
  const qc = useQueryClient()
  const online = useOnline()
  const [error, setError] = useState<string | null>(null)

  const profileQ = useQuery({
    queryKey: ['business', 'profile'],
    queryFn: () => dataClient.business.getProfile(),
  })
  const isOwner = profileQ.data?.role === 'OWNER'
  const canManage = isOwner && online

  const q = useQuery({
    queryKey: ['fiscal', 'calendar'],
    queryFn: () => dataClient.fiscal.calendar(),
    enabled: online,
  })

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
        ) : !q.data || q.data.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('periods.empty')}</div>
        ) : (
          q.data.map((fy) => (
            <div key={fy.id} style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
                {t('periods.fiscalYear')} {fy.label}
              </div>
              <table className="ltbl">
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
                    <tr key={p.id}>
                      <td>{p.label}</td>
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
            </div>
          ))
        )}
      </div>
    </div>
  )
}
