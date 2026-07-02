// Shared report builders: neutral report data → ReportDocument (+ CSV). Live here in
// @biztrack/templates so the frontend (on-screen render) and the backend (PDF/Excel
// compilation) build the exact same report. Money/number formatting is done here so the
// generic renderer stays purely presentational.
import type {
  AgeingReport,
  BuiltReportResult,
  CashierPerformanceReportData,
  DailySalesSeriesReportData,
  DeadStockReportData,
  ExpenseBreakdownReportData,
  IncomeStatementReportData,
  InventoryTurnoverReportData,
  LowStockReportData,
  RefundsReportData,
  ReportBuildOptions,
  ReportDocument,
  SalesByCategoryReportData,
  SalesByPaymentReportData,
  SalesByProductReportData,
  StockMovementsReportData,
  StockValuationReportData,
  SupplierPriceReportData,
} from '@biztrack/types'
import { formatMoney, formatNumber } from './format'

function isFr(locale: string): boolean {
  return (locale || 'fr').toLowerCase().startsWith('fr')
}
function pct(n: number): string {
  return `${n.toFixed(1)}%`
}
function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}
function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((line) => line.map(csvCell).join(',')).join('\r\n')
}

function baseDoc(title: string, opts: ReportBuildOptions, sections: ReportDocument['sections'], subtitle?: string): ReportDocument {
  return { title, subtitle, business: opts.business, periodLabel: opts.periodLabel, generatedAt: opts.generatedAt, sections }
}

// ─── 1) Expense Breakdown ────────────────────────────────────────────────────
export function buildExpenseBreakdownReport(data: ExpenseBreakdownReportData, opts: ReportBuildOptions): BuiltReportResult {
  const fr = isFr(opts.locale)
  const m = (n: number) => formatMoney(n, data.currency, opts.locale)
  const n = (x: number) => formatNumber(x, opts.locale)
  const L = fr
    ? { title: 'Répartition des charges', total: 'Total dépensé', count: 'Entrées', pending: 'En attente', cat: 'Catégorie', share: 'Part', amount: 'Montant', byCat: "Charges d'exploitation", empty: 'Aucune dépense sur cette période.' }
    : { title: 'Expense Breakdown', total: 'Total spent', count: 'Entries', pending: 'Pending', cat: 'Category', share: 'Share', amount: 'Amount', byCat: 'Operating expenses', empty: 'No expenses in this period.' }
  const change = data.changePct !== 0 ? { text: `${data.changePct > 0 ? '▲' : '▼'} ${pct(Math.abs(data.changePct))}`, tone: (data.changePct > 0 ? 'down' : 'up') as 'down' | 'up' } : null
  const document = baseDoc(L.title, opts, [
    {
      kind: 'kpis',
      items: [
        { label: L.total, value: m(data.total), hint: change?.text, tone: change?.tone },
        { label: L.count, value: n(data.count) },
        { label: L.pending, value: m(data.pendingAmount), hint: n(data.pendingCount), tone: data.pendingCount > 0 ? 'warn' : undefined },
      ],
    },
    {
      kind: 'table',
      title: L.byCat,
      columns: [
        { key: 'cat', label: L.cat },
        { key: 'share', label: L.share, align: 'right' },
        { key: 'amount', label: L.amount, align: 'right' },
      ],
      rows: data.byCategory.map((c) => ({ cat: c.name, share: pct(c.percentage), amount: m(c.amount) })),
      total: { cat: L.total, share: '100%', amount: m(data.total) },
      empty: L.empty,
    },
  ])
  const csv = toCsv([L.cat, L.share, L.amount], data.byCategory.map((c) => [c.name, String(c.percentage), String(c.amount)]))
  document.unit = data.currency
  return { document, csv }
}

// ─── 2) Stock Valuation ──────────────────────────────────────────────────────
export function buildStockValuationReport(data: StockValuationReportData, opts: ReportBuildOptions): BuiltReportResult {
  const fr = isFr(opts.locale)
  const m = (n: number) => formatMoney(n, data.currency, opts.locale)
  const n = (x: number) => formatNumber(x, opts.locale)
  const L = fr
    ? { title: 'Valorisation des stocks', skus: 'Produits suivis', cost: 'Valeur au coût', retail: 'Valeur au détail', margin: 'Marge moyenne', product: 'Produit', sku: 'SKU', qty: 'Qté', value: 'Valeur au coût', other: 'Autres articles', total: 'TOTAL AU COÛT', empty: 'Aucun stock suivi.' }
    : { title: 'Stock Valuation', skus: 'Tracked SKUs', cost: 'Value at cost', retail: 'Value at retail', margin: 'Blended margin', product: 'Product', sku: 'SKU', qty: 'Qty', value: 'Cost value', other: 'Other items', total: 'TOTAL AT COST', empty: 'No tracked stock.' }
  const rows = data.rows.map((r) => ({ product: r.name, sku: r.sku ?? '—', qty: n(r.quantity), value: m(r.costValue) }))
  if (data.otherCost && data.otherCost > 0) rows.push({ product: L.other, sku: '', qty: '', value: m(data.otherCost) })
  const document = baseDoc(L.title, opts, [
    {
      kind: 'kpis',
      items: [
        { label: L.skus, value: n(data.totalSkus) },
        { label: L.cost, value: m(data.totalCost) },
        { label: L.retail, value: m(data.retailValue) },
        { label: L.margin, value: pct(data.marginPct) },
      ],
    },
    {
      kind: 'table',
      columns: [
        { key: 'product', label: L.product },
        { key: 'sku', label: L.sku },
        { key: 'qty', label: L.qty, align: 'right' },
        { key: 'value', label: L.value, align: 'right' },
      ],
      rows,
      total: { product: L.total, sku: '', qty: '', value: m(data.totalCost) },
      empty: L.empty,
    },
  ])
  const csv = toCsv([L.product, L.sku, L.qty, L.value], data.rows.map((r) => [r.name, r.sku ?? '', String(r.quantity), String(r.costValue)]))
  document.unit = data.currency
  return { document, csv }
}

