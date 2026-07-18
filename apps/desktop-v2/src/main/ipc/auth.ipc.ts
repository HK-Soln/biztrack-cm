import { ipcMain } from 'electron'
import {
  IPC,
  type BillingCycle,
  type BusinessSetupPayload,
  type OtpChannel,
  type RegisterPayload,
} from '../../shared/ipc'
import type { AuthService } from '../services/auth.service'

export function registerAuthIpc(auth: AuthService): void {
  ipcMain.handle(IPC.authGetSession, () => auth.getSession())
  ipcMain.handle(IPC.authLogin, (_e, identifier: string, password: string) =>
    auth.login(identifier, password),
  )
  ipcMain.handle(IPC.authRequestLogin, (_e, identifier: string, channel?: OtpChannel) =>
    auth.requestLogin(identifier, channel),
  )
  ipcMain.handle(IPC.authLoginOtp, (_e, identifier: string, code: string) =>
    auth.loginOtp(identifier, code),
  )
  ipcMain.handle(IPC.authRequestPasswordReset, (_e, identifier: string, channel?: OtpChannel) =>
    auth.requestPasswordReset(identifier, channel),
  )
  ipcMain.handle(
    IPC.authResetPassword,
    (_e, identifier: string, code: string, newPassword: string) =>
      auth.resetPassword(identifier, code, newPassword),
  )
  ipcMain.handle(IPC.authVerifyPhone, (_e, phone: string, code: string, inviteToken?: string) =>
    auth.verifyPhone(phone, code, inviteToken),
  )
  ipcMain.handle(IPC.authVerifyEmail, (_e, email: string, code: string, inviteToken?: string) =>
    auth.verifyEmail(email, code, inviteToken),
  )
  ipcMain.handle(IPC.authResendOtp, (_e, identifier: string, type: string, channel?: OtpChannel) =>
    auth.resendOtp(identifier, type, channel),
  )
  ipcMain.handle(IPC.authRegister, (_e, payload: RegisterPayload) => auth.register(payload))
  ipcMain.handle(IPC.authInvitePreview, (_e, token: string) => auth.getInvitePreview(token))
  ipcMain.handle(IPC.authAcceptInvite, (_e, token: string) => auth.acceptInvite(token))
  ipcMain.handle(IPC.authRejectInvite, (_e, token: string) => auth.rejectInvite(token))
  ipcMain.handle(IPC.authSetupBusiness, (_e, payload: BusinessSetupPayload) =>
    auth.setupBusiness(payload),
  )
  ipcMain.handle(IPC.authListPlans, () => auth.listPlans())
  ipcMain.handle(IPC.authSelectPlan, (_e, plan: string, billingCycle?: BillingCycle) =>
    auth.selectPlan(plan, billingCycle),
  )
  ipcMain.handle(IPC.authSelectBusiness, (_e, businessId: string) =>
    auth.selectBusiness(businessId),
  )
  ipcMain.handle(IPC.authListBusinesses, () => auth.listBusinesses())
  ipcMain.handle(IPC.authOfflineLogin, (_e, password: string) => auth.offlineLogin(password))
  ipcMain.handle(IPC.authLogout, () => auth.logout())
}
