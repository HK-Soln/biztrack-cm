import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input } from '@biztrack/ui/biztrack'
import {
  WEEKDAYS,
  normalizeBusinessHours,
  type BusinessHours,
  type BusinessProfile,
  type Weekday,
} from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'

// Business hours (Settings → Business hours). Per-weekday open/close, server-owned,
// owner-only — drives the daily-digest send time (evaluated in the business timezone).

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

const DAY_LABEL: Record<Weekday, MessageKey> = {
  mon: 'hours.mon',
  tue: 'hours.tue',
  wed: 'hours.wed',
  thu: 'hours.thu',
  fri: 'hours.fri',
  sat: 'hours.sat',
  sun: 'hours.sun',
}

type DayState = { enabled: boolean; open: string; close: string }

function seed(hours: BusinessHours | null): Record<Weekday, DayState> {
  const out = {} as Record<Weekday, DayState>
  for (const d of WEEKDAYS) {
    const h = hours?.[d]
    // Never-set (null) hours default every day open; an explicitly-null day is closed.
    out[d] = h
      ? { enabled: true, open: h.open, close: h.close }
      : { enabled: hours == null, open: '08:00', close: '18:00' }
  }
  return out
}

export function BusinessHoursSection() {
  const t = useT()
  const qc = useQueryClient()
  const online = useOnline()

  const q = useQuery({
    queryKey: ['business', 'profile'],
    queryFn: () => dataClient.business.getProfile(),
  })
  const isOwner = q.data?.role === 'OWNER'
  const canEdit = isOwner && online

  const [days, setDays] = useState<Record<Weekday, DayState> | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (q.data) setDays(seed(q.data.businessHours ?? null))
  }, [q.data])
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast])

  const save = useMutation({
    mutationFn: () => {
      const hours = {} as BusinessHours
      for (const d of WEEKDAYS) {
        const s = days![d]
        hours[d] = s.enabled ? { open: s.open, close: s.close } : null
      }
      return dataClient.business.update({ businessHours: normalizeBusinessHours(hours) })
    },
    onSuccess: (updated) => {
      setToast(t('hours.saved'))
      qc.setQueryData<BusinessProfile | null>(['business', 'profile'], (prev) => ({
        ...updated,
        role: prev?.role ?? updated.role,
      }))
    },
  })

  const setDay = (d: Weekday, patch: Partial<DayState>) =>
    setDays((prev) => (prev ? { ...prev, [d]: { ...prev[d], ...patch } } : prev))

  if (q.isLoading || !days) {
    return (
      <div className="card" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        …
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!online ? (
        <div className="banner">
          <span>{t('hours.onlineOnly')}</span>
        </div>
      ) : !isOwner ? (
        <div className="banner">
          <span>{t('hours.ownerOnly')}</span>
        </div>
      ) : null}

      <div className="card">
        <div className="card-h">
          <div>
            <h3>{t('hours.title')}</h3>
            <p>{t('hours.sub')}</p>
          </div>
        </div>

        <div className="bh-grid">
          {WEEKDAYS.map((d) => {
            const s = days[d]
            return (
              <div className="bh-row" key={d}>
                <div className="bh-day">{t(DAY_LABEL[d])}</div>
                <button
                  type="button"
                  className={`switch${s.enabled ? ' on' : ''}`}
                  aria-pressed={s.enabled}
                  disabled={!canEdit}
                  onClick={() => setDay(d, { enabled: !s.enabled })}
                />
                {s.enabled ? (
                  <div className="bh-times">
                    <Input
                      type="time"
                      value={s.open}
                      disabled={!canEdit}
                      onChange={(e) => setDay(d, { open: e.target.value })}
                    />
                    <span className="bh-dash">–</span>
                    <Input
                      type="time"
                      value={s.close}
                      disabled={!canEdit}
                      onChange={(e) => setDay(d, { close: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="bh-closed">{t('hours.closed')}</div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <Button
            type="button"
            variant="primary"
            disabled={!canEdit || save.isPending}
            onClick={() => save.mutate()}
          >
            {t('hours.save')}
          </Button>
          {toast ? <span style={{ color: 'var(--success)', fontSize: 13 }}>{toast}</span> : null}
        </div>
      </div>
    </div>
  )
}
