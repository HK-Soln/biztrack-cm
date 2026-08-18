import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Input } from '@biztrack/ui/biztrack'
import {
  NotificationChannel,
  NotificationType,
  type NotificationEvent,
  type NotificationSettings,
} from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'

// Notifications preferences (Settings → Notifications). Server-owned, online-only,
// owner-only — the event×channel matrix, quiet hours and per-recipient event
// subscriptions the NotificationDispatcher reads before fanning any alert out.

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

const I = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    {d}
  </svg>
)

const CHANNELS: Array<{ channel: NotificationChannel; label: MessageKey; icon: ReactNode }> = [
  {
    channel: NotificationChannel.IN_APP,
    label: 'ntf.inapp',
    icon: I(
      <>
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M9 20h6" />
      </>,
    ),
  },
  {
    channel: NotificationChannel.EMAIL,
    label: 'ntf.email',
    icon: I(
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </>,
    ),
  },
  {
    channel: NotificationChannel.SMS,
    label: 'ntf.sms',
    icon: I(
      <>
        <rect x="7" y="3" width="10" height="18" rx="2" />
        <path d="M11 18h2" />
      </>,
    ),
  },
  {
    channel: NotificationChannel.WHATSAPP,
    label: 'ntf.whatsapp',
    icon: I(
      <>
        <path d="M3 21l1.6-5A8 8 0 1 1 8 19.4L3 21Z" />
        <path d="M8.5 9.5c.5 3 3 5.5 6 6" />
      </>,
    ),
  },
]

const EVENTS: Array<{
  event: NotificationEvent
  name: MessageKey
  desc: MessageKey
  icon: ReactNode
}> = [
  {
    event: NotificationType.LOW_STOCK,
    name: 'ntf.lowStock',
    desc: 'ntf.lowStockDesc',
    icon: I(<path d="M3 7h18M3 12h18M3 17h10" />),
  },
  {
    event: NotificationType.NEW_ORDER,
    name: 'ntf.newOrder',
    desc: 'ntf.newOrderDesc',
    icon: I(
      <>
        <path d="M6 8h12l1 12H5L6 8Z" />
        <path d="M9 8a3 3 0 0 1 6 0" />
      </>,
    ),
  },
  {
    event: NotificationType.PAYMENT_RECEIVED,
    name: 'ntf.payment',
    desc: 'ntf.paymentDesc',
    icon: I(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v10M9.5 9.2a2.5 2 0 0 1 5 0c0 2.5-5 1-5 3.6a2.5 2 0 0 0 5 0" />
      </>,
    ),
  },
  {
    event: NotificationType.DEBT_DUE,
    name: 'ntf.debt',
    desc: 'ntf.debtDesc',
    icon: I(
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M9.5 10a2.5 2 0 0 1 5 0c0 2-2.5 1.6-2.5 3.2M12 16h.01" />
      </>,
    ),
  },
  {
    event: NotificationType.DAILY_SUMMARY,
    name: 'ntf.daily',
    desc: 'ntf.dailyDesc',
    icon: I(
      <>
        <path d="M4 20V4M4 20h16" />
        <rect x="7" y="11" width="3" height="6" />
        <rect x="13" y="7" width="3" height="10" />
      </>,
    ),
  },
  {
    event: NotificationType.TEAM_ACTIVITY,
    name: 'ntf.team',
    desc: 'ntf.teamDesc',
    icon: I(
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <path d="M16 5a3 3 0 0 1 0 6" />
      </>,
    ),
  },
  {
    event: NotificationType.BILLING,
    name: 'ntf.billing',
    desc: 'ntf.billingDesc',
    icon: I(<path d="M12 2 4 5v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V5Z" />),
  },
]

