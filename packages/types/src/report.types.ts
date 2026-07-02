export interface DailySummary {
  businessId: string
  date: string
  totalSales: number
  totalRevenue: number
  totalExpenses: number
  grossProfit: number
  netProfit: number
  topProducts: Array<{
    productId: string
    productName: string
    quantitySold: number
    revenue: number
  }>
  paymentBreakdown: Record<string, number>
}

export interface SalesReport {
  period: ReportPeriod
  startDate: string
  endDate: string
  totalRevenue: number
  totalSales: number
  averageOrderValue: number
  dailyBreakdown: Array<{
    date: string
    revenue: number
    sales: number
  }>
}

export enum ReportPeriod {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  CUSTOM = 'CUSTOM',
}

// ─── Generic report document model ──────────────────────────────────────────
// A renderable report = a header (business + title + period) + a list of sections.
// All values are PRE-FORMATTED strings (money/dates already localised by the caller)
// so the renderer (@biztrack/templates → HTML, and the app's on-screen iframe) is
// purely presentational and format-agnostic. One model → screen preview AND PDF.

export type ReportTone = 'up' | 'down' | 'warn'
export type ReportAlign = 'left' | 'right'

export interface ReportKpi {
  label: string
  value: string
  hint?: string
  tone?: ReportTone
}

export interface ReportColumn {
  key: string
  label: string
  align?: ReportAlign
}

export interface ReportKpiSection {
  kind: 'kpis'
  items: ReportKpi[]
}

export interface ReportTableSection {
  kind: 'table'
  title?: string
  /** Optional French sub-label shown italic on the right of the section header band. */
  titleFr?: string
  columns: ReportColumn[]
  rows: Array<Record<string, string>>
  /** Optional bold total row (keyed by column key). */
  total?: Record<string, string>
  empty?: string
}

export interface ReportKeyValueSection {
  kind: 'keyvalue'
  title?: string
  titleFr?: string
  /** `strong` → grand-total styling, `subtotal` → intermediate-total styling, else a plain row. */
  rows: Array<{ label: string; value: string; strong?: boolean; subtotal?: boolean; tone?: ReportTone }>
}

export interface ReportNoteSection {
  kind: 'note'
  text: string
}

export type ReportSection =
  | ReportKpiSection
  | ReportTableSection
  | ReportKeyValueSection
  | ReportNoteSection

export interface ReportBusiness {
  name: string
  /** Legal form / business type, e.g. "SARL", "Établissement individuel". */
  type?: string | null
  /** Line of business, e.g. "Commerce général". */
  activity?: string | null
  address?: string | null
  city?: string | null
  phone?: string | null
  email?: string | null
  logoUrl?: string | null
  /** OHADA/DGI statutory identifiers — rendered in the letterhead only when present
   * (the app's business profile doesn't capture these yet). */
  taxId?: string | null // NIU
  registration?: string | null // RCCM
  taxRegime?: string | null // Régime
  capital?: string | null
}

export interface ReportDocument {
  title: string
  subtitle?: string
  business: ReportBusiness
  periodLabel: string
  /** ISO timestamp the report was generated. */
  generatedAt: string
  /** Currency/unit shown in the letterhead meta row, e.g. "XAF". */
  unit?: string
  sections: ReportSection[]
}

// ─── Neutral report inputs (built by @biztrack/templates, shared FE + BE) ────
// The frontend maps its DataClient responses (and the API its services) to these
// neutral shapes, then calls the shared report builder → ReportDocument → HTML/PDF.
export interface ReportBuildOptions {
  business: ReportBusiness
  periodLabel: string
  /** ISO timestamp. */
  generatedAt: string
  locale: string
  /** Business currency (for reports whose input data doesn't carry it). */
  currency: string
}

/** A built report: the renderable document + an optional CSV export string. */
export interface BuiltReportResult {
  document: ReportDocument
  csv?: string
}

export interface ReportExpenseCategory {
  name: string
  percentage: number
  amount: number
}
export interface ExpenseBreakdownReportData {
  total: number
  count: number
  previousTotal: number
  changePct: number
  pendingCount: number
  pendingAmount: number
  byCategory: ReportExpenseCategory[]
  currency: string
}

export interface StockValuationRow {
  name: string
  sku: string | null
  quantity: number
  costValue: number
}
export interface StockValuationReportData {
  rows: StockValuationRow[]
  totalSkus: number
  totalCost: number
  retailValue: number
  marginPct: number
  /** Cost value of products not in `rows` (when the list is truncated). */
  otherCost?: number
  currency: string
}

