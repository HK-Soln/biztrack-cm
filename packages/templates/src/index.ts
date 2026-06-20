// @biztrack/templates — shareable document templates compiled by both the API
// and the desktop app so generated PDFs/messages are identical everywhere.
export { renderPurchaseOrderHtml } from './purchase-order.template'
export { renderRfqHtml } from './rfq.template'
export { renderSaleReceiptHtml } from './sale-receipt.template'
export type { SaleReceiptLabels, SaleReceiptOptions } from './sale-receipt.template'
export { purchaseOrderMessageText, rfqMessageText } from './message'
export { DOCUMENT_CSS } from './styles'
export { formatMoney, formatNumber, escapeHtml, escapeMultiline } from './format'