export function NotificationsSection() {
  const t = useT()
  const qc = useQueryClient()
  const online = useOnline()

  const profileQ = useQuery({
    queryKey: ['business', 'profile'],
    queryFn: () => dataClient.business.getProfile(),
  })
  const isOwner = profileQ.data?.role === 'OWNER'
  const canEdit = isOwner && online

  const q = useQuery({
    queryKey: ['notificationSettings'],
    queryFn: () => dataClient.notificationSettings.get(),
    enabled: isOwner && online,
  })
  const settings = q.data
  const setData = (s: NotificationSettings) => qc.setQueryData(['notificationSettings'], s)

  const matrixMut = useMutation({
    mutationFn: (toggle: {
      event: NotificationEvent
      channel: NotificationChannel
      enabled: boolean
    }) => dataClient.notificationSettings.updateMatrix({ toggles: [toggle] }),
    onSuccess: setData,
  })
  const quietMut = useMutation({
    mutationFn: (body: { enabled: boolean; from: string; until: string }) =>
      dataClient.notificationSettings.updateQuietHours(body),
    onSuccess: setData,
  })
  const subsMut = useMutation({
    mutationFn: (v: { id: string; event: NotificationEvent; enabled: boolean }) =>
      dataClient.notificationSettings.updateRecipientSubscriptions(v.id, {
        subscriptions: { [v.event]: v.enabled },
      }),
    onSuccess: setData,
  })

  // Quiet hours — seed local state from the server, commit on change/blur.
  const [quiet, setQuiet] = useState(false)
  const [from, setFrom] = useState('21:00')
  const [until, setUntil] = useState('07:00')
  useEffect(() => {
    if (!settings) return
    setQuiet(settings.quietHours.enabled)
    setFrom(settings.quietHours.from)
    setUntil(settings.quietHours.until)
  }, [settings])

  if (!online) {
    return (
      <div className="banner">
        <span>{t('ntf.offline')}</span>
      </div>
    )
  }
  if (profileQ.isSuccess && !isOwner) {
    return (
      <div className="banner">
        <span>{t('ntf.ownerOnly')}</span>
      </div>
    )
  }
  if (q.isLoading || profileQ.isLoading) {
    return (
      <div className="banner">
        <span>{t('ntf.loading')}</span>
      </div>
    )
  }
  if (!settings) return null

  const cellOn = (event: NotificationEvent, channel: NotificationChannel) =>
    settings.matrix.find((m) => m.event === event && m.channel === channel)?.enabled ?? false
  const channelDisabled = (channel: NotificationChannel) =>
    settings.unavailableChannels.includes(channel)

  const commitQuiet = (next: { enabled: boolean; from: string; until: string }) => {
    if (!canEdit) return
    quietMut.mutate(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Matrix */}
      <div className="card">
        <div className="card-h">
          <div>
            <h3>{t('ntf.title')}</h3>
            <p>{t('ntf.sub')}</p>
          </div>
        </div>
        <table className="nmx">
          <thead>
            <tr>
              <th className="evh">{t('ntf.event')}</th>
              {CHANNELS.map((c) => (
                <th key={c.channel}>
                  <div className="chcol">
                    <span className="chi">{c.icon}</span>
                    <span className="chl">{t(c.label)}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EVENTS.map((r) => (
              <tr key={r.event}>
                <td className="evt">
                  <div className="ev">
                    <div className="nm">
                      <span className="ic">{r.icon}</span>
                      {t(r.name)}
                    </div>
                    <div className="ds">{t(r.desc)}</div>
                  </div>
                </td>
                {CHANNELS.map((c) => {
                  const on = cellOn(r.event, c.channel)
                  const disabled = channelDisabled(c.channel) || !canEdit
                  return (
                    <td key={c.channel} className="cell">
                      <button
                        type="button"
                        className={`cbx${on ? ' on' : ''}`}
                        aria-pressed={on}
                        aria-label={`${t(r.name)} · ${t(c.label)}`}
                        disabled={disabled}
                        title={channelDisabled(c.channel) ? t('ntf.smsSoon') : undefined}
                        onClick={() =>
                          matrixMut.mutate({ event: r.event, channel: c.channel, enabled: !on })
                        }
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-note" style={{ marginTop: 18 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
          </svg>
          <span>{t('ntf.smsSoon')}</span>
        </div>
      </div>

      {/* Quiet hours */}
      <div className="card">
        <div className="card-h">
          <div>
            <h3>{t('ntf.quietTitle')}</h3>
            <p>{t('ntf.quietSub')}</p>
          </div>
        </div>
        <div className="set-line">
          <div>
            <div className="nm">{t('ntf.quietEnable')}</div>
            <div className="ds">{t('ntf.quietEnableDesc')}</div>
          </div>
          <button
            type="button"
            className={`switch${quiet ? ' on' : ''}`}
            aria-pressed={quiet}
            disabled={!canEdit}
            onClick={() => {
              const next = !quiet
              setQuiet(next)
              commitQuiet({ enabled: next, from, until })
            }}
          />
        </div>
        <div className="qh" style={{ marginTop: 16 }}>
          <div>
            <label className="lbl">{t('ntf.from')}</label>
            <Input
              type="time"
              value={from}
              disabled={!quiet || !canEdit}
              onChange={(e) => setFrom(e.target.value)}
              onBlur={() => commitQuiet({ enabled: quiet, from, until })}
            />
          </div>
          <div>
            <label className="lbl">{t('ntf.until')}</label>
            <Input
              type="time"
              value={until}
              disabled={!quiet || !canEdit}
              onChange={(e) => setUntil(e.target.value)}
              onBlur={() => commitQuiet({ enabled: quiet, from, until })}
            />
          </div>
        </div>
      </div>

      {/* Recipients + per-recipient event subscriptions */}
      <div className="card">
        <div className="card-h">
          <div>
            <h3>{t('ntf.recipientsTitle')}</h3>
            <p>{t('ntf.recipientsSub')}</p>
          </div>
        </div>
        {settings.recipients.map((rcp) => (
          <div key={rcp.id} className="rcp-row" style={{ flexWrap: 'wrap' }}>
            <div className="av">{(rcp.name || '—').slice(0, 2).toUpperCase()}</div>
            <div style={{ minWidth: 160 }}>
              <div className="nm">
                {rcp.name || rcp.email || rcp.phone || '—'}
                {rcp.isOwner ? ` · ${t('ntf.ownerTag')}` : ''}
              </div>
              <div className="sub">
                {rcp.email
                  ? `${rcp.email}${rcp.emailVerified ? ` · ${t('ntf.emailVerified')}` : ''}`
                  : rcp.phone
                    ? `${rcp.phone}${rcp.phoneVerified ? ` · ${t('ntf.phoneVerified')}` : ''}`
                    : '—'}
              </div>
            </div>
            <div
              className="subs"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginLeft: 'auto' }}
            >
              {EVENTS.map((ev) => {
                const on = Boolean(rcp.subscriptions[ev.event])
                return (
                  <button
                    key={ev.event}
                    type="button"
                    className={`subchip${on ? ' on' : ''}`}
                    aria-pressed={on}
                    disabled={!canEdit}
                    onClick={() => subsMut.mutate({ id: rcp.id, event: ev.event, enabled: !on })}
                  >
                    {t(ev.name)}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
