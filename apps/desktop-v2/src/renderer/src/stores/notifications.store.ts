import { create } from 'zustand'
import type { NotificationItem } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'

interface ToastEntry {
  key: number
  notification: NotificationItem
}

interface NotificationsState {
  items: NotificationItem[]
  unreadCount: number
  loaded: boolean
  /** Transient toasts shown for freshly-arrived realtime notifications. */
  toasts: ToastEntry[]
  load: () => Promise<void>
  /** Called when a realtime `notification` event arrives. */
  receive: (item: NotificationItem, unreadCount: number) => void
  dismissToast: (key: number) => void
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

let toastSeq = 0

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: [],
  unreadCount: 0,
  loaded: false,
  toasts: [],

  load: async () => {
    try {
      const res = await dataClient.notifications.list({ limit: 20 })
      set({ items: res.items, unreadCount: res.unreadCount, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  receive: (item, unreadCount) => {
    set((s) => ({
      items: [item, ...s.items.filter((i) => i.id !== item.id)].slice(0, 50),
      unreadCount,
      toasts: [...s.toasts, { key: ++toastSeq, notification: item }],
    }))
  },

  dismissToast: (key) => set((s) => ({ toasts: s.toasts.filter((t) => t.key !== key) })),

  markRead: async (id) => {
    const item = get().items.find((i) => i.id === id)
    if (!item || item.read) return
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, read: true } : i)),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }))
    try {
      await dataClient.notifications.markRead(id)
    } catch {
      /* optimistic; ignore */
    }
  },

  markAllRead: async () => {
    if (get().unreadCount === 0) return
    set((s) => ({ items: s.items.map((i) => ({ ...i, read: true })), unreadCount: 0 }))
    try {
      await dataClient.notifications.markAllRead()
    } catch {
      /* optimistic; ignore */
    }
  },
}))
