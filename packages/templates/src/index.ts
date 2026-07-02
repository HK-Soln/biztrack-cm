// @biztrack/templates — shareable document templates compiled by both the API
// and the desktop app so generated PDFs/messages are identical everywhere.
export { renderPurchaseOrderHtml } from './purchase-order.template'
export { renderRfqHtml } from './rfq.template'
export { renderSaleReceiptHtml, saleReceiptLabels } from './sale-receipt.template'
export type { SaleReceiptLabels, SaleReceiptOptions } from './sale-receipt.template'
export { renderDepositReceiptHtml, depositReceiptLabels } from './deposit-receipt.template'
export type { DepositReceiptLabels, DepositReceiptOptions } from './deposit-receipt.template'
export { renderDepositReportHtml, depositReportLabels } from './deposit-report.template'
export type { DepositReportLabels, DepositReportOptions } from './deposit-report.template'
export { renderReportDocumentHtml, reportLabels } from './report.template'
export type { ReportLabels } from './report.template'
export {
  buildExpenseBreakdownReport,
  buildStockValuationReport,
  buildLowStockReport,
  buildAgeingReport,
  buildStockMovementsReport,
  buildDailySalesReport,
  buildCashierPerformanceReport,
  buildSalesByProductReport,
  buildSalesByCategoryReport,
  buildSalesByPaymentReport,
  buildRefundsReport,
  buildIncomeStatementReport,
  buildInventoryTurnoverReport,
  buildDeadStockReport,
  buildSupplierPriceReport,
} from './report-builders'
export { purchaseOrderMessageText, rfqMessageText } from './message'
export { DOCUMENT_CSS } from './styles'
export { formatMoney, formatNumber, escapeHtml, escapeMultiline } from './format'