// ─── 3) Low Stock & Reorder ──────────────────────────────────────────────────
export function buildLowStockReport(data: LowStockReportData, opts: ReportBuildOptions): BuiltReportResult {
  const fr = isFr(opts.locale)
  const m = (n: number) => formatMoney(n, data.currency, opts.locale)
  const n = (x: number) => formatNumber(x, opts.locale)
  const L = fr
    ? { title: 'Stocks faibles & réapprovisionnement', count: 'Articles à commander', estCost: 'Coût estimé', product: 'Produit', sku: 'SKU', onHand: 'En stock', level: 'Seuil', suggest: 'Qté suggérée', cost: 'Coût est.', total: 'TOTAL RÉAPPRO.', empty: 'Tous les niveaux de stock sont sains.' }
    : { title: 'Low Stock & Reorder', count: 'Items to reorder', estCost: 'Est. reorder cost', product: 'Product', sku: 'SKU', onHand: 'On hand', level: 'Reorder lvl', suggest: 'Suggest qty', cost: 'Est. cost', total: 'TOTAL REORDER', empty: 'All stock levels are healthy.' }
  const totalCost = data.rows.reduce((s, r) => s + r.suggestedQty * (r.unitCost ?? 0), 0)
  const document = baseDoc(L.title, opts, [
    {
      kind: 'kpis',
      items: [
        { label: L.count, value: n(data.rows.length), tone: data.rows.length > 0 ? 'warn' : 'up' },
        { label: L.estCost, value: m(totalCost) },
      ],
    },
    {
      kind: 'table',
      columns: [
        { key: 'product', label: L.product },
        { key: 'sku', label: L.sku },
        { key: 'onHand', label: L.onHand, align: 'right' },
        { key: 'level', label: L.level, align: 'right' },
        { key: 'suggest', label: L.suggest, align: 'right' },
        { key: 'cost', label: L.cost, align: 'right' },
      ],
      rows: data.rows.map((r) => ({ product: r.name, sku: r.sku ?? '—', onHand: n(r.onHand), level: n(r.reorderLevel), suggest: n(r.suggestedQty), cost: m(r.suggestedQty * (r.unitCost ?? 0)) })),
      total: { product: L.total, sku: '', onHand: '', level: '', suggest: '', cost: m(totalCost) },
      empty: L.empty,
    },
  ])
  const csv = toCsv([L.product, L.sku, L.onHand, L.level, L.suggest, L.cost], data.rows.map((r) => [r.name, r.sku ?? '', String(r.onHand), String(r.reorderLevel), String(r.suggestedQty), String(r.suggestedQty * (r.unitCost ?? 0))]))
  document.unit = data.currency
  return { document, csv }
}

// ─── 4) Aged Receivables / Payables ──────────────────────────────────────────
// One builder, two reports: buckets ≤7d (current), 8–15d (moderate), 16–30d (aged),
// 30d+ (overdue) — mirrors the API OpeningBalancesService.getAgeingReport exactly, so
// the offline (local SQLite) and online (API) inputs produce an identical document.
export function buildAgeingReport(report: AgeingReport, opts: ReportBuildOptions, kind: 'receivable' | 'payable'): BuiltReportResult {
  const fr = isFr(opts.locale)
  const m = (n: number) => formatMoney(n, opts.currency, opts.locale)
  const L = fr
    ? {
        recvTitle: 'Balance âgée clients', payTitle: 'Balance âgée fournisseurs', asAt: 'Au',
        account: 'Compte', cur: 'Courant (≤7 j)', b1: '8–15 j', b2: '16–30 j', b3: '30 j+', total: 'Total', totalRow: 'TOTAL',
        outstanding: 'Total en cours', overdue: 'En retard (30 j+)', empty: 'Aucun solde en cours.',
        noteR: 'Les montants de plus de 30 jours doivent être suivis en priorité pour recouvrement.',
        noteP: 'Priorisez le règlement du courant et du 8–15 j afin de préserver vos conditions fournisseurs.',
      }
    : {
        recvTitle: 'Aged Receivables', payTitle: 'Aged Payables', asAt: 'As at',
        account: 'Account', cur: 'Current (≤7 d)', b1: '8–15 d', b2: '16–30 d', b3: '30 d+', total: 'Total', totalRow: 'TOTAL',
        outstanding: 'Total outstanding', overdue: 'Overdue (30 d+)', empty: 'No outstanding balances.',
        noteR: 'Amounts over 30 days should be prioritised for follow-up and collection.',
        noteP: 'Prioritise settling current and 8–15 day balances to protect supplier terms.',
      }
  const title = kind === 'receivable' ? L.recvTitle : L.payTitle
  const t = report.totals
  const document: ReportDocument = {
    title,
    business: opts.business,
    periodLabel: `${L.asAt} ${report.asOf}`,
    generatedAt: opts.generatedAt,
    unit: opts.currency,
    sections: [
      {
        kind: 'kpis',
        items: [
          { label: L.outstanding, value: m(t.totalOutstanding), tone: kind === 'receivable' ? 'up' : 'down' },
          { label: L.overdue, value: m(t.overdue), tone: t.overdue > 0 ? 'warn' : undefined },
        ],
      },
      {
        kind: 'table',
        columns: [
          { key: 'name', label: L.account },
          { key: 'cur', label: L.cur, align: 'right' },
          { key: 'b1', label: L.b1, align: 'right' },
          { key: 'b2', label: L.b2, align: 'right' },
          { key: 'b3', label: L.b3, align: 'right' },
          { key: 'total', label: L.total, align: 'right' },
        ],
        rows: report.entries.map((e) => ({
          name: e.contactName,
          cur: m(e.current),
          b1: m(e.moderate),
          b2: m(e.aged),
          b3: m(e.overdue),
          total: m(e.totalOutstanding),
        })),
        total: { name: L.totalRow, cur: m(t.current), b1: m(t.moderate), b2: m(t.aged), b3: m(t.overdue), total: m(t.totalOutstanding) },
        empty: L.empty,
      },
      { kind: 'note', text: kind === 'receivable' ? L.noteR : L.noteP },
    ],
  }
  const header = [L.account, L.cur, L.b1, L.b2, L.b3, L.total]
  const csvRows = report.entries.map((e) => [e.contactName, String(e.current), String(e.moderate), String(e.aged), String(e.overdue), String(e.totalOutstanding)])
  csvRows.push([L.totalRow, String(t.current), String(t.moderate), String(t.aged), String(t.overdue), String(t.totalOutstanding)])
  const csv = toCsv(header, csvRows)
  return { document, csv }
}

