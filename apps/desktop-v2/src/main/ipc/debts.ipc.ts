import { ipcMain } from 'electron'
import { IPC, type DebtsQuery, type RecordDebtPaymentRequest } from '../../shared/ipc'
import type { DebtsService } from '../services/debts.service'

export function registerDebtsIpc(debts: DebtsService): void {
  ipcMain.handle(IPC.debtsListByContact, (_e, contactId: string, query?: DebtsQuery) => debts.listByContact(contactId, query))
  ipcMain.handle(IPC.debtsRecordPayment, (_e, debtId: string, input: RecordDebtPaymentRequest) => debts.recordPayment(debtId, input))
}
