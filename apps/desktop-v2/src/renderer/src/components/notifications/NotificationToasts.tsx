import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { NotificationItem } from '@biztrack/types'
import { useNotificationsStore } from '@/stores/notifications.store'

/** Stacked transient toasts for freshly-arrived realtime notifications (top-right). */
export function NotificationToasts() {
  const toasts = useNotificationsStore((s) => s.toasts)
  const dismiss = useNotificationsStore((s) => s.dismissToast)
  const markRead = useNotificationsStore((s) => s.markRead)
  const navigate = useNavigate()

  return (
    <div className="ntoasts">
      {toasts.map((entry) => (
        <ToastCard
          key={entry.key}
          notification={entry.notification}
          onDismiss={() => dismiss(entry.key)}
          onOpen={() => {
            void markRead(entry.notification.id)
            if (entry.notification.deeplink) navigate(entry.notification.deeplink)
            dismiss(entry.key)
          }}
        />
      ))}
    </div>
  )
}

function ToastCard({
  notification,
  onDismiss,
  onOpen,
}: {
  notification: NotificationItem
  onDismiss: () => void
  onOpen: () => void
}) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, 6500)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="ntoast" role="status">
      <div className="ntoast-ic">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      </div>
      <button type="button" className="ntoast-body" onClick={onOpen}>
        <span className="ti">{notification.title}</span>
        <span className="bd">{notification.body}</span>
      </button>
      <button type="button" className="ntoast-x" onClick={onDismiss} aria-label="Dismiss">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
