import { ipcMain } from 'electron'
import type { RealtimeClient } from '@biztrack/electron-core'
import type { ListNotificationsQuery } from '@biztrack/types'
import { IPC } from '../../shared/ipc'
import type { NotificationsService } from '../services/notifications.service'

export function registerNotificationsIpc(
  notifications: NotificationsService,
  realtime: RealtimeClient,
): void {
  // Feed
  ipcMain.handle(IPC.notificationsList, (_e, query?: ListNotificationsQuery) => notifications.list(query))
  ipcMain.handle(IPC.notificationsUnreadCount, () => notifications.unreadCount())
  ipcMain.handle(IPC.notificationsMarkRead, (_e, id: string) => notifications.markRead(id))
  ipcMain.handle(IPC.notificationsMarkAllRead, () => notifications.markAllRead())
  // Realtime (re)connect — the renderer calls this once authenticated.
  ipcMain.handle(IPC.notificationsConnect, () => {
    realtime.start()
  })

  // Invitee-side invitations
  ipcMain.handle(IPC.invitationsList, () => notifications.listInvitations())
  ipcMain.handle(IPC.invitationsAccept, (_e, businessId: string) => notifications.acceptInvitation(businessId))
  ipcMain.handle(IPC.invitationsReject, (_e, businessId: string) => notifications.rejectInvitation(businessId))
}
