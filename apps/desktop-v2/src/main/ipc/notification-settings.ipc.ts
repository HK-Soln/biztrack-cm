import { ipcMain } from 'electron'
import type {
  AddNotificationRecipientRequest,
  UpdateNotificationMatrixRequest,
  UpdateNotificationQuietHoursRequest,
  UpdateRecipientSubscriptionsRequest,
} from '@biztrack/types'
import { IPC } from '../../shared/ipc'
import type { NotificationSettingsService } from '../services/notification-settings.service'

export function registerNotificationSettingsIpc(service: NotificationSettingsService): void {
  ipcMain.handle(IPC.notificationSettingsGet, () => service.get())
  ipcMain.handle(
    IPC.notificationSettingsUpdateMatrix,
    (_e, body: UpdateNotificationMatrixRequest) => service.updateMatrix(body),
  )
  ipcMain.handle(
    IPC.notificationSettingsUpdateQuietHours,
    (_e, body: UpdateNotificationQuietHoursRequest) => service.updateQuietHours(body),
  )
  ipcMain.handle(
    IPC.notificationSettingsAddRecipient,
    (_e, body: AddNotificationRecipientRequest) => service.addRecipient(body),
  )
  ipcMain.handle(
    IPC.notificationSettingsUpdateRecipientSubs,
    (_e, id: string, body: UpdateRecipientSubscriptionsRequest) =>
      service.updateRecipientSubscriptions(id, body),
  )
  ipcMain.handle(IPC.notificationSettingsRemoveRecipient, (_e, id: string) =>
    service.removeRecipient(id),
  )
}
