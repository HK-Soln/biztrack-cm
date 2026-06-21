import { ipcMain } from 'electron'
import { renderDepositReceiptHtml, depositReceiptLabels, renderDepositReportHtml, depositReportLabels } from '@biztrack/templates'
import {
  IPC,
  type AddDepositPaymentInput,
  type CloseDepositInput,
  type CreateDepositInput,
  type DepositsListQuery,
} from '../../shared/ipc'
import type { SavingsService } from '../services/savings.service'

export function registerDepositsIpc(deposits: SavingsService): void {
  ipcMain.handle(IPC.depositsList, (_e, query?: DepositsListQuery) => deposits.list(query))
  ipcMain.handle(IPC.depositsGet, (_e, id: string) => deposits.get(id))
  ipcMain.handle(IPC.depositsStatement, (_e, id: string) => deposits.statement(id))
  ipcMain.handle(IPC.depositsSummary, () => deposits.summary())
  ipcMain.handle(IPC.depositsCreate, (_e, input: CreateDepositInput) => deposits.createSession(input))
  ipcMain.handle(IPC.depositsAddPayment, (_e, id: string, input: AddDepositPaymentInput) => deposits.addPayment(id, input))
  ipcMain.handle(IPC.depositsClose, (_e, id: string, input: CloseDepositInput) => deposits.close(id, input))

  // Receipt (per transaction) + full session report — both rendered to HTML; sharing/download
  // goes through the shared documents path (DocumentShareDialog), same as RFQ/PO/sale receipts.
  ipcMain.handle(IPC.depositsReceiptHtml, (_e, transactionId: string, locale: string) => {
    const built = deposits.buildDepositReceipt(transactionId)
    return built ? renderDepositReceiptHtml(built.receipt, { labels: depositReceiptLabels(locale), locale }) : null
  })
  ipcMain.handle(IPC.depositsReportHtml, (_e, id: string, locale: string) => {
    const built = deposits.buildDepositReport(id)
    return built ? renderDepositReportHtml(built.report, { labels: depositReportLabels(locale), locale }) : null
  })
}
