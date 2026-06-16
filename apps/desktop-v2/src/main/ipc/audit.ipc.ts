import { ipcMain } from 'electron'
import { IPC, type AuditListQuery } from '../../shared/ipc'
import type { AuditService } from '../services/audit.service'

export function registerAuditIpc(audit: AuditService): void {
  ipcMain.handle(IPC.auditList, (_e, query?: AuditListQuery) => audit.list(query))
}