// ─── 6) Daily Sales Summary ──────────────────────────────────────────────────
// One row per trading day: transactions + gross total + payment split. Mirrors the
// design rDaily template (KPIs: total / txns / avg-per-day / avg-basket + daily table).
export function buildDailySalesReport(data: DailySalesSeriesReportData, opts: ReportBuildOptions): BuiltReportResult {
  const fr = isFr(opts.locale)
  const m = (x: number) => formatMoney(x, data.currency, opts.locale)
  const n = (x: number) => formatNumber(x, opts.locale)
  const L = fr
    ? { title: 'Résumé des ventes journalières', totalSales: 'Ventes totales', txns: 'Transactions', avgDay: 'Moy. / jour', basket: 'Panier moyen', days: 'jours ouvrés', perTxn: 'par transaction', date: 'Date', cash: 'Espèces', momo: 'Mobile Money', card: 'Carte', credit: 'Crédit', total: 'Ventes', totalRow: 'TOTAL', sec: 'Détail journalier', empty: 'Aucune vente sur cette période.' }
    : { title: 'Daily Sales Summary', totalSales: 'Total sales', txns: 'Transactions', avgDay: 'Avg / day', basket: 'Avg basket', days: 'trading days', perTxn: 'per transaction', date: 'Date', cash: 'Cash', momo: 'Mobile Money', card: 'Card', credit: 'Credit', total: 'Total sales', totalRow: 'TOTAL', sec: 'Daily breakdown', empty: 'No sales in this period.' }
  const totalSales = data.rows.reduce((s, r) => s + r.total, 0)
  const txns = data.rows.reduce((s, r) => s + r.transactions, 0)
  const days = data.rows.length || 1
  const document = baseDoc(L.title, opts, [
    {
      kind: 'kpis',
      items: [
        { label: L.totalSales, value: m(totalSales) },
        { label: L.txns, value: n(txns), hint: `${n(data.rows.length)} ${L.days}` },
        { label: L.avgDay, value: m(Math.round(totalSales / days)) },
        { label: L.basket, value: m(txns ? Math.round(totalSales / txns) : 0), hint: L.perTxn },
      ],
    },
    {
      kind: 'table',
      title: L.sec,
      columns: [
        { key: 'date', label: L.date },
        { key: 'txns', label: L.txns, align: 'right' },
        { key: 'total', label: L.total, align: 'right' },
        { key: 'cash', label: L.cash, align: 'right' },
        { key: 'momo', label: L.momo, align: 'right' },
        { key: 'card', label: L.card, align: 'right' },
        { key: 'credit', label: L.credit, align: 'right' },
      ],
      rows: data.rows.map((r) => ({ date: r.date, txns: n(r.transactions), total: m(r.total), cash: m(r.cash), momo: m(r.momo), card: m(r.card), credit: m(r.credit) })),
      total: {
        date: L.totalRow,
        txns: n(txns),
        total: m(totalSales),
        cash: m(data.rows.reduce((s, r) => s + r.cash, 0)),
        momo: m(data.rows.reduce((s, r) => s + r.momo, 0)),
        card: m(data.rows.reduce((s, r) => s + r.card, 0)),
        credit: m(data.rows.reduce((s, r) => s + r.credit, 0)),
      },
      empty: L.empty,
    },
  ])
  document.unit = data.currency
  const csv = toCsv(
    [L.date, L.txns, L.total, L.cash, L.momo, L.card, L.credit],
    data.rows.map((r) => [r.date, String(r.transactions), String(r.total), String(r.cash), String(r.momo), String(r.card), String(r.credit)]),
  )
  return { document, csv }
}

// ─── 7) Cashier Performance ──────────────────────────────────────────────────
// One row per cashier over the period. Mirrors the design rCashier template
// (roster table: shifts / txns / sales / avg-basket / refunds / discounts + team total).
export function buildCashierPerformanceReport(data: CashierPerformanceReportData, opts: ReportBuildOptions): BuiltReportResult {
  const fr = isFr(opts.locale)
  const m = (x: number) => formatMoney(x, data.currency, opts.locale)
  const n = (x: number) => formatNumber(x, opts.locale)
  const L = fr
    ? { title: 'Performance des caissiers', member: 'Caissier', shifts: 'Postes', txns: 'Transactions', sales: 'Ventes', basket: 'Panier moyen', refunds: 'Remboursements', discounts: 'Remises', totalRow: 'TOTAL / ÉQUIPE', sec: "Par membre de l'équipe", empty: 'Aucune vente sur cette période.', note: 'Les remboursements et remises sont affichés à titre de contrôle. Un taux de remboursement élevé peut justifier une revue de poste.' }
    : { title: 'Cashier Performance', member: 'Team member', shifts: 'Shifts', txns: 'Transactions', sales: 'Sales', basket: 'Avg basket', refunds: 'Refunds', discounts: 'Discounts', totalRow: 'TOTAL / TEAM', sec: 'By team member', empty: 'No sales in this period.', note: 'Refunds and discounts are shown for oversight. High refund ratios may warrant a shift review.' }
  const sales = data.rows.reduce((s, r) => s + r.sales, 0)
  const txns = data.rows.reduce((s, r) => s + r.transactions, 0)
  const document = baseDoc(L.title, opts, [
    {
      kind: 'table',
      title: L.sec,
      columns: [
        { key: 'member', label: L.member },
        { key: 'shifts', label: L.shifts, align: 'right' },
        { key: 'txns', label: L.txns, align: 'right' },
        { key: 'sales', label: L.sales, align: 'right' },
        { key: 'basket', label: L.basket, align: 'right' },
        { key: 'refunds', label: L.refunds, align: 'right' },
        { key: 'discounts', label: L.discounts, align: 'right' },
      ],
      rows: data.rows.map((r) => ({
        member: r.name,
        shifts: n(r.shifts),
        txns: n(r.transactions),
        sales: m(r.sales),
        basket: m(r.transactions ? Math.round(r.sales / r.transactions) : 0),
        refunds: m(r.refunds),
        discounts: m(r.discounts),
      })),
      total: {
        member: L.totalRow,
        shifts: n(data.rows.reduce((s, r) => s + r.shifts, 0)),
        txns: n(txns),
        sales: m(sales),
        basket: m(txns ? Math.round(sales / txns) : 0),
        refunds: m(data.rows.reduce((s, r) => s + r.refunds, 0)),
        discounts: m(data.rows.reduce((s, r) => s + r.discounts, 0)),
      },
      empty: L.empty,
    },
    { kind: 'note', text: L.note },
  ])
  document.unit = data.currency
  const csv = toCsv(
    [L.member, L.shifts, L.txns, L.sales, L.refunds, L.discounts],
    data.rows.map((r) => [r.name, String(r.shifts), String(r.transactions), String(r.sales), String(r.refunds), String(r.discounts)]),
  )
  return { document, csv }
}

