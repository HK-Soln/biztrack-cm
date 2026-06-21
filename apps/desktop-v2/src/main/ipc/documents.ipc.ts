import { dialog, ipcMain } from 'electron'
import { writeFile } from 'fs/promises'
import type { HttpClient } from '@biztrack/http-client'
import { renderPurchaseOrderHtml, renderRfqHtml } from '@biztrack/templates'
import { IPC, type DocumentDownloadInput, type DocumentDownloadResult, type DocumentSendInput, type ShareHtmlPdfInput } from '../../shared/ipc'
import type { RfqService } from '../services/rfq.service'
import type { PurchaseOrderService } from '../services/purchase-order.service'
import type { DocumentService } from '../services/document.service'

/**
 * Procurement document send/download. Online send goes through the API (server renders
 * the PDF + dispatches via Resend/WAHA — keeps title/message + tracking server-side;
 * tokens stay in main). Download renders the PDF locally (works offline) and saves it
 * via a native dialog. Offline "share via apps" (native OS sheet) is handled separately.
 */
export function registerDocumentsIpc(
  rfqs: RfqService,
  purchaseOrders: PurchaseOrderService,
  documents: DocumentService,
  http: HttpClient,
): void {
  ipcMain.handle(IPC.documentsSend, async (_e, input: DocumentSendInput) => {
    if (input.kind === 'rfq') {
      await http.post(`/rfqs/${input.id}/send`, {
        channels: [input.channel],
        supplierIds: input.supplierId ? [input.supplierId] : undefined,
        recipient: input.recipient,
      })
      // Reflect the send in the local copy immediately (server already dispatched).
      rfqs.markSent(input.id, input.supplierId ? [input.supplierId] : undefined)
    } else {
      await http.post(`/purchase-orders/${input.id}/send`, {
        channels: [input.channel],
        recipient: input.recipient,
      })
      purchaseOrders.markSent(input.id)
    }
  })

  ipcMain.handle(IPC.documentsDownload, async (_e, input: DocumentDownloadInput): Promise<DocumentDownloadResult> => {
    const { html, number } =
      input.kind === 'rfq'
        ? (() => {
            const doc = rfqs.buildDocument(input.id, input.supplierId ?? '')
            return { html: renderRfqHtml(doc), number: doc.number }
          })()
        : (() => {
            const doc = purchaseOrders.buildDocument(input.id)
            return { html: renderPurchaseOrderHtml(doc), number: doc.number }
          })()

    const pdf = await documents.renderPdf(html)
    const res = await dialog.showSaveDialog({
      defaultPath: `${number}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (res.canceled || !res.filePath) return { saved: false }
    await writeFile(res.filePath, pdf)
    return { saved: true, path: res.filePath }
  })

  // Generic: render app-generated HTML (e.g. a statement) to PDF + save dialog.
  ipcMain.handle(IPC.documentsDownloadHtml, (_e, html: string, filename: string): Promise<DocumentDownloadResult> => {
    return documents.downloadPdf(html, filename)
  })

  // Generic: share an app-generated HTML doc as a PDF via the WhatsApp/email composer.
  ipcMain.handle(IPC.documentsShareHtml, async (_e, input: ShareHtmlPdfInput) => {
    await documents.share({
      html: input.html,
      message: input.message,
      filename: input.filename,
      channel: input.channel,
      phone: input.phone,
      email: input.email,
      subject: input.subject,
    })
  })
}
