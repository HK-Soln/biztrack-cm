import { ipcMain } from 'electron'
import type { UpdateBusinessRequest } from '@biztrack/types'
import { IPC } from '../../shared/ipc'
import type { BusinessService } from '../services/business.service'

export function registerBusinessIpc(business: BusinessService): void {
  ipcMain.handle(IPC.businessGetProfile, () => business.getProfile())
  ipcMain.handle(IPC.businessUpdate, (_e, payload: UpdateBusinessRequest) => business.update(payload))
}