// ─── 8) Sales by Product ─────────────────────────────────────────────────────
// Per-product revenue / COGS / margin, ranked by revenue (query already sorts desc).
// Mirrors the design rProduct template (KPIs + product table + total + note).
export function buildSalesByProductReport(data: SalesByProductReportData, opts: ReportBuildOptions): BuiltReportResult {
  const fr = isFr(opts.locale)
  const m = (x: number) => formatMoney(x, data.currency, opts.locale)
  const n = (x: number) => formatNumber(x, opts.locale)
  const L = fr
    ? { title: 'Ventes par produit', rev: 'CA produits', margin: 'Marge brute', units: 'Unités vendues', top: 'Meilleure vente', ofRev: 'du CA', lines: 'lignes', all: 'tous produits', product: 'Produit', cat: 'Catégorie', qty: 'Qté', revenue: 'CA', cogs: 'Coût', marginC: 'Marge', marginPct: 'Marge %', total: 'TOTAL', sec: 'Performance par article', empty: 'Aucune vente sur cette période.', note: 'Classé par chiffre d’affaires. Coût au CMUP ; la marge exclut les charges d’exploitation indirectes.' }
    : { title: 'Sales by Product', rev: 'Product revenue', margin: 'Gross margin', units: 'Units sold', top: 'Top seller', ofRev: 'of revenue', lines: 'lines', all: 'all products', product: 'Product', cat: 'Category', qty: 'Qty', revenue: 'Revenue', cogs: 'COGS', marginC: 'Margin', marginPct: 'Margin %', total: 'TOTAL', sec: 'Product performance', empty: 'No sales in this period.', note: 'Ranked by revenue. COGS at weighted-average cost; margin excludes indirect operating charges.' }
  const revenue = data.rows.reduce((s, r) => s + r.revenue, 0)
  const cogs = data.rows.reduce((s, r) => s + r.cogs, 0)
  const margin = revenue - cogs
  const units = data.rows.reduce((s, r) => s + r.quantity, 0)
  const top = data.rows[0]
  const document = baseDoc(L.title, opts, [
    {
      kind: 'kpis',
      items: [
        { label: L.rev, value: m(revenue), hint: `${n(data.rows.length)} ${L.lines}` },
        { label: L.margin, value: m(margin), hint: `${pct(revenue ? (margin / revenue) * 100 : 0)} ${L.ofRev}`, tone: 'up' },
        { label: L.units, value: n(units), hint: L.all },
        { label: L.top, value: top ? top.name : '—', hint: top ? m(top.revenue) : '' },
      ],
    },
    {
      kind: 'table',
      title: L.sec,
      columns: [
        { key: 'product', label: L.product },
        { key: 'cat', label: L.cat },
        { key: 'qty', label: L.qty, align: 'right' },
        { key: 'revenue', label: L.revenue, align: 'right' },
        { key: 'cogs', label: L.cogs, align: 'right' },
        { key: 'margin', label: L.marginC, align: 'right' },
        { key: 'marginPct', label: L.marginPct, align: 'right' },
      ],
      rows: data.rows.map((r) => {
        const mg = r.revenue - r.cogs
        return { product: r.name, cat: r.category ?? '—', qty: n(r.quantity), revenue: m(r.revenue), cogs: m(r.cogs), margin: m(mg), marginPct: pct(r.revenue ? (mg / r.revenue) * 100 : 0) }
      }),
      total: { product: L.total, cat: '', qty: n(units), revenue: m(revenue), cogs: m(cogs), margin: m(margin), marginPct: pct(revenue ? (margin / revenue) * 100 : 0) },
      empty: L.empty,
    },
    { kind: 'note', text: L.note },
  ])
  document.unit = data.currency
  const csv = toCsv(
    [L.product, L.cat, L.qty, L.revenue, L.cogs, L.marginC, L.marginPct],
    data.rows.map((r) => {
      const mg = r.revenue - r.cogs
      return [r.name, r.category ?? '', String(r.quantity), String(r.revenue), String(r.cogs), String(mg), pct(r.revenue ? (mg / r.revenue) * 100 : 0)]
    }),
  )
  return { document, csv }
}

// ─── 8b) Sales by Category ───────────────────────────────────────────────────
// Same sale_items aggregation as Sales by Product, rolled up to category. Mirrors the
// design rCategory template (KPIs + category table ranked by revenue + total).
export function buildSalesByCategoryReport(data: SalesByCategoryReportData, opts: ReportBuildOptions): BuiltReportResult {
  const fr = isFr(opts.locale)
  const m = (x: number) => formatMoney(x, data.currency, opts.locale)
  const n = (x: number) => formatNumber(x, opts.locale)
  const L = fr
    ? { title: 'Ventes par catégorie', rev: 'CA', margin: 'Marge brute', top: 'Catégorie phare', units: 'Unités', cats: 'catégories', ofSales: 'des ventes', items: 'articles vendus', cat: 'Catégorie', revenue: 'CA', cogs: 'Coût', marginC: 'Marge', marginPct: 'Marge %', pctSales: '% ventes', total: 'TOTAL', sec: 'Performance par catégorie', empty: 'Aucune vente sur cette période.' }
    : { title: 'Sales by Category', rev: 'Revenue', margin: 'Gross margin', top: 'Top category', units: 'Units', cats: 'categories', ofSales: 'of sales', items: 'items sold', cat: 'Category', revenue: 'Revenue', cogs: 'COGS', marginC: 'Margin', marginPct: 'Margin %', pctSales: '% sales', total: 'TOTAL', sec: 'Category performance', empty: 'No sales in this period.' }
  const revenue = data.rows.reduce((s, r) => s + r.revenue, 0)
  const cogs = data.rows.reduce((s, r) => s + r.cogs, 0)
  const margin = revenue - cogs
  const units = data.rows.reduce((s, r) => s + r.quantity, 0)
  const top = data.rows[0]
  const document = baseDoc(L.title, opts, [
    {
      kind: 'kpis',
      items: [
        { label: L.rev, value: m(revenue), hint: `${n(data.rows.length)} ${L.cats}` },
        { label: L.margin, value: m(margin), hint: pct(revenue ? (margin / revenue) * 100 : 0), tone: 'up' },
        { label: L.top, value: top ? top.category : '—', hint: top && revenue ? `${pct((top.revenue / revenue) * 100)} ${L.ofSales}` : '' },
        { label: L.units, value: n(units), hint: L.items },
      ],
    },
    {
      kind: 'table',
      title: L.sec,
      columns: [
        { key: 'cat', label: L.cat },
        { key: 'revenue', label: L.revenue, align: 'right' },
        { key: 'cogs', label: L.cogs, align: 'right' },
        { key: 'margin', label: L.marginC, align: 'right' },
        { key: 'marginPct', label: L.marginPct, align: 'right' },
        { key: 'pctSales', label: L.pctSales, align: 'right' },
      ],
      rows: data.rows.map((r) => {
        const mg = r.revenue - r.cogs
        return { cat: r.category, revenue: m(r.revenue), cogs: m(r.cogs), margin: m(mg), marginPct: pct(r.revenue ? (mg / r.revenue) * 100 : 0), pctSales: pct(revenue ? (r.revenue / revenue) * 100 : 0) }
      }),
      total: { cat: L.total, revenue: m(revenue), cogs: m(cogs), margin: m(margin), marginPct: pct(revenue ? (margin / revenue) * 100 : 0), pctSales: '100.0%' },
      empty: L.empty,
    },
  ])
  document.unit = data.currency
  const csv = toCsv(
    [L.cat, L.units, L.revenue, L.cogs, L.marginC, L.marginPct],
    data.rows.map((r) => {
      const mg = r.revenue - r.cogs
      return [r.category, String(r.quantity), String(r.revenue), String(r.cogs), String(mg), pct(r.revenue ? (mg / r.revenue) * 100 : 0)]
    }),
  )
  return { document, csv }
}

