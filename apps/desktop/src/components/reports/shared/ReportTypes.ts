// ─────────────────────────────────────────────────────────────────────────────
// apps/desktop/src/components/reports/shared/ReportTypes.ts
//
// Central type definitions for all 16 BizTrack CM report templates.
// Every report uses ReportMeta to populate the shared header and footer.
// ─────────────────────────────────────────────────────────────────────────────

export type ReportCategory =
  | 'Financial statement'
  | 'Sales analysis'
  | 'Inventory management'
  | 'Credit management'
  | 'Human resources'
  | 'Audit & compliance'
  | 'Purchasing'

/**
 * ReportMeta is passed to ReportHeader and ReportFooter on every report.
 * The dynamic report body sits between the two and provides its own content.
 */
export interface ReportMeta {
  // ── Report identity ────────────────────────────────────────────────────────
  /** e.g. 'Financial statement', 'Sales analysis' — shown as the eyebrow label */
  category: ReportCategory

  /** e.g. 'Profit & Loss Statement'. Can contain \n for two-line titles. */
  title: string

  /** Human-readable period string. e.g. '01 April 2025 — 30 April 2025'
   *  or 'As at: 13 April 2025 — all outstanding receivables' */
  period: string

  /** Short period for the metadata strip. e.g. 'Monthly · Apr 2025' */
  periodShort: string

  /** Auto-generated. Format: RPT-YYYY-MM-TYPE-SEQ e.g. 'RPT-2025-04-PNL-001' */
  reportId: string

  /** ISO timestamp — when this report was generated */
  generatedAt: Date

  // ── Metadata strip (4 cells below the header) ─────────────────────────────
  /** Strip cell 3 label — changes per report type */
  stripLabel3: string

  /** Strip cell 3 value */
  stripValue3: string

  /** Strip cell 4 label — changes per report type */
  stripLabel4: string

  /** Strip cell 4 value */
  stripValue4: string

  // ── Footer notes (2–3 report-specific notes) ──────────────────────────────
  /** Array of note strings — 2 to 3 items. Each is numbered automatically. */
  notes: [string, string] | [string, string, string]

  /** SYSCOHADA reference for the bottom bar. e.g. 'SYSCOHADA-RS · Exercice 2025' */
  syscohadaRef: string

  /** Total pages — used in the page counter. Default: 1 */
  totalPages?: number

  /** Current page number. Default: 1 */
  currentPage?: number
}

/**
 * BusinessInfo is fetched once from the API and passed to all reports.
 * Populated from the `businesses` table.
 */
