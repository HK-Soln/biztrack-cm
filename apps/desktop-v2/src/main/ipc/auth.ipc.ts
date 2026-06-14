import { ipcMain } from 'electron'
import { IPC, type OtpChannel, type RegisterPayload } from '../../shared/ipc'
import type { AuthService } from '../services/auth.service'

export function registerAuthIpc(auth: AuthService): void {
  ipcMain.handle(IPC.authGetSession, () => auth.getSession())
  ipcMain.handle(IPC.authLogin, (_e, identifier: string, password: string) => auth.login(identifier, password))
  ipcMain.handle(IPC.authRequestLogin, (_e, identifier: string, channel?: OtpChannel) =>
    auth.requestLogin(identifier, channel),
  )
  ipcMain.handle(IPC.authLoginOtp, (_e, identifier: string, code: string) => auth.loginOtp(identifier, code))
  ipcMain.handle(IPC.authVerifyPhone, (_e, phone: string, code: string) => auth.verifyPhone(phone, code))
  ipcMain.handle(IPC.authVerifyEmail, (_e, email: string, code: string) => auth.verifyEmail(email, code))
  ipcMain.handle(IPC.authResendOtp, (_e, identifier: string, type: string, channel?: OtpChannel) =>
    auth.resendOtp(identifier, type, channel),
  )
  ipcMain.handle(IPC.authRegister, (_e, payload: RegisterPayload) => auth.register(payload))
  ipcMain.handle(IPC.authSelectBusiness, (_e, businessId: string) => auth.selectBusiness(businessId))
  ipcMain.handle(IPC.authListBusinesses, () => auth.listBusinesses())
  ipcMain.handle(IPC.authOfflineLogin, (_e, password: string) => auth.offlineLogin(password))
  ipcMain.handle(IPC.authLogout, () => auth.logout())
}