export interface LowStockRow {
  name: string
  sku: string | null
  onHand: number
  reorderLevel: number
  suggestedQty: number
  unitCost: number | null
}
export interface LowStockReportData {
  rows: LowStockRow[]
  currency: string
}

export interface StockMovementRow {
  /** ISO timestamp of the movement. */
  date: string
  product: string
  /** Movement type enum value (e.g. SALE, RESTOCK_IN) — the builder localises it. */
  type: string
  /** Signed change (+in / −out). */
  quantityChange: number
  /** Resulting on-hand balance after the movement. */
  quantityAfter: number
  reference: string | null
}
export interface StockMovementsReportData {
  rows: StockMovementRow[]
  /** Sum of positive quantity changes (units in). */
  totalIn: number
  /** Sum of absolute negative quantity changes (units out). */
  totalOut: number
  /** Total movements in the period (may exceed rows.length if truncated). */
  movementCount: number
  /** True when `rows` was capped below `movementCount`. */
  truncated?: boolean
}

export interface DailySalesRow {
  /** Calendar day (YYYY-MM-DD). */
  date: string
  transactions: number
  /** Gross sales for the day (incl. tax). */
  total: number
  cash: number
  /** Mobile money (MTN + Orange). */
  momo: number
  card: number
  /** Sales settled on account / credit. */
  credit: number
}
export interface DailySalesSeriesReportData {
  rows: DailySalesRow[]
  currency: string
}

export interface CashierPerformanceRow {
  cashierId: string
  name: string
  /** Distinct trading days the cashier had at least one sale (shift proxy). */
  shifts: number
  transactions: number
  sales: number
  refunds: number
  discounts: number
}
export interface CashierPerformanceReportData {
  rows: CashierPerformanceRow[]
  currency: string
}

export interface SalesByProductRow {
  productId: string
  name: string
  category: string | null
  quantity: number
  revenue: number
  cogs: number
}
export interface SalesByProductReportData {
  rows: SalesByProductRow[]
  currency: string
}

export interface SalesByCategoryRow {
  category: string
  quantity: number
  revenue: number
  cogs: number
}
export interface SalesByCategoryReportData {
  rows: SalesByCategoryRow[]
  currency: string
}

export interface SalesByPaymentRow {
  /** PaymentMethod enum value (CASH, MTN_MOMO, ORANGE_MONEY, CARD, SAVINGS…). */
  method: string
  transactions: number
  amount: number
}
export interface SalesByPaymentReportData {
  rows: SalesByPaymentRow[]
  currency: string
}

export interface RefundReasonRow {
  /** Void reason (free text); null when none was recorded. */
  reason: string | null
  count: number
  amount: number
}
export interface RefundCashierRow {
  cashierId: string
  name: string
  refunds: number
  sales: number
}
export interface RefundsReportData {
  byReason: RefundReasonRow[]
  byCashier: RefundCashierRow[]
  /** Gross completed sales in the period — denominator for the refund rate. */
  grossSales: number
  currency: string
}

export interface InventoryTurnoverRow {
  productId: string
  name: string
  /** Current on-hand stock valued at cost. */
  avgStockCost: number
  /** COGS over the period, annualised (× 365 / periodDays). */
  annualCogs: number
}
export interface InventoryTurnoverReportData {
  rows: InventoryTurnoverRow[]
  currency: string
}

export interface DeadStockRow {
  productId: string
  name: string
  sku: string | null
  quantity: number
  costValue: number
  /** Days since the last completed sale; null = never sold. */
  daysSinceLastSale: number | null
}
export interface DeadStockReportData {
  rows: DeadStockRow[]
  /** Total tracked inventory value at cost — denominator for the "% of inventory" KPI. */
  stockCostTotal: number
  currency: string
}

export interface SupplierPriceRow {
  productId: string
  name: string
  supplier: string | null
  /** Restock unit cost ~6 months ago / ~3 months ago / most recent; null when none. */
  cost6mo: number | null
  cost3mo: number | null
  current: number | null
}
export interface SupplierPriceReportData {
  rows: SupplierPriceRow[]
  currency: string
}

export interface IncomeStatementExpenseLine {
  name: string
  amount: number
}
export interface IncomeStatementReportData {
  /** Net product revenue (Σ sale line totals) for completed sales. */
  revenue: number
  /** Cost of goods sold (Σ cost_price × qty). */
  cogs: number
  expensesByCategory: IncomeStatementExpenseLine[]
  totalExpenses: number
  currency: string
}
