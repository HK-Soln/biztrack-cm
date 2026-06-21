import { ipcMain } from 'electron'
import { renderDepositReceiptHtml, depositReceiptLabels, formatMoney } from '@biztrack/templates'
import {
  IPC,
  type AddDepositPaymentInput,
  type CloseDepositInput,
  type CreateDepositInput,
  type DepositsListQuery,
  type DocumentRecipient,
  type DocumentSendChannel,
} from '../../shared/ipc'
import type { SavingsService } from '../services/savings.service'
import type { DocumentService } from '../services/document.service'

const RECEIPT_WIDTH_MM = 58

export function registerDepositsIpc(deposits: SavingsService, documents: DocumentService): void {
  ipcMain.handle(IPC.depositsList, (_e, query?: DepositsListQuery) => deposits.list(query))
  ipcMain.handle(IPC.depositsGet, (_e, id: string) => deposits.get(id))
  ipcMain.handle(IPC.depositsStatement, (_e, id: string) => deposits.statement(id))
  ipcMain.handle(IPC.depositsSummary, () => deposits.summary())
  ipcMain.handle(IPC.depositsCreate, (_e, input: CreateDepositInput) => deposits.createSession(input))
  ipcMain.handle(IPC.depositsAddPayment, (_e, id: string, input: AddDepositPaymentInput) => deposits.addPayment(id, input))
  ipcMain.handle(IPC.depositsClose, (_e, id: string, input: CloseDepositInput) => deposits.close(id, input))

  ipcMain.handle(IPC.depositsReceiptHtml, (_e, transactionId: string, locale: string) => {
    const built = deposits.buildDepositReceipt(transactionId)
    if (!built) return null
    return renderDepositReceiptHtml(built.receipt, { labels: depositReceiptLabels(locale), locale })
  })

  ipcMain.handle(IPC.depositsPrintReceipt, async (_e, transactionId: string, locale: string) => {
    const built = deposits.buildDepositReceipt(transactionId)
    if (!built) throw new Error('Deposit receipt not found.')
    const html = renderDepositReceiptHtml(built.receipt, { labels: depositReceiptLabels(locale), locale })
    return documents.printReceipt(html, { filename: built.receipt.receiptNumber, paperWidthMm: RECEIPT_WIDTH_MM })
  })

  ipcMain.handle(IPC.depositsDownloadReceipt, async (_e, transactionId: string, locale: string) => {
    const built = deposits.buildDepositReceipt(transactionId)
    if (!built) throw new Error('Deposit receipt not found.')
    const html = renderDepositReceiptHtml(built.receipt, { labels: depositReceiptLabels(locale), locale })
    return documents.downloadPdf(html, built.receipt.receiptNumber)
  })

  ipcMain.handle(
    IPC.depositsSendReceipt,
    async (_e, transactionId: string, channel: DocumentSendChannel, locale: string, opts?: { recipient?: DocumentRecipient }) => {
      const built = deposits.buildDepositReceipt(transactionId)
      if (!built) throw new Error('Deposit receipt not found.')
      const { receipt } = built
      const html = renderDepositReceiptHtml(receipt, { labels: depositReceiptLabels(locale), locale })
      const currency = (receipt.currency as string) || 'XAF'
      await documents.share({
        html,
        message: `${receipt.businessName} — ${receipt.receiptNumber} · ${formatMoney(receipt.amount, currency, locale)}`,
        filename: receipt.receiptNumber,
        channel,
        phone: opts?.recipient?.phone ?? built.phone,
        email: opts?.recipient?.email ?? built.email,
        subject: `${receipt.businessName} — ${receipt.receiptNumber}`,
      })
    },
  )
}