// ─── 9) Sales by Payment Method ──────────────────────────────────────────────
const PAYMENT_LABELS: Record<string, { en: string; fr: string }> = {
  CASH: { en: 'Cash', fr: 'Espèces' },
  MTN_MOMO: { en: 'MTN Mobile Money', fr: 'MTN MoMo' },
  ORANGE_MONEY: { en: 'Orange Money', fr: 'Orange Money' },
  CARD: { en: 'Bank card', fr: 'Carte bancaire' },
  SAVINGS: { en: 'Savings / deposit', fr: 'Épargne / acompte' },
  CREDIT: { en: 'On account (credit)', fr: 'Vente à crédit' },
  MIXED: { en: 'Mixed', fr: 'Mixte' },
}
// Typical Cameroon processing fees (estimated): MoMo ~1%, bank card ~1.8%.
const PAYMENT_FEE_RATE: Record<string, number> = { MTN_MOMO: 0.01, ORANGE_MONEY: 0.01, CARD: 0.018 }
export function buildSalesByPaymentReport(data: SalesByPaymentReportData, opts: ReportBuildOptions): BuiltReportResult {
  const fr = isFr(opts.locale)
  const m = (x: number) => formatMoney(x, data.currency, opts.locale)
  const n = (x: number) => formatNumber(x, opts.locale)
  const methodLabel = (mth: string) => (PAYMENT_LABELS[mth] ? (fr ? PAYMENT_LABELS[mth].fr : PAYMENT_LABELS[mth].en) : mth)
  const L = fr
    ? { title: 'Ventes par mode de paiement', method: 'Mode', txns: 'Transactions', amount: 'Montant', share: '% total', fees: 'Frais est.', total: 'TOTAL', sec: 'Répartition des encaissements', empty: 'Aucun encaissement sur cette période.', note: 'Les frais Mobile Money & carte sont estimés aux taux courants au Cameroun (MoMo ~1 %, carte ~1,8 %). Les espèces et ventes à crédit ne supportent aucun frais.' }
    : { title: 'Sales by Payment Method', method: 'Method', txns: 'Transactions', amount: 'Amount', share: '% total', fees: 'Est. fees', total: 'TOTAL', sec: 'Payment mix', empty: 'No collections in this period.', note: 'Mobile Money & card fees are estimated at typical Cameroon rates (MoMo ~1%, card ~1.8%). Cash and on-account sales incur no processing fee.' }
  const total = data.rows.reduce((s, r) => s + r.amount, 0)
  const txns = data.rows.reduce((s, r) => s + r.transactions, 0)
  const feeOf = (r: { method: string; amount: number }) => Math.round(r.amount * (PAYMENT_FEE_RATE[r.method] ?? 0))
  const totalFees = data.rows.reduce((s, r) => s + feeOf(r), 0)
  const document = baseDoc(L.title, opts, [
    {
      kind: 'table',
      title: L.sec,
      columns: [
        { key: 'method', label: L.method },
        { key: 'txns', label: L.txns, align: 'right' },
        { key: 'amount', label: L.amount, align: 'right' },
        { key: 'share', label: L.share, align: 'right' },
        { key: 'fees', label: L.fees, align: 'right' },
      ],
      rows: data.rows.map((r) => ({ method: methodLabel(r.method), txns: n(r.transactions), amount: m(r.amount), share: pct(total ? (r.amount / total) * 100 : 0), fees: m(feeOf(r)) })),
      total: { method: L.total, txns: n(txns), amount: m(total), share: '100.0%', fees: m(totalFees) },
      empty: L.empty,
    },
    { kind: 'note', text: L.note },
  ])
  document.unit = data.currency
  const csv = toCsv(
    [L.method, L.txns, L.amount, L.share, L.fees],
    data.rows.map((r) => [methodLabel(r.method), String(r.transactions), String(r.amount), pct(total ? (r.amount / total) * 100 : 0), String(feeOf(r))]),
  )
  return { document, csv }
}

// ─── 10) Refunds & Returns ───────────────────────────────────────────────────
// Voided sales grouped by reason and by cashier. Mirrors the design rRefunds template
// (KPIs + by-reason table + by-cashier table + note).
export function buildRefundsReport(data: RefundsReportData, opts: ReportBuildOptions): BuiltReportResult {
  const fr = isFr(opts.locale)
  const m = (x: number) => formatMoney(x, data.currency, opts.locale)
  const n = (x: number) => formatNumber(x, opts.locale)
  const L = fr
    ? { title: 'Remboursements & retours', value: 'Valeur remboursée', rate: 'Taux de remboursement', avg: 'Remb. moyen', topReason: 'Motif principal', txns: 'transactions', ofGross: 'des ventes brutes', perReturn: 'par retour', reason: 'Motif', count: 'Nombre', amount: 'Montant', pctValue: '% valeur', member: 'Caissier', refunds: 'Remboursements', sales: 'Ventes', refundRate: 'Taux', total: 'TOTAL', byReason: 'Par motif', byCashier: 'Par caissier', other: 'Autres / non précisé', empty: 'Aucun remboursement sur cette période.', note: 'Un taux de remboursement supérieur à ~2 % des ventes brutes mérite examen. Les produits abîmés/périmés révèlent un problème de rotation ; surveillez les taux élevés par caissier.' }
    : { title: 'Refunds & Returns', value: 'Refunds value', rate: 'Refund rate', avg: 'Avg refund', topReason: 'Top reason', txns: 'transactions', ofGross: 'of gross sales', perReturn: 'per return', reason: 'Reason', count: 'Count', amount: 'Amount', pctValue: '% value', member: 'Team member', refunds: 'Refunds', sales: 'Sales', refundRate: 'Refund rate', total: 'TOTAL', byReason: 'By reason', byCashier: 'By cashier', other: 'Other / unspecified', empty: 'No refunds in this period.', note: 'A refund rate above ~2% of gross sales warrants review. Damaged / expired goods point to stock rotation; investigate high per-cashier rates.' }
  const totCount = data.byReason.reduce((s, r) => s + r.count, 0)
  const totAmt = data.byReason.reduce((s, r) => s + r.amount, 0)
  const reasonLabel = (r: string | null) => (r && r.trim() ? r : L.other)
  const topReason = data.byReason[0]
  const document = baseDoc(L.title, opts, [
    {
      kind: 'kpis',
      items: [
        { label: L.value, value: m(totAmt), hint: `${n(totCount)} ${L.txns}`, tone: totAmt > 0 ? 'warn' : undefined },
        { label: L.rate, value: pct(data.grossSales ? (totAmt / data.grossSales) * 100 : 0), hint: L.ofGross },
        { label: L.avg, value: m(totCount ? Math.round(totAmt / totCount) : 0), hint: L.perReturn },
        { label: L.topReason, value: topReason ? reasonLabel(topReason.reason) : '—', hint: topReason && totAmt ? pct((topReason.amount / totAmt) * 100) : '' },
      ],
    },
    {
      kind: 'table',
      title: L.byReason,
      columns: [
        { key: 'reason', label: L.reason },
        { key: 'count', label: L.count, align: 'right' },
        { key: 'amount', label: L.amount, align: 'right' },
        { key: 'pctValue', label: L.pctValue, align: 'right' },
      ],
      rows: data.byReason.map((r) => ({ reason: reasonLabel(r.reason), count: n(r.count), amount: m(r.amount), pctValue: pct(totAmt ? (r.amount / totAmt) * 100 : 0) })),
      total: { reason: L.total, count: n(totCount), amount: m(totAmt), pctValue: '100.0%' },
      empty: L.empty,
    },
    {
      kind: 'table',
      title: L.byCashier,
      columns: [
        { key: 'member', label: L.member },
        { key: 'refunds', label: L.refunds, align: 'right' },
        { key: 'sales', label: L.sales, align: 'right' },
        { key: 'rate', label: L.refundRate, align: 'right' },
      ],
      rows: data.byCashier.map((c) => ({ member: c.name, refunds: m(c.refunds), sales: m(c.sales), rate: pct(c.sales ? (c.refunds / c.sales) * 100 : 0) })),
      total: {
        member: L.total,
        refunds: m(data.byCashier.reduce((s, c) => s + c.refunds, 0)),
        sales: m(data.byCashier.reduce((s, c) => s + c.sales, 0)),
        rate: pct(
          data.byCashier.reduce((s, c) => s + c.sales, 0)
            ? (data.byCashier.reduce((s, c) => s + c.refunds, 0) / data.byCashier.reduce((s, c) => s + c.sales, 0)) * 100
            : 0,
        ),
      },
    },
    { kind: 'note', text: L.note },
  ])
  document.unit = data.currency
  const csv = toCsv(
    [L.reason, L.count, L.amount, L.pctValue],
    data.byReason.map((r) => [reasonLabel(r.reason), String(r.count), String(r.amount), pct(totAmt ? (r.amount / totAmt) * 100 : 0)]),
  )
  return { document, csv }
}

