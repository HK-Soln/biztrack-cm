// Report catalogue + thin loaders. Each BUILT report fetches real data via the
// DataClient, maps it to a neutral shape, and calls the SHARED builder in
// @biztrack/templates (so the backend can build the same report for PDF/Excel).
// Reports without a real data source are `built: false` — shown disabled and not routable.
import {
  buildAgeingReport,
  buildCashierPerformanceReport,
  buildDailySalesReport,
  buildDeadStockReport,
  buildExpenseBreakdownReport,
  buildIncomeStatementReport,
  buildInventoryTurnoverReport,
  buildLowStockReport,
  buildRefundsReport,
  buildSalesByCategoryReport,
  buildSalesByPaymentReport,
  buildSalesByProductReport,
  buildStockMovementsReport,
  buildStockValuationReport,
  buildSupplierPriceReport,
} from '@biztrack/templates'
import type { BuiltReportResult, ReportBuildOptions } from '@biztrack/types'
import { DebtDirection } from '@biztrack/types'
import type { DataClient } from '@/lib/data-client'

export type ReportCategory = 'sales' | 'inventory' | 'financial' | 'tax'
export type ReportFormat = 'pdf' | 'csv'

export interface ReportMeta {
  id: string
  cat: ReportCategory
  name: string
  fr: string
  desc: string
  descFr: string
  formats: ReportFormat[]
  built: boolean
  ohada?: boolean
}

export interface ReportLoadContext {
  client: DataClient
  range: { dateFrom: string; dateTo: string }
  currency: string
  opts: ReportBuildOptions
}
export type ReportLoader = (ctx: ReportLoadContext) => Promise<BuiltReportResult>

export const REPORT_CATEGORIES: Array<{ key: ReportCategory; label: string; fr: string; sub: string; subFr: string; tag?: string }> = [
  { key: 'sales', label: 'Sales & Revenue', fr: 'Ventes & chiffre d’affaires', sub: 'Daily and periodic sales performance', subFr: 'Performance des ventes par période' },
  { key: 'inventory', label: 'Inventory & Stock', fr: 'Stock & inventaire', sub: 'Stock levels, movements and valuation', subFr: 'Niveaux, mouvements et valorisation du stock' },
  { key: 'financial', label: 'Financial Statements', fr: 'États financiers', sub: 'Statutory accounting reports', subFr: 'États comptables réglementaires', tag: 'OHADA' },
  { key: 'tax', label: 'Tax & Receivables', fr: 'Fiscalité & créances', sub: 'Compliance, debtors and creditors', subFr: 'Conformité, débiteurs et créanciers', tag: 'DGI' },
]

