import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { PinService } from '../services/pin.service'

export function registerPinIpc(pin: PinService): void {
  ipcMain.handle(IPC.pinSet, (_e, code: string) => pin.setPin(code))
  ipcMain.handle(IPC.pinVerify, (_e, code: string) => pin.verifyManagerPin(code))
  ipcMain.handle(IPC.pinVerifyCard, (_e, token: string) => pin.verifyCard(token))
  ipcMain.handle(IPC.pinCanManage, () => pin.canManage())
}