export interface BusinessInfo {
  name: string
  legalForm: string        // e.g. 'SARL' | 'SA' | 'Entreprise individuelle'
  capital?: string         // e.g. 'XAF 1 000 000'
  rccm: string             // e.g. 'RC/DLA/2024/B/1247'
  niu: string              // e.g. 'M024100012345K'
  address: string          // e.g. 'Zone Commerciale Akwa, Douala'
  phone: string
  taxRegime: 'Simplifié (RS)' | 'Réel simplifié (RNS)' | 'Réel normal (RN)'
  activityCode?: string    // NACE/sectoral activity code
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-report meta factories
// One export per report — call these to get the correct ReportMeta object.
// The generatedAt and reportId are injected at runtime; everything else is
// static per report type and should not be changed without updating the
// corresponding OHADA compliance notes.
// ─────────────────────────────────────────────────────────────────────────────

export const REPORT_META_FACTORIES = {

  profitAndLoss: (period: string, periodShort: string): Omit<ReportMeta, 'generatedAt'|'reportId'> => ({
    category: 'Financial statement',
    title: 'Profit & Loss Statement',
    period,
    periodShort,
    stripLabel3: 'Accounting basis',
    stripValue3: 'Cash basis',
    stripLabel4: 'Tax regime',
    stripValue4: 'Simplifié (RS)',
    notes: [
      'Revenue figures are sourced from daily_sale_summaries and exclude voided transactions. Discounts applied at point of sale are deducted from gross revenue.',
      'This statement is prepared on a cash basis. Credit sales are recorded as revenue at point of sale regardless of collection status. Outstanding receivables are shown separately in the Debtors report.',
      'Cost of goods sold is calculated from cost price snapshots recorded at time of sale. Opening and closing stock valuations require full inventory valuation to be enabled.',
    ],
    syscohadaRef: 'SYSCOHADA-RS · Compte de résultat · Exercice en cours',
    totalPages: 1,
    currentPage: 1,
  }),

  revenueTrend: (period: string, periodShort: string): Omit<ReportMeta, 'generatedAt'|'reportId'> => ({
    category: 'Sales analysis',
    title: 'Revenue Trend Report',
    period,
    periodShort,
    stripLabel3: 'Grouping',
    stripValue3: 'By day',
    stripLabel4: 'Data source',
    stripValue4: 'sales/summary/range',
    notes: [
      'Revenue figures exclude voided sales. Voided transaction values are reversed and excluded from all period totals.',
      'Gross profit is calculated from cost price snapshots stored at time of sale in sale_items.cost_price.',
      'Average basket size = total revenue ÷ total completed transactions for the period.',
    ],
    syscohadaRef: 'SYSCOHADA · Chiffre d\'affaires · Compte 70',
    totalPages: 1, currentPage: 1,
  }),

  topProducts: (period: string, periodShort: string): Omit<ReportMeta, 'generatedAt'|'reportId'> => ({
    category: 'Sales analysis',
    title: 'Top Products Report',
    period,
    periodShort,
    stripLabel3: 'Ranked by',
    stripValue3: 'Gross revenue',
    stripLabel4: 'Data source',
    stripValue4: 'sale_items aggregated',
    notes: [
      'Products are ranked by gross revenue (unit price × quantity sold) before discounts are applied.',
      'Gross profit per product = revenue − (cost price × units sold). Cost price is snapshotted at time of sale and may differ from current purchase cost.',
    ],
    syscohadaRef: 'SYSCOHADA · Ventes de marchandises · Compte 7011',
    totalPages: 1, currentPage: 1,
  }),

  dailySales: (date: string): Omit<ReportMeta, 'generatedAt'|'reportId'> => ({
    category: 'Sales analysis',
    title: 'Daily Sales Report',
    period: `Trading day: ${date}`,
    periodShort: `Daily · ${date}`,
    stripLabel3: 'Cashiers active',
    stripValue3: 'See breakdown',
    stripLabel4: 'Data source',
    stripValue4: 'daily_sale_summaries',
    notes: [
      'All amounts in XAF (FCFA). Credit sales are included in revenue but not in cash collected. Refer to the credit column for split-payment and credit details.',
      'Voided sale inventory reversals are confirmed by the system. Stock levels have been restored for all voided transactions.',
    ],
    syscohadaRef: 'SYSCOHADA · Journal des ventes journalier',
    totalPages: 1, currentPage: 1,
  }),

  cashierPerformance: (period: string, periodShort: string): Omit<ReportMeta, 'generatedAt'|'reportId'> => ({
    category: 'Human resources',
    title: 'Cashier Performance Report',
    period,
    periodShort,
    stripLabel3: 'Metric',
    stripValue3: 'Per cashier_id',
    stripLabel4: 'Data source',
    stripValue4: 'sales by cashier',
    notes: [
      'Revenue is attributed to the cashier who recorded the sale, not the cashier who authorised it.',
      'Void rate = voids ÷ (completed + voided) transactions × 100. Calculated per cashier and for the overall period.',
    ],
    syscohadaRef: 'Sales grouped by cashier_id · Internal management report',
    totalPages: 1, currentPage: 1,
  }),

  paymentBreakdown: (period: string, periodShort: string): Omit<ReportMeta, 'generatedAt'|'reportId'> => ({
    category: 'Financial statement',
    title: 'Payment Method Breakdown',
    period,
    periodShort,
    stripLabel3: 'Collection rate',
    stripValue3: 'Excl. credit',
    stripLabel4: 'Data source',
    stripValue4: 'sale_payments + debts',
    notes: [
      'Credit issued is the unmet balance at time of sale (total_amount − amount_paid). It is included in revenue but not in cash collected.',
      'Mobile money figures are based on amounts recorded in sale_payments. MoMo transaction references are logged per transaction.',
    ],
    syscohadaRef: 'SYSCOHADA · Comptes 5711 (cash) · 5721 (MoMo)',
    totalPages: 1, currentPage: 1,
  }),

  voidedSales: (period: string, periodShort: string): Omit<ReportMeta, 'generatedAt'|'reportId'> => ({
    category: 'Audit & compliance',
    title: 'Voided Sales Report',
    period,
    periodShort,
    stripLabel3: 'Authorisation',
    stripValue3: 'Owner / Manager',
    stripLabel4: 'Data source',
    stripValue4: 'sales WHERE status=VOIDED',
    notes: [
      'All void authorisations require Owner or Manager role. Cashiers cannot self-authorise voids. Each void is attributed to the authorising user.',
      'Inventory stock levels were restored for all voided transactions. Reversal movements are logged in inventory_movements with type VOID_REVERSAL.',
    ],
    syscohadaRef: 'Audit trail · SYSCOHADA journal annulation',
    totalPages: 1, currentPage: 1,
  }),

  stockLevels: (snapshotDate: string): Omit<ReportMeta, 'generatedAt'|'reportId'> => ({
    category: 'Inventory management',
    title: 'Stock Levels Report',
    period: `Snapshot as at: ${snapshotDate}`,
    periodShort: `Snapshot · ${snapshotDate}`,
    stripLabel3: 'Valuation',
    stripValue3: 'Cost price (FIFO)',
    stripLabel4: 'Tracked SKUs',
    stripValue4: 'See header',
    notes: [
      'Quantities reflect inventory_levels as at the report generation time. Real-time values may differ if sales occurred after generation.',
      'Products with track_inventory = false are excluded from this report.',
      'Shortfall = low stock threshold − current quantity. Shown only for products currently below their threshold.',
    ],
    syscohadaRef: 'SYSCOHADA · Stocks marchandises · Compte 31',
    totalPages: 1, currentPage: 1,
  }),

  stockMovement: (period: string, periodShort: string): Omit<ReportMeta, 'generatedAt'|'reportId'> => ({
    category: 'Inventory management',
    title: 'Stock Movement Report',
    period,
    periodShort,
    stripLabel3: 'Movement types',
    stripValue3: 'All types',
    stripLabel4: 'Data source',
    stripValue4: 'inventory_movements',
    notes: [
      'Movement types: SALE (stock deduction), RESTOCK_IN (stock addition), MANUAL_ADJUSTMENT, VOID_REVERSAL, OPENING_STOCK.',
      'Physical deduction from inventory occurs at sale confirmation, not at pre-order / layaway creation.',
    ],
    syscohadaRef: 'SYSCOHADA · Mouvements stocks · Comptes 31xx',
    totalPages: 1, currentPage: 1,
  }),

  lowStockAlert: (snapshotDate: string): Omit<ReportMeta, 'generatedAt'|'reportId'> => ({
    category: 'Inventory management',
    title: 'Low Stock Alert Report',
    period: `As at: ${snapshotDate} — urgency ranked`,
    periodShort: `Alert · ${snapshotDate}`,
    stripLabel3: 'Sort order',
    stripValue3: 'By urgency',
    stripLabel4: 'Data source',
    stripValue4: 'inventory_levels filtered',
    notes: [
      'Products are sorted by shortfall severity: out of stock first, then by percentage below threshold.',
      'Estimated restock cost is calculated using the most recent purchase unit cost from restock_items.',
    ],
    syscohadaRef: 'Inventory alert · Internal management report',
    totalPages: 1, currentPage: 1,
  }),

  restockCost: (period: string, periodShort: string): Omit<ReportMeta, 'generatedAt'|'reportId'> => ({
    category: 'Purchasing',
    title: 'Restock Cost Report',
    period,
    periodShort,
    stripLabel3: 'Data source',
    stripValue3: 'restock_records',
    stripLabel4: 'Credit status',
    stripValue4: 'Incl. on-credit',
    notes: [
      'Unit cost = total delivery cost ÷ total units received for that delivery line.',
      'On-credit amounts reflect balances not yet paid to suppliers. Refer to the Creditors report for payment schedules.',
    ],
    syscohadaRef: 'SYSCOHADA · Achats marchandises · Compte 601',
    totalPages: 1, currentPage: 1,
  }),

  expenseBreakdown: (period: string, periodShort: string): Omit<ReportMeta, 'generatedAt'|'reportId'> => ({
    category: 'Financial statement',
    title: 'Expense Breakdown Report',
    period,
    periodShort,
    stripLabel3: 'Basis',
    stripValue3: 'Cash basis',
    stripLabel4: 'Data source',
    stripValue4: 'monthly_expense_summaries',
    notes: [
      'All expenses are recorded on a cash basis at the date of payment.',
      'Recurring flag is informational. It does not automatically create future expense entries.',
      'Expense categories follow the OHADA Class 6 account structure (6xxx).',
    ],
    syscohadaRef: 'SYSCOHADA · Charges d\'exploitation · Comptes 60–69',
    totalPages: 1, currentPage: 1,
  }),

  revenueVsExpenses: (period: string, periodShort: string): Omit<ReportMeta, 'generatedAt'|'reportId'> => ({
    category: 'Financial statement',
    title: 'Revenue vs Expenses Trend',
    period,
    periodShort,
    stripLabel3: 'Grouping',
    stripValue3: 'By month',
    stripLabel4: 'Data source',
    stripValue4: 'summaries joined',
    notes: [
      'Revenue sourced from daily_sale_summaries aggregated by month. Expenses sourced from monthly_expense_summaries.',
      'Breakeven revenue = total fixed expenses ÷ gross margin ratio. Shown as a reference line on the trend chart.',
    ],
    syscohadaRef: 'SYSCOHADA · Tableau de bord mensuel',
    totalPages: 1, currentPage: 1,
  }),

  debtorsAgeing: (snapshotDate: string): Omit<ReportMeta, 'generatedAt'|'reportId'> => ({
    category: 'Credit management',
    title: 'Debtors Ageing Report',
    period: `As at: ${snapshotDate} — all outstanding receivables`,
    periodShort: `Snapshot · ${snapshotDate}`,
    stripLabel3: 'Ageing basis',
    stripValue3: 'From debt date',
    stripLabel4: 'Data source',
    stripValue4: 'debts RECEIVABLE',
    notes: [
      'Ageing is calculated from the date credit was issued (sale date), not the due date.',
      'Written-off debts are excluded from all totals. Refer to the Credit Activity Summary for written-off amounts.',
      'Collection rate = cash collected ÷ total credit issued for the period × 100.',
    ],
    syscohadaRef: 'SYSCOHADA · Clients · Compte 4111',
    totalPages: 1, currentPage: 1,
  }),

  creditorsAgeing: (snapshotDate: string): Omit<ReportMeta, 'generatedAt'|'reportId'> => ({
    category: 'Credit management',
    title: 'Creditors Ageing Report',
    period: `As at: ${snapshotDate} — all outstanding payables`,
    periodShort: `Snapshot · ${snapshotDate}`,
    stripLabel3: 'Ageing basis',
    stripValue3: 'From restock date',
    stripLabel4: 'Data source',
    stripValue4: 'debts PAYABLE',
    notes: [
      'Ageing is calculated from the restock delivery date, not the agreed supplier-agreed due date.',
      'Overdue status is determined when the current date exceeds the supplier-agreed due date.',
    ],
    syscohadaRef: 'SYSCOHADA · Fournisseurs · Compte 4011',
    totalPages: 1, currentPage: 1,
  }),

  contactStatement: (contactName: string, period: string, periodShort: string): Omit<ReportMeta, 'generatedAt'|'reportId'> => ({
    category: 'Credit management',
    title: `Contact Statement\n${contactName}`,
    period,
    periodShort,
    stripLabel3: 'Statement type',
    stripValue3: 'Running ledger',
    stripLabel4: 'Data source',
    stripValue4: 'debts + payments',
    notes: [
      'Debit = credit issued (amount owed to the business). Credit = payment received.',
      'Section A (Receivable) and Section B (Deposits held) and Section C (Payable) are shown separately and must never be summed together.',
      'This statement can be shared with the contact to confirm and agree the outstanding balance.',
    ],
    syscohadaRef: 'SYSCOHADA · Relevé de compte client/fournisseur',
    totalPages: 1, currentPage: 1,
  }),

  creditActivitySummary: (period: string, periodShort: string): Omit<ReportMeta, 'generatedAt'|'reportId'> => ({
    category: 'Credit management',
    title: 'Credit Activity Summary',
    period,
    periodShort,
    stripLabel3: 'Directions',
    stripValue3: 'Receivable + Payable',
    stripLabel4: 'Data source',
    stripValue4: 'debts + payments',
    notes: [
      'Collection rate = cash collected ÷ total credit issued for the period.',
      'Average days to settle is calculated only from fully settled debts. Open debts are excluded from the average.',
    ],
    syscohadaRef: 'SYSCOHADA · Créances et dettes · Comptes 41xx / 40xx',
    totalPages: 1, currentPage: 1,
  }),

} as const

// ─────────────────────────────────────────────────────────────────────────────
// Report ID generator
// Format: RPT-YYYY-MM-TYPE-SEQ
// ─────────────────────────────────────────────────────────────────────────────

const REPORT_TYPE_CODES: Record<keyof typeof REPORT_META_FACTORIES, string> = {
  profitAndLoss:          'PNL',
  revenueTrend:           'REV',
  topProducts:            'TOP',
  dailySales:             'DAY',
  cashierPerformance:     'CSH',
  paymentBreakdown:       'PAY',
  voidedSales:            'VD',
  stockLevels:            'STK',
  stockMovement:          'MV',
  lowStockAlert:          'ALT',
  restockCost:            'RST',
  expenseBreakdown:       'EXP',
  revenueVsExpenses:      'TRD',
  debtorsAgeing:          'DBT',
  creditorsAgeing:        'CRD',
  contactStatement:       'STMT',
  creditActivitySummary:  'CA',
}

export function generateReportId(
  reportType: keyof typeof REPORT_META_FACTORIES,
  date: Date = new Date(),
  seq = '001'
): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const code = REPORT_TYPE_CODES[reportType]
  return `RPT-${y}-${m}-${code}-${seq}`
}
