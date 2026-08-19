import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Input, PhoneInput } from '@biztrack/ui/biztrack'
import {
  NotificationChannel,
  NotificationType,
  type AddNotificationRecipientRequest,
  type NotificationEvent,
  type NotificationSettings,
  type UpdateNotificationRecipientRequest,
} from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { isWindows } from '@/lib/titlebar'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'

// On Windows the native title-bar overlay (min/max/close) is drawn above web content;
// start the drawer below it so its ✕ doesn't sit under the OS close button.
const DRAWER_CLASS = `ntf-drawer${isWindows ? ' below-titlebar' : ''}`

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

type RecipientDraft = {
  userId: string | null
  name: string
  email: string
  smsContact: string
  whatsappContact: string
}
const EMPTY_DRAFT: RecipientDraft = {
  userId: null,
  name: '',
  email: '',
  smsContact: '',
  whatsappContact: '',
}

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
  const addMut = useMutation({
    mutationFn: (body: AddNotificationRecipientRequest) =>
      dataClient.notificationSettings.addRecipient(body),
    onSuccess: (s) => {
      setData(s)
      closeAdd()
    },
  })
  const updateMut = useMutation({
    mutationFn: (v: { id: string; body: UpdateNotificationRecipientRequest }) =>
      dataClient.notificationSettings.updateRecipient(v.id, v.body),
    onSuccess: setData,
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => dataClient.notificationSettings.removeRecipient(id),
    onSuccess: (s) => {
      setData(s)
      setSelectedId(null)
    },
  })
  const lookupMut = useMutation({
    mutationFn: (query: string) => dataClient.notificationSettings.lookupContact(query),
    onSuccess: (res) => {
      const query = search.trim()
      if (res.user) {
        setDraft({
          userId: res.user.userId,
          name: res.user.name,
          email: res.user.email ?? '',
          smsContact: res.user.phone ?? '',
          whatsappContact: res.user.phone ?? '',
        })
        setLookupNote(res.existingRecipientId ? t('ntf.alreadyRecipient') : t('ntf.userFound'))
      } else {
        const isEmail = query.includes('@')
        setDraft((d) => ({
          ...d,
          userId: null,
          email: isEmail ? query : d.email,
          smsContact: isEmail ? d.smsContact : query,
          whatsappContact: isEmail ? d.whatsappContact : query,
        }))
        setLookupNote(res.existingRecipientId ? t('ntf.alreadyRecipient') : t('ntf.noUserFound'))
      }
    },
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

  // Recipient drawers + add draft.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [lookupNote, setLookupNote] = useState<string | null>(null)
  const [draft, setDraft] = useState<RecipientDraft>(EMPTY_DRAFT)
  const [smsSame, setSmsSame] = useState(true)
  const [edit, setEdit] = useState<RecipientDraft>(EMPTY_DRAFT)
  const closeAdd = () => {
    setAdding(false)
    setSearch('')
    setLookupNote(null)
    setDraft(EMPTY_DRAFT)
    setSmsSame(true)
  }
  const openRecipient = (r: NotificationSettings['recipients'][number]) => {
    setSelectedId(r.id)
    setEdit({
      userId: r.userId,
      name: r.name,
      email: r.email ?? '',
      smsContact: r.smsContact ?? '',
      whatsappContact: r.whatsappContact ?? '',
    })
  }

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

  const selected = settings.recipients.find((r) => r.id === selectedId) ?? null

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

      {/* Recipients */}
      <div className="card">
        <div className="card-h">
          <div>
            <h3>{t('ntf.recipientsTitle')}</h3>
            <p>{t('ntf.recipientsSub')}</p>
          </div>
          <button
            className="btn"
            type="button"
            style={{ marginLeft: 'auto' }}
            disabled={!canEdit}
            onClick={() => setAdding(true)}
          >
            {t('ntf.addRecipient')}
          </button>
        </div>
        {settings.recipients.map((rcp) => {
          const count = Object.values(rcp.subscriptions).filter(Boolean).length
          return (
            <div
              key={rcp.id}
              className="rcp-row"
              role="button"
              tabIndex={0}
              style={{ cursor: 'pointer' }}
              onClick={() => openRecipient(rcp)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') openRecipient(rcp)
              }}
            >
              <div className="av">{(rcp.name || '—').slice(0, 2).toUpperCase()}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="nm">
                  {rcp.name || '—'}
                  {rcp.isOwner ? ` · ${t('ntf.ownerTag')}` : ''}
                </div>
                <div
                  className="sub"
                  style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
                >
                  {rcp.email && (
                    <span className={`destchip${rcp.emailVerified ? ' ok' : ''}`}>
                      {t('ntf.email')}
                      {rcp.emailVerified ? ' ✓' : ''}
                    </span>
                  )}
                  {rcp.whatsappContact && (
                    <span className={`destchip${rcp.whatsappVerified ? ' ok' : ''}`}>
                      {t('ntf.whatsapp')}
                      {rcp.whatsappVerified ? ' ✓' : ''}
                    </span>
                  )}
                  {rcp.smsContact && (
                    <span className={`destchip${rcp.smsVerified ? ' ok' : ''}`}>
                      {t('ntf.sms')}
                      {rcp.smsVerified ? ' ✓' : ''}
                    </span>
                  )}
                  {!rcp.email && !rcp.whatsappContact && !rcp.smsContact && (
                    <span>{t('ntf.noContacts')}</span>
                  )}
                </div>
              </div>
              <div className="ch">
                <span>{t('ntf.eventsCount').replace('{n}', String(count))}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Recipient detail drawer */}
      {selected && (
        <>
          <div className="ntf-backdrop" onClick={() => setSelectedId(null)} />
          <aside className={DRAWER_CLASS} role="dialog" aria-label={selected.name || 'Recipient'}>
            <div className="ntf-drawer-h">
              <h3>{selected.name || '—'}</h3>
              <button
                type="button"
                className="ntf-x"
                aria-label={t('ntf.cancel')}
                onClick={() => setSelectedId(null)}
              >
                ✕
              </button>
            </div>
            <div className="ntf-drawer-b">
              {selected.isOwner && (
                <span className="destchip ok" style={{ display: 'inline-block', marginBottom: 12 }}>
                  {t('ntf.ownerTag')}
                </span>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label className="lbl">{t('ntf.fullName')}</label>
                  <Input
                    value={edit.name}
                    disabled={!canEdit}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="lbl">{t('ntf.email')}</label>
                  <Input
                    type="email"
                    value={edit.email}
                    disabled={!canEdit}
                    onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="lbl">{t('ntf.whatsappNumber')}</label>
                  <PhoneInput
                    value={edit.whatsappContact}
                    disabled={!canEdit}
                    onChange={(v) => setEdit({ ...edit, whatsappContact: v ?? '' })}
                  />
                </div>
                <div>
                  <label className="lbl">{t('ntf.smsNumber')}</label>
                  <PhoneInput
                    value={edit.smsContact}
                    disabled={!canEdit}
                    onChange={(v) => setEdit({ ...edit, smsContact: v ?? '' })}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ alignSelf: 'flex-start' }}
                  disabled={!canEdit || updateMut.isPending}
                  onClick={() =>
                    updateMut.mutate({
                      id: selected.id,
                      body: {
                        name: edit.name.trim(),
                        email: edit.email.trim() || null,
                        whatsappContact: edit.whatsappContact.trim() || null,
                        smsContact: edit.smsContact.trim() || null,
                      },
                    })
                  }
                >
                  {t('ntf.save')}
                </button>
              </div>

              <h4 style={{ margin: '18px 0 6px' }}>{t('ntf.manageEvents')}</h4>
              {EVENTS.map((ev) => {
                const on = Boolean(selected.subscriptions[ev.event])
                return (
                  <div className="set-line" key={ev.event}>
                    <div>
                      <div className="nm">{t(ev.name)}</div>
                    </div>
                    <button
                      type="button"
                      className={`switch${on ? ' on' : ''}`}
                      aria-pressed={on}
                      disabled={!canEdit || subsMut.isPending}
                      onClick={() =>
                        subsMut.mutate({ id: selected.id, event: ev.event, enabled: !on })
                      }
                    />
                  </div>
                )
              })}

              {!selected.isOwner && (
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ marginTop: 18 }}
                  disabled={!canEdit || deleteMut.isPending}
                  onClick={() => deleteMut.mutate(selected.id)}
                >
                  {t('ntf.delete')}
                </button>
              )}
            </div>
          </aside>
        </>
      )}

      {/* Add recipient drawer */}
      {adding && (
        <>
          <div className="ntf-backdrop" onClick={closeAdd} />
          <aside className={DRAWER_CLASS} role="dialog" aria-label={t('ntf.addRecipient')}>
            <div className="ntf-drawer-h">
              <h3>{t('ntf.addRecipient')}</h3>
              <button
                type="button"
                className="ntf-x"
                aria-label={t('ntf.cancel')}
                onClick={closeAdd}
              >
                ✕
              </button>
            </div>
            <div
              className="ntf-drawer-b"
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div>
                <label className="lbl">{t('ntf.searchContact')}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input
                    value={search}
                    placeholder="email / +237…"
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && search.trim()) lookupMut.mutate(search.trim())
                    }}
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={!search.trim() || lookupMut.isPending}
                    onClick={() => lookupMut.mutate(search.trim())}
                  >
                    {t('ntf.search')}
                  </button>
                </div>
                {lookupNote && (
                  <div className="form-note" style={{ marginTop: 8 }}>
                    <span>{lookupNote}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="lbl">{t('ntf.fullName')}</label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div>
                <label className="lbl">{t('ntf.email')}</label>
                <Input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                />
              </div>
              <div>
                <label className="lbl">{t('ntf.whatsappNumber')}</label>
                <PhoneInput
                  value={draft.whatsappContact}
                  onChange={(v) => setDraft({ ...draft, whatsappContact: v ?? '' })}
                />
              </div>
              <label className="set-line" style={{ cursor: 'pointer' }}>
                <div>
                  <div className="nm">{t('ntf.smsSameAsWhatsapp')}</div>
                </div>
                <input
                  type="checkbox"
                  checked={smsSame}
                  onChange={(e) => setSmsSame(e.target.checked)}
                />
              </label>
              {!smsSame && (
                <div>
                  <label className="lbl">{t('ntf.smsNumber')}</label>
                  <PhoneInput
                    value={draft.smsContact}
                    onChange={(v) => setDraft({ ...draft, smsContact: v ?? '' })}
                  />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!draft.name.trim() || !canEdit || addMut.isPending}
                  onClick={() =>
                    addMut.mutate({
                      userId: draft.userId,
                      name: draft.name.trim(),
                      email: draft.email.trim() || null,
                      whatsappContact: draft.whatsappContact.trim() || null,
                      smsContact:
                        (smsSame ? draft.whatsappContact : draft.smsContact).trim() || null,
                    })
                  }
                >
                  {t('ntf.save')}
                </button>
                <button type="button" className="btn" onClick={closeAdd}>
                  {t('ntf.cancel')}
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