// ─── 11) Income Statement (management P&L) ───────────────────────────────────
// A real trading + operating income statement from POS sales (revenue − COGS = gross
// margin) and recorded operating expenses. NOT a full statutory SYSCOHADA statement
// (that needs the general ledger) — the note makes this explicit.
export function buildIncomeStatementReport(data: IncomeStatementReportData, opts: ReportBuildOptions): BuiltReportResult {
  const fr = isFr(opts.locale)
  const m = (x: number) => formatMoney(x, data.currency, opts.locale)
  const grossMargin = data.revenue - data.cogs
  const operating = grossMargin - data.totalExpenses
  const L = fr
    ? { title: 'Compte de résultat', trading: 'Compte d’exploitation', revenue: 'Ventes (produits)', cogs: 'Coût des marchandises vendues', margin: 'MARGE BRUTE', opex: 'Charges d’exploitation', totalOpex: 'Total des charges d’exploitation', result: "RÉSULTAT D'EXPLOITATION", metric: 'Poste', value: 'Montant', noExp: 'Aucune charge enregistrée sur la période.', note: "Compte de résultat de gestion établi à partir des ventes du point de vente et des charges enregistrées. Ce n'est pas un état financier statutaire SYSCOHADA complet (qui nécessite le grand livre : amortissements, charges financières, impôt)." }
    : { title: 'Income Statement', trading: 'Trading account', revenue: 'Sales revenue', cogs: 'Cost of goods sold', margin: 'GROSS MARGIN', opex: 'Operating expenses', totalOpex: 'Total operating expenses', result: 'OPERATING RESULT', metric: 'Line', value: 'Amount', noExp: 'No expenses recorded in the period.', note: 'A management income statement from point-of-sale revenue and recorded expenses. It is not a full statutory SYSCOHADA statement (which needs the general ledger: depreciation, financial charges, tax).' }
  const expenseRows = data.expensesByCategory.length
    ? data.expensesByCategory.map((e) => ({ label: e.name, value: `− ${m(e.amount)}`, tone: 'down' as const }))
    : [{ label: L.noExp, value: '—' }]
  const document = baseDoc(L.title, opts, [
    {
      kind: 'keyvalue',
      title: L.trading,
      rows: [
        { label: L.revenue, value: m(data.revenue) },
        { label: L.cogs, value: `− ${m(data.cogs)}`, tone: 'down' },
        { label: L.margin, value: m(grossMargin), subtotal: true, tone: grossMargin >= 0 ? 'up' : 'down' },
      ],
    },
    {
      kind: 'keyvalue',
      title: L.opex,
      rows: [
        ...expenseRows,
        { label: L.totalOpex, value: `− ${m(data.totalExpenses)}`, subtotal: true, tone: 'down' },
        { label: L.result, value: m(operating), strong: true, tone: operating >= 0 ? 'up' : 'down' },
      ],
    },
    { kind: 'note', text: L.note },
  ])
  document.unit = data.currency
  const csv = toCsv(
    [L.metric, L.value],
    [
      [L.revenue, String(data.revenue)],
      [L.cogs, String(-data.cogs)],
      [L.margin, String(grossMargin)],
      ...data.expensesByCategory.map((e) => [e.name, String(-e.amount)]),
      [L.totalOpex, String(-data.totalExpenses)],
      [L.result, String(operating)],
    ],
  )
  return { document, csv }
}

