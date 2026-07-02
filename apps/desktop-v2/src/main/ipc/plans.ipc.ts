import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { PlansService } from '../services/plans.service'

export function registerPlansIpc(plans: PlansService): void {
  ipcMain.handle(IPC.plansList, () => plans.listPlans())
  ipcMain.handle(IPC.plansSubscription, () => plans.mySubscription())
  ipcMain.handle(IPC.plansQuotaUsage, () => plans.quotaUsage())
  ipcMain.handle(IPC.plansUpgrade, (_e, plan: string) => plans.upgrade(plan))
  ipcMain.handle(IPC.plansCancel, () => plans.cancel())
}
