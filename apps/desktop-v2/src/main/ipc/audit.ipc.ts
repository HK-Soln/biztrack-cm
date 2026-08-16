import { ipcMain } from 'electron'
import { IPC, type AuditListQuery, type SaleLineRemovedInput } from '../../shared/ipc'
import type { AuditService } from '../services/audit.service'

export function registerAuditIpc(audit: AuditService): void {
  ipcMain.handle(IPC.auditList, (_e, query?: AuditListQuery) => audit.list(query))
  // Held-cart line removed before checkout (BIZ-2.9) — local-only (no DB row exists).
  ipcMain.handle(IPC.auditSaleLineRemoved, (_e, input: SaleLineRemovedInput) => {
    audit.log({
      action: 'SALE_LINE_REMOVED',
      entityType: 'sale_line',
      entityId: input.productId,
      entityLabel: input.productName,
      amount: Math.round((input.unitPrice ?? 0) * (input.quantity ?? 0)),
      changes: {
        before: { quantity: input.quantity, unitPrice: input.unitPrice },
        after: null,
      },
    })
  })
}