export const REPORTS: ReportMeta[] = [
  // Sales & Revenue
  { id: 'daily-sales', cat: 'sales', name: 'Daily Sales Summary', fr: 'Résumé des ventes du jour', desc: 'Revenue & payment mix per day', descFr: 'CA & répartition par jour', formats: ['pdf', 'csv'], built: true },
  { id: 'sales-product', cat: 'sales', name: 'Sales by Product', fr: 'Ventes par produit', desc: 'Best & slow sellers, margins per item', descFr: 'Meilleures ventes, marges par article', formats: ['pdf', 'csv'], built: true },
  { id: 'sales-payment', cat: 'sales', name: 'Sales by Payment Method', fr: 'Ventes par mode de paiement', desc: 'Cash, MTN, Orange, card, credit split', descFr: 'Espèces, MTN, Orange, carte, crédit', formats: ['pdf', 'csv'], built: true },
  { id: 'cashier', cat: 'sales', name: 'Cashier Performance', fr: 'Performance des caissiers', desc: 'Sales and shifts per team member', descFr: 'Ventes et postes par membre', formats: ['pdf'], built: true },
  { id: 'sales-category', cat: 'sales', name: 'Sales by Category', fr: 'Ventes par catégorie', desc: 'Revenue, margin & share per category', descFr: 'CA, marge & part par catégorie', formats: ['pdf', 'csv'], built: true },
  { id: 'refunds', cat: 'sales', name: 'Refunds & Returns', fr: 'Remboursements & retours', desc: 'Refunds by reason and by cashier', descFr: 'Remboursements par motif et caissier', formats: ['pdf', 'csv'], built: true },
  // Inventory & Stock
  { id: 'stock-val', cat: 'inventory', name: 'Stock Valuation', fr: 'Valorisation du stock', desc: 'Quantity on hand × cost, catalogue value', descFr: 'Quantité × coût, valeur du catalogue', formats: ['pdf', 'csv'], built: true },
  { id: 'low-stock', cat: 'inventory', name: 'Low Stock & Reorder', fr: 'Stock faible & réappro', desc: 'Items below threshold with shortfall', descFr: 'Articles sous le seuil à commander', formats: ['pdf', 'csv'], built: true },
  { id: 'stock-moves', cat: 'inventory', name: 'Stock Movements', fr: 'Mouvements de stock', desc: 'Restocks, sales, adjustments timeline', descFr: 'Réappro, ventes, ajustements', formats: ['pdf', 'csv'], built: true },
  { id: 'supplier-price', cat: 'inventory', name: 'Supplier Price Trend', fr: 'Évolution des prix fournisseurs', desc: '12-month restock cost per product', descFr: 'Coût de réappro. sur 12 mois', formats: ['pdf', 'csv'], built: true },
  { id: 'inv-turnover', cat: 'inventory', name: 'Inventory Turnover', fr: 'Rotation des stocks', desc: 'Turnover ratio & days of cover per item', descFr: 'Rotation & jours de couverture par article', formats: ['pdf', 'csv'], built: true },
  { id: 'dead-stock', cat: 'inventory', name: 'Dead / Slow-Moving Stock', fr: 'Stocks dormants', desc: 'Items with no sale in 60+ days', descFr: 'Articles sans vente depuis 60 j+', formats: ['pdf', 'csv'], built: true },
  // Financial Statements · OHADA (all deferred — need the accounting/ledger module)
  { id: 'bilan', cat: 'financial', name: 'Balance Sheet (Bilan)', fr: 'Bilan', desc: 'Assets, liabilities and equity', descFr: 'Actif, passif et capitaux propres', formats: ['pdf', 'csv'], built: false, ohada: true },
  { id: 'cr', cat: 'financial', name: 'Income Statement', fr: 'Compte de résultat', desc: 'Revenue, COGS, margin & operating result', descFr: 'Produits, coûts, marge & résultat', formats: ['pdf', 'csv'], built: true },
  { id: 'balance', cat: 'financial', name: 'Trial Balance', fr: 'Balance générale', desc: 'All accounts, debit/credit balances', descFr: 'Tous les comptes, débit/crédit', formats: ['pdf', 'csv'], built: false, ohada: true },
  { id: 'tft', cat: 'financial', name: 'Cash Flow Statement', fr: 'Tableau des flux de trésorerie', desc: 'Tableau des flux de trésorerie', descFr: 'Entrées et sorties de trésorerie', formats: ['pdf', 'csv'], built: false, ohada: true },
  // Tax & Receivables
  { id: 'expense', cat: 'tax', name: 'Expense Breakdown', fr: 'Répartition des charges', desc: 'Spending by category and period', descFr: 'Dépenses par catégorie et période', formats: ['pdf', 'csv'], built: true },
  { id: 'tva', cat: 'tax', name: 'VAT Statement (TVA)', fr: 'Déclaration de TVA', desc: 'Collectée, déductible, net payable', descFr: 'Collectée, déductible, net à payer', formats: ['pdf'], built: false, ohada: true },
  { id: 'aged-recv', cat: 'tax', name: 'Aged Receivables', fr: 'Balance âgée clients', desc: 'Outstanding debt by age bucket', descFr: 'Créances par ancienneté', formats: ['pdf', 'csv'], built: true },
  { id: 'aged-pay', cat: 'tax', name: 'Aged Payables', fr: 'Balance âgée fournisseurs', desc: 'What you owe suppliers, by age', descFr: 'Dettes par ancienneté', formats: ['pdf', 'csv'], built: true },
]

export function reportById(id: string): ReportMeta | undefined {
  return REPORTS.find((r) => r.id === id)
}
export function isRoutable(id: string): boolean {
  const r = reportById(id)
  return !!r && r.built && !!LOADERS[id]
}

