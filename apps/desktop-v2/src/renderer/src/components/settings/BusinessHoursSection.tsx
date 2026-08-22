import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, CommandSelect, Input, type CommandSelectOption } from '@biztrack/ui/biztrack'
import {
  DEFAULT_CREDIT_DAYS,
  MAX_CREDIT_DAYS,
  WEEKDAYS,
  clampCreditDays,
  normalizeBusinessHours,
  type BusinessHours,
  type BusinessProfile,
  type Weekday,
} from '@biztrack/types'
import {
  DEFAULT_BUSINESS_TIMEZONE,
  DEFAULT_DAY_CUTOVER,
  normalizeDayCutover,
} from '@biztrack/utils'
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
  const [creditDays, setCreditDays] = useState(String(DEFAULT_CREDIT_DAYS))
  const [tz, setTz] = useState(DEFAULT_BUSINESS_TIMEZONE)
  const [cutover, setCutover] = useState(DEFAULT_DAY_CUTOVER)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (q.data) {
      setDays(seed(q.data.businessHours ?? null))
      setCreditDays(String(q.data.defaultCreditDays ?? DEFAULT_CREDIT_DAYS))
      setTz(q.data.timezone || DEFAULT_BUSINESS_TIMEZONE)
      setCutover(q.data.dayCutoverTime || DEFAULT_DAY_CUTOVER)
    }
  }, [q.data])

  const { data: timezones = [] } = useQuery({
    queryKey: ['notificationSettings', 'timezones'],
    queryFn: () => dataClient.notificationSettings.listTimezones(),
  })
  const loadTimezones = useCallback(
    (searchText: string): Promise<CommandSelectOption[]> => {
      const list = timezones.length ? timezones : [tz]
      const q2 = searchText.trim().toLowerCase()
      const filtered = q2 ? list.filter((z) => z.toLowerCase().includes(q2)) : list
      return Promise.resolve(filtered.slice(0, 100).map((z) => ({ value: z, label: z })))
    },
    [timezones, tz],
  )
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

  const creditSave = useMutation({
    mutationFn: () =>
      dataClient.business.update({ defaultCreditDays: clampCreditDays(Number(creditDays)) }),
    onSuccess: (updated) => {
      setToast(t('hours.saved'))
      setCreditDays(String(updated.defaultCreditDays ?? DEFAULT_CREDIT_DAYS))
      qc.setQueryData<BusinessProfile | null>(['business', 'profile'], (prev) => ({
        ...updated,
        role: prev?.role ?? updated.role,
      }))
    },
  })

  const calendarSave = useMutation({
    mutationFn: () =>
      dataClient.business.update({ timezone: tz, dayCutoverTime: normalizeDayCutover(cutover) }),
    onSuccess: (updated) => {
      setToast(t('hours.saved'))
      setTz(updated.timezone || DEFAULT_BUSINESS_TIMEZONE)
      setCutover(updated.dayCutoverTime || DEFAULT_DAY_CUTOVER)
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

      <div className="card">
        <div className="card-h">
          <div>
            <h3>{t('credit.title')}</h3>
            <p>{t('credit.sub')}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, maxWidth: 320 }}>
          <div style={{ flex: 1 }}>
            <label className="lbl">{t('credit.label')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Input
                type="number"
                min={0}
                max={MAX_CREDIT_DAYS}
                value={creditDays}
                disabled={!canEdit}
                onChange={(e) => setCreditDays(e.target.value)}
              />
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('credit.unit')}</span>
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            disabled={!canEdit || creditSave.isPending}
            onClick={() => creditSave.mutate()}
          >
            {t('hours.save')}
          </Button>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div>
            <h3>{t('calendar.title')}</h3>
            <p>{t('calendar.sub')}</p>
          </div>
        </div>
        <div className="field-row">
          <div>
            <label className="lbl">{t('calendar.timezone')}</label>
            <CommandSelect
              value={tz}
              disabled={!canEdit}
              loadOptions={loadTimezones}
              searchPlaceholder={t('calendar.timezoneSearch')}
              onChange={(v) => setTz(v || DEFAULT_BUSINESS_TIMEZONE)}
            />
            <div className="help">{t('calendar.timezoneHelp')}</div>
          </div>
          <div>
            <label className="lbl">{t('calendar.cutover')}</label>
            <Input
              type="time"
              value={cutover}
              disabled={!canEdit}
              onChange={(e) => setCutover(e.target.value)}
            />
            <div className="help">{t('calendar.cutoverHelp')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <Button
            type="button"
            variant="primary"
            disabled={!canEdit || calendarSave.isPending}
            onClick={() => calendarSave.mutate()}
          >
            {t('hours.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
