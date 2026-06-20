import { ipcMain } from 'electron'
import { renderRfqHtml, rfqMessageText } from '@biztrack/templates'
import { IPC, type CreateRfqRequest, type RecordRfqQuoteRequest, type RfqSendChannel, type RfqsQuery } from '../../shared/ipc'
import type { RfqService } from '../services/rfq.service'
import type { DocumentService } from '../services/document.service'

export function registerRfqIpc(rfq: RfqService, documents: DocumentService): void {
  ipcMain.handle(IPC.rfqList, (_e, query?: RfqsQuery) => rfq.list(query))
  ipcMain.handle(IPC.rfqGet, (_e, id: string) => rfq.get(id))
  ipcMain.handle(IPC.rfqCreate, (_e, input: CreateRfqRequest) => rfq.create(input))
  ipcMain.handle(IPC.rfqRecordQuote, (_e, rfqId: string, input: RecordRfqQuoteRequest) => rfq.recordQuote(rfqId, input))
  ipcMain.handle(IPC.rfqBuildDocument, (_e, rfqId: string, supplierId: string) => rfq.buildDocument(rfqId, supplierId))
  ipcMain.handle(IPC.rfqSend, async (_e, rfqId: string, supplierId: string, channel: RfqSendChannel) => {
    const doc = rfq.buildDocument(rfqId, supplierId)
    await documents.share({
      html: renderRfqHtml(doc),
      message: rfqMessageText(doc),
      filename: `${doc.number}-${doc.supplier.name || 'supplier'}`,
      channel,
      phone: doc.supplier.phone,
      email: doc.supplier.email,
      subject: `${doc.business.name} — ${doc.number}`,
    })
    return rfq.markSent(rfqId, [supplierId])
  })
}
