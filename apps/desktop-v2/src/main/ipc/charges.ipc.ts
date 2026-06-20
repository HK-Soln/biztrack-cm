import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { ChargesService } from '../services/charges.service'

export function registerChargesIpc(charges: ChargesService): void {
  ipcMain.handle(IPC.chargesListActive, () => charges.listActive())
}