// ─── 12) Inventory Turnover ──────────────────────────────────────────────────
// Turnover = annualised COGS ÷ current stock value at cost; days on hand = 365 ÷ turnover.
// Mirrors the design rTurnover template (KPIs + per-product table + portfolio total + note).
export function buildInventoryTurnoverReport(data: InventoryTurnoverReportData, opts: ReportBuildOptions): BuiltReportResult {
  const fr = isFr(opts.locale)
  const m = (x: number) => formatMoney(x, data.currency, opts.locale)
  const L = fr
    ? { title: 'Rotation des stocks', overall: 'Rotation globale', days: 'Jours de couverture', avg: 'Stock moyen', cogs: 'CMV annuel', ofCost: 'au coût', cogsH: 'coût des ventes', product: 'Produit', avgC: 'Stock (coût)', cogsC: 'CMV annuel', turn: 'Rotation', daysC: 'Couverture', speed: 'Vitesse', portfolio: 'ENSEMBLE', sec: 'Rotation par article', empty: 'Aucun article suivi.', fast: 'Rapide', steady: 'Régulier', slow: 'Lent', note: 'Rotation = CMV annuel ÷ stock moyen au coût. Couverture = 365 ÷ rotation. Les articles lents (>90 j) immobilisent la trésorerie — voir le rapport Stocks dormants.' }
    : { title: 'Inventory Turnover', overall: 'Overall turnover', days: 'Days on hand', avg: 'Avg inventory', cogs: 'Annual COGS', ofCost: 'at cost', cogsH: 'cost of goods sold', product: 'Product', avgC: 'Avg stock (cost)', cogsC: 'Annual COGS', turn: 'Turnover', daysC: 'Days on hand', speed: 'Speed', portfolio: 'PORTFOLIO', sec: 'Turnover by product', empty: 'No tracked items.', fast: 'Fast', steady: 'Steady', slow: 'Slow', note: 'Turnover = annual COGS ÷ average inventory at cost. Days on hand = 365 ÷ turnover. Slow items (>90 days) tie up cash — see the Dead / Slow-Moving Stock report.' }
  const avgTot = data.rows.reduce((s, r) => s + r.avgStockCost, 0)
  const cogsTot = data.rows.reduce((s, r) => s + r.annualCogs, 0)
  const overall = avgTot > 0 ? cogsTot / avgTot : 0
  const overallDays = overall > 0 ? Math.round(365 / overall) : 0
  const turnOf = (r: { avgStockCost: number; annualCogs: number }) => (r.avgStockCost > 0 ? r.annualCogs / r.avgStockCost : 0)
  const daysOf = (tn: number) => (tn > 0 ? Math.round(365 / tn) : 0)
  const speedOf = (dd: number, tn: number) => (tn <= 0 ? L.slow : dd <= 45 ? L.fast : dd <= 90 ? L.steady : L.slow)
  const sorted = data.rows.slice().sort((a, b) => turnOf(b) - turnOf(a))
  const document = baseDoc(L.title, opts, [
    {
      kind: 'kpis',
      items: [
        { label: L.overall, value: `${overall.toFixed(1)}×`, hint: `${L.cogs} ÷ ${L.avg}` },
        { label: L.days, value: overallDays > 0 ? `${overallDays} d` : '—' },
        { label: L.avg, value: m(avgTot), hint: L.ofCost },
        { label: L.cogs, value: m(cogsTot), hint: L.cogsH },
      ],
    },
    {
      kind: 'table',
      title: L.sec,
      columns: [
        { key: 'product', label: L.product },
        { key: 'avg', label: L.avgC, align: 'right' },
        { key: 'cogs', label: L.cogsC, align: 'right' },
        { key: 'turn', label: L.turn, align: 'right' },
        { key: 'days', label: L.daysC, align: 'right' },
        { key: 'speed', label: L.speed, align: 'right' },
      ],
      rows: sorted.map((r) => {
        const tn = turnOf(r)
        const dd = daysOf(tn)
        return { product: r.name, avg: m(r.avgStockCost), cogs: m(r.annualCogs), turn: `${tn.toFixed(1)}×`, days: dd > 0 ? `${dd} d` : '—', speed: speedOf(dd, tn) }
      }),
      total: { product: L.portfolio, avg: m(avgTot), cogs: m(cogsTot), turn: `${overall.toFixed(1)}×`, days: overallDays > 0 ? `${overallDays} d` : '—', speed: '' },
      empty: L.empty,
    },
    { kind: 'note', text: L.note },
  ])
  document.unit = data.currency
  const csv = toCsv(
    [L.product, L.avgC, L.cogsC, L.turn, L.daysC],
    sorted.map((r) => {
      const tn = turnOf(r)
      return [r.name, String(r.avgStockCost), String(r.annualCogs), tn.toFixed(1), String(daysOf(tn))]
    }),
  )
  return { document, csv }
}

// ─── 13) Dead / Slow-Moving Stock ────────────────────────────────────────────
// Products in stock with no completed sale in 60+ days (or never sold). Mirrors the design
// rDead template (KPIs + table sorted by staleness + total cash tied up + note).
export function buildDeadStockReport(data: DeadStockReportData, opts: ReportBuildOptions): BuiltReportResult {
  const fr = isFr(opts.locale)
  const m = (x: number) => formatMoney(x, data.currency, opts.locale)
  const n = (x: number) => formatNumber(x, opts.locale)
  const L = fr
    ? { title: 'Stocks dormants & à rotation lente', cash: 'Trésorerie immobilisée', critical: 'Critiques (90 j+)', oldest: 'Le plus ancien', pctInv: '% du stock', items: 'articles au coût', clear: 'à écouler', sinceSale: 'depuis la dernière vente', ofCost: 'du stock au coût', product: 'Produit', sku: 'SKU', qty: 'Qté', cost: 'Valeur au coût', lastSold: 'Dernière vente', action: 'Action', never: 'Jamais', clearNow: 'Écouler', discount: 'Solder', total: 'TOTAL IMMOBILISÉ', sec: 'Articles sans vente récente', empty: 'Aucun stock dormant — tout tourne.', note: 'Envisagez promotions, lots ou déstockage au-delà de 90 jours. Priorisez les périssables proches de péremption pour éviter une perte (charge HAO).' }
    : { title: 'Dead & Slow-Moving Stock', cash: 'Cash tied up', critical: 'Critical (90+ d)', oldest: 'Oldest', pctInv: '% of inventory', items: 'items at cost', clear: 'to clear', sinceSale: 'since last sale', ofCost: 'of stock at cost', product: 'Product', sku: 'SKU', qty: 'Qty', cost: 'Cost value', lastSold: 'Last sold', action: 'Action', never: 'Never', clearNow: 'Clear now', discount: 'Discount', total: 'TOTAL CASH TIED UP', sec: 'Items without recent sales', empty: 'No dead stock — everything is moving.', note: 'Consider promotions, bundling or clearance for items past 90 days. Prioritise perishables near expiry to avoid a write-off (HAO charge).' }
  const totalCost = data.rows.reduce((s, r) => s + r.costValue, 0)
  const critical = data.rows.filter((r) => r.daysSinceLastSale === null || r.daysSinceLastSale >= 90).length
  const oldest = data.rows.reduce((mx, r) => Math.max(mx, r.daysSinceLastSale ?? 0), 0)
  const sorted = data.rows.slice().sort((a, b) => (b.daysSinceLastSale ?? 1e9) - (a.daysSinceLastSale ?? 1e9))
  const document = baseDoc(L.title, opts, [
    {
      kind: 'kpis',
      items: [
        { label: L.cash, value: m(totalCost), hint: `${n(data.rows.length)} ${L.items}`, tone: data.rows.length > 0 ? 'warn' : 'up' },
        { label: L.critical, value: `${n(critical)}`, hint: L.clear, tone: critical > 0 ? 'down' : undefined },
        { label: L.oldest, value: oldest > 0 ? `${n(oldest)} d` : '—', hint: L.sinceSale },
        { label: L.pctInv, value: pct(data.stockCostTotal ? (totalCost / data.stockCostTotal) * 100 : 0), hint: L.ofCost },
      ],
    },
    {
      kind: 'table',
      title: L.sec,
      columns: [
        { key: 'product', label: L.product },
        { key: 'sku', label: L.sku },
        { key: 'qty', label: L.qty, align: 'right' },
        { key: 'cost', label: L.cost, align: 'right' },
        { key: 'lastSold', label: L.lastSold, align: 'right' },
        { key: 'action', label: L.action, align: 'right' },
      ],
      rows: sorted.map((r) => ({
        product: r.name,
        sku: r.sku ?? '—',
        qty: n(r.quantity),
        cost: m(r.costValue),
        lastSold: r.daysSinceLastSale === null ? L.never : `${n(r.daysSinceLastSale)} d`,
        action: r.daysSinceLastSale === null || r.daysSinceLastSale >= 90 ? L.clearNow : L.discount,
      })),
      total: { product: L.total, sku: '', qty: '', cost: m(totalCost), lastSold: '', action: '' },
      empty: L.empty,
    },
    { kind: 'note', text: L.note },
  ])
  document.unit = data.currency
  const csv = toCsv(
    [L.product, L.sku, L.qty, L.cost, L.lastSold],
    sorted.map((r) => [r.name, r.sku ?? '', String(r.quantity), String(r.costValue), r.daysSinceLastSale === null ? L.never : String(r.daysSinceLastSale)]),
  )
  return { document, csv }
}