export const LOADERS: Record<string, ReportLoader> = {
  'expense': async ({ client, range, opts }) => {
    const e = await client.expenses.summary(range)
    return buildExpenseBreakdownReport(
      {
        total: e.total,
        count: e.count,
        previousTotal: e.previousTotal,
        changePct: e.changePct,
        pendingCount: e.pendingCount,
        pendingAmount: e.pendingAmount,
        byCategory: e.byCategory.map((c) => ({ name: c.name, percentage: c.percentage, amount: c.amount })),
        currency: e.currency,
      },
      opts,
    )
  },
  'stock-val': async ({ client, currency, opts }) => {
    const [p, inv] = await Promise.all([client.products.stats(), client.inventory.list({ page: 1, limit: 100 })])
    const rows = inv.data.map((i) => ({ name: i.name, sku: i.sku, quantity: i.currentStock, costValue: i.stockValueCost }))
    const listed = rows.reduce((sum, r) => sum + r.costValue, 0)
    return buildStockValuationReport(
      {
        rows,
        totalSkus: p.totalSkus,
        totalCost: p.catalogValueCost,
        retailValue: p.retailValue,
        marginPct: p.blendedMarginPct,
        otherCost: Math.max(0, p.catalogValueCost - listed),
        currency: inv.data[0]?.currency ?? currency,
      },
      opts,
    )
  },
  'low-stock': async ({ client, currency, opts }) => {
    const items = await client.inventory.reorderSuggestions()
    return buildLowStockReport(
      {
        rows: items.map((r) => ({ name: r.name, sku: r.sku, onHand: r.currentStock, reorderLevel: r.target, suggestedQty: r.suggestedQty, unitCost: r.unitCost })),
        currency: items[0]?.currency ?? currency,
      },
      opts,
    )
  },
  'daily-sales': async ({ client, range, currency, opts }) => {
    const rows = await client.sales.dailySeries(range)
    return buildDailySalesReport({ rows, currency }, opts)
  },
  'cashier': async ({ client, range, currency, opts }) => {
    const rows = await client.sales.cashierRoster(range)
    return buildCashierPerformanceReport({ rows, currency }, opts)
  },
  'sales-product': async ({ client, range, currency, opts }) => {
    const rows = await client.sales.byProduct(range)
    return buildSalesByProductReport({ rows, currency }, opts)
  },
  'sales-payment': async ({ client, range, currency, opts }) => {
    const rows = await client.sales.byPaymentMethod(range)
    return buildSalesByPaymentReport({ rows, currency }, opts)
  },
  'refunds': async ({ client, range, currency, opts }) => {
    const r = await client.sales.refunds(range)
    return buildRefundsReport({ byReason: r.byReason, byCashier: r.byCashier, grossSales: r.grossSales, currency }, opts)
  },
  'sales-category': async ({ client, range, currency, opts }) => {
    // Roll up the (parity-safe) per-product aggregation to category — no extra endpoint.
    const products = await client.sales.byProduct(range)
    const uncat = opts.locale.toLowerCase().startsWith('fr') ? 'Non catégorisé' : 'Uncategorized'
    const map = new Map<string, { category: string; quantity: number; revenue: number; cogs: number }>()
    for (const p of products) {
      const key = p.category ?? uncat
      const row = map.get(key) ?? { category: key, quantity: 0, revenue: 0, cogs: 0 }
      row.quantity += p.quantity
      row.revenue += p.revenue
      row.cogs += p.cogs
      map.set(key, row)
    }
    const rows = [...map.values()].sort((a, b) => b.revenue - a.revenue)
    return buildSalesByCategoryReport({ rows, currency }, opts)
  },
  'cr': async ({ client, range, currency, opts }) => {
    const [gp, exp] = await Promise.all([client.sales.grossProfit(range), client.expenses.summary(range)])
    return buildIncomeStatementReport(
      { revenue: gp.revenue, cogs: gp.cogs, expensesByCategory: exp.byCategory.map((c) => ({ name: c.name, amount: c.amount })), totalExpenses: exp.total, currency },
      opts,
    )
  },
  'stock-moves': async ({ client, range, opts }) => {
    const res = await client.inventory.listAllMovements({ dateFrom: range.dateFrom, dateTo: range.dateTo, page: 1, limit: 100 })
    const rows = res.data.map((m) => ({
      date: m.createdAt,
      product: m.productName ?? '—',
      type: m.type,
      quantityChange: m.quantityChange,
      quantityAfter: m.quantityAfter,
      reference: m.referenceType ? `${m.referenceType}${m.referenceId ? ` ${m.referenceId.slice(0, 8)}` : ''}` : m.notes ?? null,
    }))
    const totalIn = rows.reduce((s, r) => s + (r.quantityChange > 0 ? r.quantityChange : 0), 0)
    const totalOut = rows.reduce((s, r) => s + (r.quantityChange < 0 ? -r.quantityChange : 0), 0)
    return buildStockMovementsReport({ rows, totalIn, totalOut, movementCount: res.total, truncated: res.total > rows.length }, opts)
  },
  'inv-turnover': async ({ client, range, currency, opts }) => {
    const rows = await client.inventory.turnover(range)
    return buildInventoryTurnoverReport({ rows, currency }, opts)
  },
  'dead-stock': async ({ client, currency, opts }) => {
    const { rows, stockCostTotal } = await client.inventory.deadStock()
    return buildDeadStockReport({ rows, stockCostTotal, currency }, opts)
  },
  'supplier-price': async ({ client, currency, opts }) => {
    const rows = await client.inventory.supplierPriceTrend()
    return buildSupplierPriceReport({ rows, currency }, opts)
  },
  'aged-recv': async ({ client, opts }) => {
    const report = await client.debts.ageing(DebtDirection.RECEIVABLE)
    return buildAgeingReport(report, opts, 'receivable')
  },
  'aged-pay': async ({ client, opts }) => {
    const report = await client.debts.ageing(DebtDirection.PAYABLE)
    return buildAgeingReport(report, opts, 'payable')
  },
}
