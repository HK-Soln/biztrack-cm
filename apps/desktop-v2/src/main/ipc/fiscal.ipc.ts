import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { FiscalService } from '../services/fiscal.service'

export function registerFiscalIpc(service: FiscalService): void {
  ipcMain.handle(IPC.fiscalCalendar, () => service.calendar())
  ipcMain.handle(IPC.fiscalAdjustments, () => service.adjustments())
  ipcMain.handle(IPC.fiscalClosePeriod, (_e, id: string) => service.closePeriod(id))
  ipcMain.handle(IPC.fiscalLockPeriod, (_e, id: string) => service.lockPeriod(id))
}
