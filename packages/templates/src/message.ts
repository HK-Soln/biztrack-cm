import type { PurchaseOrderDocument, RfqDocument } from '@biztrack/types'
import { formatMoney } from './format'

// Plain-text message bodies for WhatsApp / email composers (no HTML). The PDF
// carries the detail; this is the accompanying note. Kept short and neutral.

export function purchaseOrderMessageText(doc: PurchaseOrderDocument): string {
  const locale = doc.locale ?? 'fr'
  const lines = doc.items.map((it) => `• ${it.description} ×${it.quantity}`)
  const parts = [
    `${doc.business.name}`,
    `Purchase Order ${doc.number}`,
    doc.title ? doc.title : null,
    '',
    `${doc.items.length} item(s):`,
    ...lines,
    '',
    `Total: ${formatMoney(doc.total, doc.currency, locale)}`,
    doc.messageBody ? `\n${doc.messageBody}` : null,
  ]
  return parts.filter((p) => p !== null).join('\n').trim()
}

export function rfqMessageText(doc: RfqDocument): string {
  const lines = doc.items.map((it) => `• ${it.description} ×${it.quantity}`)
  const parts = [
    `${doc.business.name}`,
    `Request for Quotation ${doc.number}`,
    doc.title ? doc.title : null,
    '',
    `Please quote your best price for:`,
    ...lines,
    doc.messageBody ? `\n${doc.messageBody}` : null,
  ]
  return parts.filter((p) => p !== null).join('\n').trim()
}
