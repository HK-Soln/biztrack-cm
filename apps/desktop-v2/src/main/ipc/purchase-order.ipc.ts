import { ipcMain } from 'electron'
import { purchaseOrderMessageText, renderPurchaseOrderHtml } from '@biztrack/templates'
import {
  IPC,
  type ConvertRfqToPoRequest,
  type CreatePurchaseOrderRequest,
  type PurchaseOrderSendChannel,
  type PurchaseOrdersQuery,
} from '../../shared/ipc'
import type { PurchaseOrderService } from '../services/purchase-order.service'
import type { DocumentService } from '../services/document.service'

export function registerPurchaseOrderIpc(po: PurchaseOrderService, documents: DocumentService): void {
  ipcMain.handle(IPC.poList, (_e, query?: PurchaseOrdersQuery) => po.list(query))
  ipcMain.handle(IPC.poGet, (_e, id: string) => po.get(id))
  ipcMain.handle(IPC.poCreate, (_e, input: CreatePurchaseOrderRequest) => po.create(input))
  ipcMain.handle(IPC.poCreateFromRfq, (_e, rfqId: string, input: ConvertRfqToPoRequest) => po.createFromRfq(rfqId, input))
  ipcMain.handle(IPC.poBuildDocument, (_e, poId: string) => po.buildDocument(poId))
  ipcMain.handle(IPC.poCancel, (_e, poId: string) => po.cancel(poId))
  ipcMain.handle(IPC.poSend, async (_e, poId: string, channel: PurchaseOrderSendChannel) => {
    const doc = po.buildDocument(poId)
    await documents.share({
      html: renderPurchaseOrderHtml(doc),
      message: purchaseOrderMessageText(doc),
      filename: `${doc.number}-${doc.supplier.name || 'supplier'}`,
      channel,
      phone: doc.supplier.phone,
      email: doc.supplier.email,
      subject: `${doc.business.name} — ${doc.number}`,
    })
    return po.markSent(poId)
  })
}
