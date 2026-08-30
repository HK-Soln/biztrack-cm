import { ipcMain } from 'electron'
import type { BusinessProfile, UpdateBusinessRequest } from '@biztrack/types'
import { IPC } from '../../shared/ipc'
import type { BusinessService } from '../services/business.service'

export function registerBusinessIpc(
  business: BusinessService,
  // Called with the saved profile so the caller can keep the live session in step (e.g. the
  // allowed step-up methods, which the toggle + step-up modal read from the session).
  onUpdated?: (profile: BusinessProfile) => void,
): void {
  ipcMain.handle(IPC.businessGetProfile, () => business.getProfile())
  ipcMain.handle(IPC.businessUpdate, async (_e, payload: UpdateBusinessRequest) => {
    const profile = await business.update(payload)
    onUpdated?.(profile)
    return profile
  })
}