// ─── 14) Supplier Price Trend ────────────────────────────────────────────────
// Restock unit cost per product at ~6 months ago / ~3 months ago / current, with the change.
// Mirrors the design rPrices template (table + change indicator + note).
export function buildSupplierPriceReport(data: SupplierPriceReportData, opts: ReportBuildOptions): BuiltReportResult {
  const fr = isFr(opts.locale)
  const m = (x: number) => formatMoney(x, data.currency, opts.locale)
  const L = fr
    ? { title: 'Évolution des prix fournisseurs', product: 'Produit', supplier: 'Fournisseur', p6: 'Il y a 6 mois', p3: 'Il y a 3 mois', cur: 'Actuel', change: 'Variation', sec: "Coût d'achat unitaire", empty: 'Aucun historique de réapprovisionnement.', note: 'La hausse des coûts (▲) érode les marges si les prix de vente ne suivent pas. Revoyez la tarification des articles au-delà de +3 %.' }
    : { title: 'Supplier Price Trend', product: 'Product', supplier: 'Supplier', p6: '6 mo ago', p3: '3 mo ago', cur: 'Current', change: 'Change', sec: 'Unit purchase cost', empty: 'No restock history.', note: 'Rising costs (▲) erode margins unless retail prices follow. Review pricing on items above +3%.' }
  const cell = (v: number | null) => (v === null ? '—' : m(v))
  const changeOf = (r: { cost6mo: number | null; current: number | null }): string => {
    if (r.cost6mo === null || r.current === null || r.cost6mo === 0) return '—'
    const chg = ((r.current - r.cost6mo) / r.cost6mo) * 100
    return `${chg > 0 ? '▲' : chg < 0 ? '▼' : ''} ${Math.abs(chg).toFixed(1)}%`.trim()
  }
  const document = baseDoc(L.title, opts, [
    {
      kind: 'table',
      title: L.sec,
      columns: [
        { key: 'product', label: L.product },
        { key: 'supplier', label: L.supplier },
        { key: 'p6', label: L.p6, align: 'right' },
        { key: 'p3', label: L.p3, align: 'right' },
        { key: 'cur', label: L.cur, align: 'right' },
        { key: 'change', label: L.change, align: 'right' },
      ],
      rows: data.rows.map((r) => ({ product: r.name, supplier: r.supplier ?? '—', p6: cell(r.cost6mo), p3: cell(r.cost3mo), cur: cell(r.current), change: changeOf(r) })),
      empty: L.empty,
    },
    { kind: 'note', text: L.note },
  ])
  document.unit = data.currency
  const csv = toCsv(
    [L.product, L.supplier, L.p6, L.p3, L.cur, L.change],
    data.rows.map((r) => [r.name, r.supplier ?? '', r.cost6mo === null ? '' : String(r.cost6mo), r.cost3mo === null ? '' : String(r.cost3mo), r.current === null ? '' : String(r.current), changeOf(r)]),
  )
  return { document, csv }
}

// ─── 5) Stock Movements ──────────────────────────────────────────────────────
// A period ledger of inventory movements (restocks, sales, adjustments) — one row per
// movement, newest first. Quantities only (no money), so no unit is set on the letterhead.
const MOVEMENT_LABELS: Record<string, { en: string; fr: string }> = {
  SALE: { en: 'Sale', fr: 'Vente' },
  RESTOCK_IN: { en: 'Restock', fr: 'Réappro.' },
  MANUAL_ADJUSTMENT: { en: 'Adjustment', fr: 'Ajustement' },
  VOID_REVERSAL: { en: 'Void reversal', fr: 'Annulation' },
  OPENING_STOCK: { en: 'Opening stock', fr: 'Stock initial' },
  TRANSFER_IN: { en: 'Transfer in', fr: 'Transfert entrant' },
  TRANSFER_OUT: { en: 'Transfer out', fr: 'Transfert sortant' },
}
export function buildStockMovementsReport(data: StockMovementsReportData, opts: ReportBuildOptions): BuiltReportResult {
  const fr = isFr(opts.locale)
  const n = (x: number) => formatNumber(x, opts.locale)
  // Signed, localised quantity (+in / −out) — deterministic so both sides match.
  const signed = (x: number) => (x > 0 ? `+${n(x)}` : x < 0 ? `−${n(Math.abs(x))}` : n(0))
  const typeLabel = (t: string) => (MOVEMENT_LABELS[t] ? (fr ? MOVEMENT_LABELS[t].fr : MOVEMENT_LABELS[t].en) : t)
  const when = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`.trim()
  const L = fr
    ? { title: 'Mouvements de stock', moves: 'Mouvements', unitsIn: 'Unités entrées', unitsOut: 'Unités sorties', net: 'Variation nette', date: 'Date', product: 'Produit', type: 'Type', change: 'Variation', balance: 'Solde', ref: 'Référence', empty: 'Aucun mouvement sur cette période.', trunc: 'Seuls les mouvements les plus récents sont affichés.' }
    : { title: 'Stock Movements', moves: 'Movements', unitsIn: 'Units in', unitsOut: 'Units out', net: 'Net change', date: 'Date', product: 'Product', type: 'Type', change: 'Change', balance: 'Balance', ref: 'Reference', empty: 'No stock movements in this period.', trunc: 'Only the most recent movements are shown.' }
  const net = data.totalIn - data.totalOut
  const sections: ReportDocument['sections'] = [
    {
      kind: 'kpis',
      items: [
        { label: L.moves, value: n(data.movementCount) },
        { label: L.unitsIn, value: n(data.totalIn), tone: 'up' },
        { label: L.unitsOut, value: n(data.totalOut), tone: 'down' },
        { label: L.net, value: signed(net), tone: net >= 0 ? 'up' : 'down' },
      ],
    },
    {
      kind: 'table',
      columns: [
        { key: 'date', label: L.date },
        { key: 'product', label: L.product },
        { key: 'type', label: L.type },
        { key: 'change', label: L.change, align: 'right' },
        { key: 'balance', label: L.balance, align: 'right' },
        { key: 'ref', label: L.ref },
      ],
      rows: data.rows.map((r) => ({
        date: when(r.date),
        product: r.product,
        type: typeLabel(r.type),
        change: signed(r.quantityChange),
        balance: n(r.quantityAfter),
        ref: r.reference ?? '—',
      })),
      empty: L.empty,
    },
  ]
  if (data.truncated) sections.push({ kind: 'note', text: L.trunc })
  const document = baseDoc(L.title, opts, sections)
  const csv = toCsv(
    [L.date, L.product, L.type, L.change, L.balance, L.ref],
    data.rows.map((r) => [when(r.date), r.product, typeLabel(r.type), String(r.quantityChange), String(r.quantityAfter), r.reference ?? '']),
  )
  return { document, csv }
}
