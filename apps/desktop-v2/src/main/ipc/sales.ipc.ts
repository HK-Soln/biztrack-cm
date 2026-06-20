import { ipcMain } from 'electron'
import { renderSaleReceiptHtml, saleReceiptLabels, formatMoney } from '@biztrack/templates'
import { IPC, type DocumentSendChannel, type SaleInput, type SalesListQuery } from '../../shared/ipc'
import type { SalesService } from '../services/sales.service'
import type { SavingsService } from '../services/savings.service'
import type { DocumentService } from '../services/document.service'

export function registerSalesIpc(sales: SalesService, savings: SavingsService, documents: DocumentService): void {
  ipcMain.handle(IPC.salesCreate, (_e, input: SaleInput) => sales.createSale(input))
  ipcMain.handle(IPC.salesList, (_e, query?: SalesListQuery) => sales.list(query))
  ipcMain.handle(IPC.salesGet, (_e, id: string) => sales.get(id))
  ipcMain.handle(IPC.savingsGetForCustomer, (_e, customerId: string) => savings.getForCustomer(customerId))

  // Render the shared receipt template → PDF and open the WhatsApp/email composer
  // addressed to the customer (mirrors the RFQ/PO offline share path).
  ipcMain.handle(IPC.salesSendReceipt, async (_e, saleId: string, channel: DocumentSendChannel, locale: string) => {
    const built = sales.buildReceipt(saleId)
    if (!built) throw new Error('Sale not found.')
    const { receipt, phone, email } = built
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
  })
}
