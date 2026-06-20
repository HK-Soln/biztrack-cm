import { ipcMain } from 'electron'
import type { HttpClient } from '@biztrack/http-client'
import { renderSaleReceiptHtml, saleReceiptLabels, formatMoney } from '@biztrack/templates'
import {
  IPC,
  type DocumentRecipient,
  type DocumentSendChannel,
  type SaleInput,
  type SalesListQuery,
} from '../../shared/ipc'
import type { SalesService } from '../services/sales.service'
import type { SavingsService } from '../services/savings.service'
import type { DocumentService } from '../services/document.service'

const RECEIPT_WIDTH_MM = 58

export function registerSalesIpc(
  sales: SalesService,
  savings: SavingsService,
  documents: DocumentService,
  http: HttpClient,
): void {
  ipcMain.handle(IPC.salesCreate, (_e, input: SaleInput) => sales.createSale(input))
  ipcMain.handle(IPC.salesList, (_e, query?: SalesListQuery) => sales.list(query))
  ipcMain.handle(IPC.salesGet, (_e, id: string) => sales.get(id))
  ipcMain.handle(IPC.savingsGetForCustomer, (_e, customerId: string) => savings.getForCustomer(customerId))

  // Print the receipt straight to the connected printer (no dialog); saves + reveals a
  // PDF if there's no printer or the job fails.
  ipcMain.handle(IPC.salesPrintReceipt, async (_e, saleId: string, locale: string) => {
    const built = sales.buildReceipt(saleId)
    if (!built) throw new Error('Sale not found.')
    const html = renderSaleReceiptHtml(built.receipt, { labels: saleReceiptLabels(locale), locale })
    return documents.printReceipt(html, { filename: `receipt-${built.receipt.saleNumber}`, paperWidthMm: RECEIPT_WIDTH_MM })
  })

  // Send the receipt to the customer. Online → the server renders + dispatches (Resend/
  // WAHA), same as RFQ/PO. Offline → open the desktop WhatsApp/email share composer.
  ipcMain.handle(
    IPC.salesSendReceipt,
    async (_e, saleId: string, channel: DocumentSendChannel, locale: string, opts?: { recipient?: DocumentRecipient; online?: boolean }) => {
      const built = sales.buildReceipt(saleId)
      if (!built) throw new Error('Sale not found.')
      const { receipt } = built
      const phone = opts?.recipient?.phone ?? built.phone
      const email = opts?.recipient?.email ?? built.email

      if (opts?.online) {
        try {
          // Server renders + dispatches (Resend/WAHA). Falls back to the local composer
          // below if it fails — e.g. the just-made sale hasn't synced to the server yet.
          await http.post(`/sales/${saleId}/send`, { channels: [channel], locale, recipient: { phone, email } })
          return
        } catch {
          /* fall through to the offline share composer */
        }
      }

      const html = renderSaleReceiptHtml(receipt, { labels: saleReceiptLabels(locale), locale })
      const currency = (receipt.currency as string) || 'XAF'
      const message = `${receipt.businessName} — ${receipt.saleNumber} · ${formatMoney(receipt.totalAmount, currency, locale)}`
      await documents.share({
        html,
        message,
        filename: `receipt-${receipt.saleNumber}`,
        channel,
        phone,
        email,
        subject: `${receipt.businessName} — ${receipt.saleNumber}`,
      })
    },
  )
}
