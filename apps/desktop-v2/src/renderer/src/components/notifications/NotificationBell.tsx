import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { NotificationItem } from '@biztrack/types'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'

function timeAgo(iso: string, t: (k: MessageKey) => string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return t('notif.justNow')
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function NotificationBell() {
  const t = useT()
  const navigate = useNavigate()
  const items = useNotificationsStore((s) => s.items)
  const unread = useNotificationsStore((s) => s.unreadCount)
  const markRead = useNotificationsStore((s) => s.markRead)
  const markAllRead = useNotificationsStore((s) => s.markAllRead)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onItem = (n: NotificationItem) => {
    void markRead(n.id)
    setOpen(false)
    if (n.deeplink) navigate(n.deeplink)
  }

  return (
    <div className="nbell" ref={ref}>
      <button
        type="button"
        className="tb-btn app-no-drag"
        onClick={() => setOpen((o) => !o)}
        title={t('notif.title')}
        aria-label={t('notif.title')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 ? <span className="nbell-dot">{unread > 9 ? '9+' : unread}</span> : null}
      </button>

      {open ? (
        <div className="ndrop app-no-drag">
          <div className="ndrop-h">
            <span>{t('notif.title')}</span>
            {unread > 0 ? (
              <button type="button" className="ndrop-all" onClick={() => void markAllRead()}>
                {t('notif.markAll')}
              </button>
            ) : null}
          </div>
          <div className="ndrop-list">
            {items.length === 0 ? (
              <div className="ndrop-empty">{t('notif.empty')}</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`ndrop-it${n.read ? '' : ' unread'}`}
                  onClick={() => onItem(n)}
                >
                  <span className={`dot${n.read ? ' ph' : ''}`} />
                  <span className="tx">
                    <span className="ti">{n.title}</span>
                    <span className="bd">{n.body}</span>
                    <span className="tm">{timeAgo(n.createdAt, t)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
