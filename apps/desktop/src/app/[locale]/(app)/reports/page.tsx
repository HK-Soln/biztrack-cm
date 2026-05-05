'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  DebtDirection,
  DebtStatus,
  InventoryMovementType,
  PaymentMethod,
  SaleStatus,
  type Debt,
  type Expense,
  type InventoryListItem,
  type InventoryMovement,
} from '@biztrack/types'
import { Badge, Button, Spinner } from '@biztrack/ui'
import { toast } from 'sonner'
import { SurfaceCard } from '@/components/catalog/SurfaceCard'
import { cn } from '@/lib/utils'
import { listAllDebtsByDirectionLocal } from '@/services/debts.local'
import { listExpenseCategoriesLocal, listExpensesLocal } from '@/services/expenses.local'
import { listInventoryLocal, listInventoryMovementsLocal } from '@/services/inventory.local'
import { hasDesktopIpc, ipc } from '@/services/ipc.bridge'
import {
  getReportRestocksSnapshotLocal,
  getReportSalesSnapshotLocal,
  type ReportRestockItemRow,
  type ReportRestockPaymentRow,
  type ReportRestockRow,
  type ReportSaleItemRow,
  type ReportSalePaymentRow,
  type ReportSaleRow,
} from '@/services/reports.local'
import { useAuthStore } from '@/stores/auth.store'

type ReportPreset = 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'quarter' | 'year' | 'custom'
type ReportSectionKey = 'sales' | 'inventory' | 'financial' | 'credit'
type ReportTone = 'default' | 'positive' | 'warning' | 'danger' | 'info'
type PreviewKind = 'trend' | 'bars' | 'ranked' | 'table' | 'note'
type TrendMode = 'day' | 'week' | 'month'

type ReportId =
  | 'daily-sales'
  | 'revenue-trend'
  | 'top-products'
  | 'cashier-performance'
  | 'payment-breakdown'
  | 'voided-sales'
  | 'stock-levels'
  | 'stock-movements'
  | 'low-stock-alerts'
  | 'restock-costs'
  | 'profit-loss'
  | 'expense-breakdown'
  | 'revenue-vs-expenses'
  | 'debtors-ageing'
  | 'creditors-ageing'
  | 'contact-statement'
  | 'credit-activity'

type AppliedRange = {
  preset: ReportPreset
  startDate: string
  endDate: string
}

type ReportDefinition = {
  id: ReportId
  section: ReportSectionKey
  badge: string
  badgeTone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  icon: ReportIconName
  name: string
  description: string
  source: string
}

type ReportStat = {
  label: string
  value: string
  hint: string
  tone?: ReportTone
}

type TrendPoint = {
  key: string
  label: string
  primary: number
  secondary: number
}

type BarRow = {
  label: string
  valueLabel: string
  percentage: number
  tone: ReportTone
  meta?: string
}

type RankedRow = {
  label: string
  valueLabel: string
  meta?: string
  tone?: ReportTone
}

type WaterfallRow = {
  label: string
  value: number
  tone: 'positive' | 'warning' | 'danger'
  total?: boolean
}

type PreviewTable = {
  columns: string[]
  rows: string[][]
}

type ExportModel = {
  title: string
  description: string
  filenameBase: string
  summaryRows: Array<{ label: string; value: string }>
  table?: PreviewTable
}

type ReportViewModel =
  | {
      kind: 'trend'
      title: string
      description: string
      stats: ReportStat[]
      legend: { primary: string; secondary: string }
      points: TrendPoint[]
      primaryMaxLabel: string
      secondaryMaxLabel: string
      empty: string
      exportModel: ExportModel
    }
  | {
      kind: 'bars'
      title: string
      description: string
      stats: ReportStat[]
      bars: BarRow[]
      empty: string
      exportModel: ExportModel
    }
  | {
      kind: 'ranked'
      title: string
      description: string
      stats: ReportStat[]
      rows: RankedRow[]
      empty: string
      exportModel: ExportModel
    }
  | {
      kind: 'table'
      title: string
      description: string
      stats: ReportStat[]
      table: PreviewTable
      empty: string
      exportModel: ExportModel
    }
  | {
      kind: 'note'
      title: string
      description: string
      stats: ReportStat[]
      note: string
      bullets: string[]
      exportModel: ExportModel
    }

type ReportsWorkspace = {
  sales: ReportSaleRow[]
  saleItems: ReportSaleItemRow[]
  salePayments: ReportSalePaymentRow[]
  restocks: ReportRestockRow[]
  restockItems: ReportRestockItemRow[]
  restockPayments: ReportRestockPaymentRow[]
  expenses: Expense[]
  inventoryItems: InventoryListItem[]
  inventoryMovements: InventoryMovement[]
  receivableDebts: Debt[]
  payableDebts: Debt[]
}

type ProductAggregate = {
  productId: string
  productName: string
  quantity: number
  revenue: number
  cost: number
}

type CashierAggregate = {
  cashierId: string
  cashierName: string
  totalSales: number
  completedSales: number
  voidedSales: number
  revenue: number
}

type ReportIconName =
  | 'receipt'
  | 'trend'
  | 'ranking'
  | 'cashier'
  | 'payments'
  | 'audit'
  | 'snapshot'
  | 'movements'
  | 'alert'
  | 'cost'
  | 'profit'
  | 'expenses'
  | 'ledger'

const MAX_DATASET_SIZE = 5000

const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: 'daily-sales',
    section: 'sales',
    badge: 'Daily',
    badgeTone: 'success',
    icon: 'receipt',
    name: 'Daily sales report',
    description: 'All sales for the selected period with totals, cashier breakdown and void visibility.',
    source: 'sales + sale_items + sale_payments',
  },
  {
    id: 'revenue-trend',
    section: 'sales',
    badge: 'Range',
    badgeTone: 'info',
    icon: 'trend',
    name: 'Revenue trend report',
    description: 'Revenue, gross profit and transaction count over any date range.',
    source: 'sales range aggregation',
  },
  {
    id: 'top-products',
    section: 'sales',
    badge: 'Ranking',
    badgeTone: 'warning',
    icon: 'ranking',
    name: 'Top products report',
    description: 'Best-selling products ranked by revenue, units sold and gross contribution.',
    source: 'sale_items aggregated',
  },
  {
    id: 'cashier-performance',
    section: 'sales',
    badge: 'Period',
    badgeTone: 'success',
    icon: 'cashier',
    name: 'Cashier performance',
    description: 'Sales per cashier with revenue, average basket size and void rate.',
    source: 'sales grouped by cashier',
  },
  {
    id: 'payment-breakdown',
    section: 'sales',
    badge: 'Analysis',
    badgeTone: 'info',
    icon: 'payments',
    name: 'Payment method breakdown',
    description: 'Cash, MTN MoMo, Orange Money, card and unpaid credit distribution.',
    source: 'sale_payments + credit balances',
  },
  {
    id: 'voided-sales',
    section: 'sales',
    badge: 'Audit',
    badgeTone: 'danger',
    icon: 'audit',
    name: 'Voided sales report',
    description: 'Every voided sale with the reason, timing and value reversed.',
    source: 'sales where status = VOIDED',
  },
  {
    id: 'stock-levels',
    section: 'inventory',
    badge: 'Snapshot',
    badgeTone: 'warning',
    icon: 'snapshot',
    name: 'Stock levels report',
    description: 'Current quantity, low-stock threshold and reorder point for tracked products.',
    source: 'inventory_levels + products',
  },
  {
    id: 'stock-movements',
    section: 'inventory',
    badge: 'Movements',
    badgeTone: 'success',
    icon: 'movements',
    name: 'Stock movement report',
    description: 'Stock in/out events across sales, restocks, adjustments and void reversals.',
    source: 'inventory_movements',
  },
  {
    id: 'low-stock-alerts',
    section: 'inventory',
    badge: 'Alert',
    badgeTone: 'danger',
    icon: 'alert',
    name: 'Low stock alert report',
    description: 'Products below threshold, sorted by urgency and shortfall.',
    source: 'inventory levels filtered',
  },
  {
    id: 'restock-costs',
    section: 'inventory',
    badge: 'Cost',
    badgeTone: 'info',
    icon: 'cost',
    name: 'Restock cost report',
    description: 'Restock operations with supplier, cost, payments and credit left unpaid.',
    source: 'restock_records + restock_items + restock_payments',
  },
  {
    id: 'profit-loss',
    section: 'financial',
    badge: 'P&L',
    badgeTone: 'success',
    icon: 'profit',
    name: 'Profit & loss statement',
    description: 'Revenue, cost of goods, expense breakdown and net result for the period.',
    source: 'sales + expenses',
  },
  {
    id: 'expense-breakdown',
    section: 'financial',
    badge: 'Expenses',
    badgeTone: 'warning',
    icon: 'expenses',
    name: 'Expense breakdown report',
    description: 'Expenses grouped by category with recurring versus one-off split.',
    source: 'expenses + expense_categories',
  },
  {
    id: 'revenue-vs-expenses',
    section: 'financial',
    badge: 'Trend',
    badgeTone: 'info',
    icon: 'trend',
    name: 'Revenue vs expenses trend',
    description: 'Revenue and expense trend over the selected period to spot pressure points.',
    source: 'sales + expenses grouped over time',
  },
  {
    id: 'debtors-ageing',
    section: 'credit',
    badge: 'Debtors',
    badgeTone: 'danger',
    icon: 'ledger',
    name: 'Debtors ageing report',
    description: 'Outstanding receivables grouped by age buckets with oldest balances highlighted.',
    source: 'debts where direction = RECEIVABLE',
  },
  {
    id: 'creditors-ageing',
    section: 'credit',
    badge: 'Creditors',
    badgeTone: 'info',
    icon: 'ledger',
    name: 'Creditors ageing report',
    description: 'Outstanding supplier balances grouped by age and urgency.',
    source: 'debts where direction = PAYABLE',
  },
  {
    id: 'contact-statement',
    section: 'credit',
    badge: 'Statement',
    badgeTone: 'success',
    icon: 'receipt',
    name: 'Contact statement',
    description: 'Single-contact ledger showing debts, payments, opening and closing balance.',
    source: 'debts + debt_payments per contact',
  },
  {
    id: 'credit-activity',
    section: 'credit',
    badge: 'Summary',
    badgeTone: 'warning',
    icon: 'payments',
    name: 'Credit activity summary',
    description: 'Credit issued, collected and written off during the selected period.',
    source: 'debts + debt_payments aggregated',
  },
]

const DEFAULT_REPORT: ReportDefinition =
  REPORT_DEFINITIONS.find((report) => report.id === 'revenue-trend') ?? REPORT_DEFINITIONS[0]!

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, offset: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + offset)
  return next
}

function startOfWeek(date: Date) {
  const next = startOfLocalDay(date)
  const day = next.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return addDays(next, diff)
}

function addMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1)
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year || 1970, (month || 1) - 1, day || 1)
}

function formatCurrency(value: number, localeTag: string) {
  return `XAF ${new Intl.NumberFormat(localeTag, {
    maximumFractionDigits: 0,
  }).format(Math.round(value))}`
}

function formatCurrencyCompact(value: number, localeTag: string) {
  if (Math.abs(value) >= 1_000_000) {
    return `XAF ${(value / 1_000_000).toLocaleString(localeTag, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    })}M`
  }

  if (Math.abs(value) >= 1_000) {
    return `XAF ${(value / 1_000).toLocaleString(localeTag, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    })}k`
  }

  return formatCurrency(value, localeTag)
}

function formatNumber(value: number, localeTag: string) {
  return new Intl.NumberFormat(localeTag, {
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

function formatPercent(value: number, localeTag: string) {
  return new Intl.NumberFormat(localeTag, {
    maximumFractionDigits: 1,
  }).format(value)
}

function formatDateLabel(dateKey: string, localeTag: string) {
  return new Intl.DateTimeFormat(localeTag, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parseDateKey(dateKey))
}

function formatDateTimeLabel(value: string, localeTag: string) {
  return new Intl.DateTimeFormat(localeTag, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function resolvePresetRange(preset: Exclude<ReportPreset, 'custom'>): AppliedRange {
  const today = startOfLocalDay(new Date())

  if (preset === 'today') {
    const current = formatDateKey(today)
    return {
      preset,
      startDate: current,
      endDate: current,
    }
  }

  if (preset === 'last7') {
    return {
      preset,
      startDate: formatDateKey(addDays(today, -6)),
      endDate: formatDateKey(today),
    }
  }

  if (preset === 'lastMonth') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const end = new Date(today.getFullYear(), today.getMonth(), 0)
    return {
      preset,
      startDate: formatDateKey(start),
      endDate: formatDateKey(end),
    }
  }

  if (preset === 'quarter') {
    const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3
    const start = new Date(today.getFullYear(), quarterStartMonth, 1)
    return {
      preset,
      startDate: formatDateKey(start),
      endDate: formatDateKey(today),
    }
  }

  if (preset === 'year') {
    const start = new Date(today.getFullYear(), 0, 1)
    return {
      preset,
      startDate: formatDateKey(start),
      endDate: formatDateKey(today),
    }
  }

  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return {
    preset: 'thisMonth',
    startDate: formatDateKey(start),
    endDate: formatDateKey(today),
  }
}

function toIsoRangeStart(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toISOString()
}

function toIsoRangeEnd(dateKey: string) {
  return new Date(`${dateKey}T23:59:59.999`).toISOString()
}

function buildRangeLabel(startDate: string, endDate: string, localeTag: string) {
  if (startDate === endDate) {
    return formatDateLabel(startDate, localeTag)
  }

  return `${formatDateLabel(startDate, localeTag)} - ${formatDateLabel(endDate, localeTag)}`
}

function daysBetweenInclusive(startDate: string, endDate: string) {
  const diff = startOfLocalDay(parseDateKey(endDate)).getTime() - startOfLocalDay(parseDateKey(startDate)).getTime()
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1
}

function getPaymentLabel(
  method: string | PaymentMethod | null | undefined,
  tSell: ReturnType<typeof useTranslations<'app.sell'>>,
) {
  switch (method) {
    case PaymentMethod.CASH:
      return tSell('cash')
    case PaymentMethod.MTN_MOMO:
      return tSell('mtn_momo')
    case PaymentMethod.ORANGE_MONEY:
      return tSell('orange_money')
    case PaymentMethod.CARD:
      return tSell('card')
    case PaymentMethod.MIXED:
      return 'Mixed'
    default:
      return 'Unknown'
  }
}

function getMovementTypeLabel(type: InventoryMovementType | string) {
  switch (type) {
    case InventoryMovementType.SALE:
      return 'Sale deduction'
    case InventoryMovementType.RESTOCK_IN:
      return 'Restock'
    case InventoryMovementType.MANUAL_ADJUSTMENT:
      return 'Manual adjustment'
    case InventoryMovementType.VOID_REVERSAL:
      return 'Void reversal'
    case InventoryMovementType.OPENING_STOCK:
      return 'Opening stock'
    case InventoryMovementType.TRANSFER_IN:
      return 'Transfer in'
    case InventoryMovementType.TRANSFER_OUT:
      return 'Transfer out'
    default:
      return String(type).replace(/_/g, ' ')
  }
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'report'
  )
}

function sumNumbers(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

function percentageOf(value: number, total: number) {
  if (total <= 0) {
    return 0
  }

  return (value / total) * 100
}

function isOpenDebt(status: DebtStatus, outstandingAmount: number) {
  return (
    outstandingAmount > 0 &&
    (status === DebtStatus.OUTSTANDING || status === DebtStatus.PARTIALLY_PAID)
  )
}

function getAgeDays(value: string) {
  const target = startOfLocalDay(new Date(value))
  const today = startOfLocalDay(new Date())
  return Math.max(0, Math.floor((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000)))
}

function escapeCsvCell(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}

function buildCsvContent(model: ExportModel) {
  const rows: string[][] = [
    [model.title],
    [model.description],
    [],
    ...model.summaryRows.map((row) => [row.label, row.value]),
  ]

  if (model.table) {
    rows.push([])
    rows.push(model.table.columns)
    rows.push(...model.table.rows)
  }

  return rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\r\n')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildReportPdfHtml(input: {
  title: string
  description: string
  rangeLabel: string
  generatedOn: string
  summaryRows: Array<{ label: string; value: string }>
  table?: PreviewTable
}) {
  const summaryHtml = input.summaryRows
    .map(
      (row) => `
        <div class="summary-row">
          <span class="summary-label">${escapeHtml(row.label)}</span>
          <span class="summary-value">${escapeHtml(row.value)}</span>
        </div>
      `,
    )
    .join('')

  const tableHeadHtml = input.table
    ? `<thead><tr>${input.table.columns
        .map((column) => `<th>${escapeHtml(column)}</th>`)
        .join('')}</tr></thead>`
    : ''
  const tableBodyHtml = input.table
    ? `<tbody>${input.table.rows
        .map(
          (row) => `
            <tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>
          `,
        )
        .join('')}</tbody>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 28px;
      font-family: Inter, Arial, sans-serif;
      color: #1f1e1c;
      background: #ffffff;
    }
    .shell {
      border: 1px solid #d9d6cf;
      border-radius: 20px;
      overflow: hidden;
    }
    .hero {
      background: linear-gradient(135deg, #042c53 0%, #185fa5 58%, #85b7eb 100%);
      color: white;
      padding: 24px 28px;
    }
    .hero h1 {
      margin: 0 0 8px;
      font-size: 24px;
    }
    .hero p {
      margin: 0;
      font-size: 13px;
      opacity: 0.86;
    }
    .body {
      padding: 24px 28px 28px;
    }
    .meta {
      display: flex;
      gap: 18px;
      flex-wrap: wrap;
      margin-bottom: 18px;
      font-size: 12px;
      color: #6b6861;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 22px;
    }
    .summary-row {
      border: 1px solid #efece7;
      border-radius: 14px;
      padding: 12px 14px;
      background: #faf9f6;
    }
    .summary-label {
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #8c8980;
      margin-bottom: 8px;
    }
    .summary-value {
      display: block;
      font-size: 16px;
      font-weight: 600;
      color: #1f1e1c;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th {
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #8c8980;
      padding: 10px 12px;
      border-bottom: 1px solid #d9d6cf;
      background: #f8f7f4;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #efece7;
      vertical-align: top;
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="hero">
      <h1>${escapeHtml(input.title)}</h1>
      <p>${escapeHtml(input.description)}</p>
    </div>
    <div class="body">
      <div class="meta">
        <span>Range: ${escapeHtml(input.rangeLabel)}</span>
        <span>Generated: ${escapeHtml(input.generatedOn)}</span>
      </div>
      <div class="summary-grid">${summaryHtml}</div>
      ${
        input.table
          ? `<table>${tableHeadHtml}${tableBodyHtml}</table>`
          : `<p style="margin: 0; color: #6b6861; font-size: 12px;">No detail rows available for this report preview.</p>`
      }
    </div>
  </div>
</body>
</html>`
}

function toPdfLiteralString(value: string) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')

  return `(${normalized.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`
}

function buildSimplePdfBlob(lines: string[]) {
  const pageWidth = 595
  const pageHeight = Math.max(842, 80 + lines.length * 14)
  const paddingX = 36
  const topY = pageHeight - 42
  const lineHeight = 14
  const content = [
    'BT',
    '/F1 10 Tf',
    ...lines.map((line, index) => `1 0 0 1 ${paddingX} ${(topY - index * lineHeight).toFixed(2)} Tm ${toPdfLiteralString(line)} Tj`),
    'ET',
  ].join('\n')

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
    `5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
  ]

  const offsets: number[] = []
  let pdf = '%PDF-1.4\n'

  for (const object of objects) {
    offsets.push(pdf.length)
    pdf += object
  }

  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'

  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return new Blob([pdf], { type: 'application/pdf' })
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function getGroupMode(range: AppliedRange): TrendMode {
  const totalDays = daysBetweenInclusive(range.startDate, range.endDate)

  if (totalDays > 120) {
    return 'month'
  }

  if (totalDays > 45) {
    return 'week'
  }

  return 'day'
}

function buildRevenueTrendPoints(
  sales: ReportSaleRow[],
  localeTag: string,
  mode: TrendMode,
) {
  const grouped = new Map<string, TrendPoint>()

  for (const sale of sales) {
    if (sale.status !== SaleStatus.COMPLETED) {
      continue
    }

    const saleDate = sale.sale_date || (sale.sold_at ? sale.sold_at.slice(0, 10) : sale.created_at.slice(0, 10))
    const date = parseDateKey(saleDate)
    let key = saleDate
    let label = new Intl.DateTimeFormat(localeTag, { day: 'numeric', month: 'short' }).format(date)

    if (mode === 'week') {
      key = formatDateKey(startOfWeek(date))
      label = `Wk ${new Intl.DateTimeFormat(localeTag, { day: 'numeric', month: 'short' }).format(parseDateKey(key))}`
    }

    if (mode === 'month') {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      label = new Intl.DateTimeFormat(localeTag, { month: 'short', year: '2-digit' }).format(date)
    }

    const current = grouped.get(key) ?? {
      key,
      label,
      primary: 0,
      secondary: 0,
    }

    current.primary += sale.total_amount ?? 0
    current.secondary += 1
    grouped.set(key, current)
  }

  return Array.from(grouped.values()).sort((left, right) => left.key.localeCompare(right.key))
}

function buildRevenueVsExpensesPoints(
  sales: ReportSaleRow[],
  expenses: Expense[],
  localeTag: string,
) {
  const grouped = new Map<string, TrendPoint>()

  for (const sale of sales) {
    if (sale.status !== SaleStatus.COMPLETED) {
      continue
    }

    const saleDate = sale.sale_date || sale.created_at.slice(0, 10)
    const date = parseDateKey(saleDate)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = new Intl.DateTimeFormat(localeTag, { month: 'short', year: '2-digit' }).format(date)
    const current = grouped.get(key) ?? { key, label, primary: 0, secondary: 0 }
    current.primary += sale.total_amount ?? 0
    grouped.set(key, current)
  }

  for (const expense of expenses) {
    const date = parseDateKey(expense.expenseDate)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = new Intl.DateTimeFormat(localeTag, { month: 'short', year: '2-digit' }).format(date)
    const current = grouped.get(key) ?? { key, label, primary: 0, secondary: 0 }
    current.secondary += expense.amount
    grouped.set(key, current)
  }

  return Array.from(grouped.values()).sort((left, right) => left.key.localeCompare(right.key))
}

function buildAgeingRows(
  debts: Debt[],
  localeTag: string,
): Array<{
  label: string
  amount: number
  count: number
  percentage: number
}> {
  const buckets = [
    { label: '0-7 days', min: 0, max: 7, amount: 0, count: 0 },
    { label: '8-15 days', min: 8, max: 15, amount: 0, count: 0 },
    { label: '16-30 days', min: 16, max: 30, amount: 0, count: 0 },
    { label: '30+ days', min: 31, max: Number.POSITIVE_INFINITY, amount: 0, count: 0 },
  ]

  const openDebts = debts.filter((debt) => isOpenDebt(debt.status, debt.outstandingAmount))
  const totalOutstanding = sumNumbers(openDebts.map((debt) => debt.outstandingAmount))

  for (const debt of openDebts) {
    const ageDays = getAgeDays(debt.createdAt)
    const bucket = buckets.find((entry) => ageDays >= entry.min && ageDays <= entry.max)

    if (!bucket) {
      continue
    }

    bucket.amount += debt.outstandingAmount
    bucket.count += 1
  }

  return buckets.map((bucket) => ({
    label: bucket.label,
    amount: bucket.amount,
    count: bucket.count,
    percentage: Number(percentageOf(bucket.amount, totalOutstanding).toFixed(1)),
  }))
}

function getReportIconWrapperClassName(tone: ReportDefinition['badgeTone']) {
  if (tone === 'success') {
    return 'bg-success-50 text-success-600'
  }
  if (tone === 'warning') {
    return 'bg-warning-50 text-warning-600'
  }
  if (tone === 'danger') {
    return 'bg-danger-50 text-danger-600'
  }
  if (tone === 'info') {
    return 'bg-brand-50 text-brand-600'
  }
  return 'bg-muted text-muted-foreground'
}

function ReportIcon({ name }: { name: ReportIconName }) {
  switch (name) {
    case 'receipt':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 2.5h10v11l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3V2.5Z" />
          <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3.5" />
        </svg>
      )
    case 'trend':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M2 13.5h12" />
          <path d="m3 10 3-3 2 2 5-5" />
        </svg>
      )
    case 'ranking':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 12.5V7.5M8 12.5V4.5M13 12.5V2.5" />
        </svg>
      )
    case 'cashier':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="8" cy="5" r="2.5" />
          <path d="M3 13c1.2-2 3-3 5-3s3.8 1 5 3" />
        </svg>
      )
    case 'payments':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="2.5" y="4" width="11" height="8" rx="1.5" />
          <path d="M2.5 6.5h11M5 9h2.5" />
        </svg>
      )
    case 'audit':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="8" cy="8" r="5.5" />
          <path d="m5.5 5.5 5 5M10.5 5.5l-5 5" />
        </svg>
      )
    case 'snapshot':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M2.5 5.5 8 2.5l5.5 3v5L8 13.5l-5.5-3v-5Z" />
          <path d="M8 2.5v11M2.5 5.5 8 8.5l5.5-3" />
        </svg>
      )
    case 'movements':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 5h7M3 11h7M8 2l3 3-3 3M8 8l3 3-3 3" />
        </svg>
      )
    case 'alert':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M8 2.5 14 13.5H2L8 2.5Z" />
          <path d="M8 6v3.5M8 12h.01" />
        </svg>
      )
    case 'cost':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 4.5h10v7H3z" />
          <path d="M5.5 7.5h5" />
          <path d="M6.5 10h3" />
        </svg>
      )
    case 'profit':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M2.5 13.5h11" />
          <path d="m3.5 10.5 2.2-2.2 2 2 4.3-5.3" />
        </svg>
      )
    case 'expenses':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M4 2.5h8v11H4z" />
          <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
        </svg>
      )
    case 'ledger':
    default:
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 2.5h10v11H3z" />
          <path d="M5 5.5h6M5 8h6M5 10.5h4" />
        </svg>
      )
  }
}

function ReportMetricCard({ stat }: { stat: ReportStat }) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-4',
        stat.tone === 'positive' && 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10',
        stat.tone === 'warning' && 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10',
        stat.tone === 'danger' && 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10',
        stat.tone === 'info' && 'border-brand-100 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10',
        (!stat.tone || stat.tone === 'default') && 'border-border bg-card',
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {stat.label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{stat.value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{stat.hint}</p>
    </div>
  )
}

function DualSeriesTrendChart({
  points,
  primaryMaxLabel,
  secondaryMaxLabel,
}: {
  points: TrendPoint[]
  primaryMaxLabel: string
  secondaryMaxLabel: string
}) {
  const width = 760
  const height = 220
  const padding = { top: 18, right: 24, bottom: 34, left: 18 }
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom
  const maxPrimary = Math.max(...points.map((point) => point.primary), 1)
  const maxSecondary = Math.max(...points.map((point) => point.secondary), 1)
  const slotWidth = innerWidth / Math.max(points.length, 1)
  const barWidth = Math.min(28, Math.max(slotWidth * 0.54, 8))

  const bars = points.map((point, index) => {
    const x = padding.left + index * slotWidth + (slotWidth - barWidth) / 2
    const barHeight = (point.primary / maxPrimary) * innerHeight
    const y = padding.top + innerHeight - barHeight

    return {
      ...point,
      x,
      y,
      barHeight,
      barWidth,
    }
  })

  const linePoints = points
    .map((point, index) => {
      const x = padding.left + index * slotWidth + slotWidth / 2
      const y = padding.top + innerHeight - (point.secondary / maxSecondary) * innerHeight
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/70 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full" role="img" aria-label="Report trend chart">
        {[0, 0.33, 0.66, 1].map((step, index) => {
          const y = padding.top + innerHeight * step
          return (
            <line
              key={`guide-${index}`}
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity="0.08"
            />
          )
        })}

        {bars.map((bar) => (
          <rect
            key={bar.key}
            x={bar.x}
            y={bar.y}
            width={bar.barWidth}
            height={Math.max(bar.barHeight, 3)}
            rx="4"
            fill="#1D9E75"
          />
        ))}

        {points.length > 1 ? (
          <polyline
            fill="none"
            stroke="#A29F97"
            strokeWidth="2"
            strokeDasharray="4 4"
            points={linePoints}
          />
        ) : null}

        {points.map((point, index) => {
          const x = padding.left + index * slotWidth + slotWidth / 2
          const y = padding.top + innerHeight - (point.secondary / maxSecondary) * innerHeight
          return <circle key={`point-${point.key}`} cx={x} cy={y} r="3.5" fill="#A29F97" />
        })}

        {bars.map((bar) => (
          <text
            key={`label-${bar.key}`}
            x={bar.x + bar.barWidth / 2}
            y={height - 10}
            textAnchor="middle"
            fontSize="10"
            fill="currentColor"
            opacity="0.65"
          >
            {bar.label}
          </text>
        ))}

        <text x={padding.left} y="12" fontSize="10" fill="currentColor" opacity="0.6">
          {primaryMaxLabel}
        </text>
        <text x={width - padding.right} y="12" fontSize="10" textAnchor="end" fill="currentColor" opacity="0.6">
          {secondaryMaxLabel}
        </text>
      </svg>
    </div>
  )
}

function PreviewTableView({ table }: { table: PreviewTable }) {
  return (
    <div className="overflow-auto biztrack-scrollbar">
      <table className="min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {table.columns.map((column) => (
              <th key={column} className="border-b border-border px-3 py-3 font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row.join('-')}`} className="transition hover:bg-background/80">
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`} className="border-b border-border/70 px-3 py-3 text-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="5.5" />
      <path d="m14 14 3 3" />
    </svg>
  )
}

export default function ReportsPage() {
  const t = useTranslations('app.reports')
  const tSell = useTranslations('app.sell')
  const locale = useLocale()
  const localeTag = locale.startsWith('fr') ? 'fr-CM' : 'en-GB'
  const businessId = useAuthStore((state) => state.businessId)
  const defaultRange = useMemo(() => resolvePresetRange('thisMonth'), [])
  const [selectedReportId, setSelectedReportId] = useState<ReportId>('revenue-trend')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [appliedRange, setAppliedRange] = useState<AppliedRange>(defaultRange)
  const [draftStartDate, setDraftStartDate] = useState(defaultRange.startDate)
  const [draftEndDate, setDraftEndDate] = useState(defaultRange.endDate)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [workspace, setWorkspace] = useState<ReportsWorkspace | null>(null)
  const [exportingCsv, setExportingCsv] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [sharingPdf, setSharingPdf] = useState(false)

  useEffect(() => {
    if (!businessId) {
      setWorkspace(null)
      setLoading(false)
      setError(null)
      return
    }

    let active = true
    const currentBusinessId = businessId

    async function loadReportsWorkspace() {
      setLoading(true)
      setError(null)

      try {
        const [salesSnapshot, restockSnapshot, expensesResult, inventoryResult, movementResult, receivableDebts, payableDebts] =
          await Promise.all([
            getReportSalesSnapshotLocal(currentBusinessId, appliedRange.startDate, appliedRange.endDate),
            getReportRestocksSnapshotLocal(currentBusinessId, appliedRange.startDate, appliedRange.endDate),
            listExpensesLocal(currentBusinessId, {
              page: 1,
              limit: MAX_DATASET_SIZE,
              sortBy: 'expenseDate',
              sortOrder: 'DESC',
              dateFrom: appliedRange.startDate,
              dateTo: appliedRange.endDate,
            }),
            listInventoryLocal(currentBusinessId, {
              page: 1,
              limit: MAX_DATASET_SIZE,
              sortBy: 'productName',
              sortOrder: 'ASC',
            }),
            listInventoryMovementsLocal(currentBusinessId, {
              page: 1,
              limit: MAX_DATASET_SIZE,
              sortBy: 'createdAt',
              sortOrder: 'DESC',
              dateFrom: toIsoRangeStart(appliedRange.startDate),
              dateTo: toIsoRangeEnd(appliedRange.endDate),
            }),
            listAllDebtsByDirectionLocal(currentBusinessId, DebtDirection.RECEIVABLE, {
              includePayments: true,
            }),
            listAllDebtsByDirectionLocal(currentBusinessId, DebtDirection.PAYABLE, {
              includePayments: true,
            }),
            listExpenseCategoriesLocal(currentBusinessId),
          ])

        if (!active) {
          return
        }

        setWorkspace({
          sales: salesSnapshot.sales,
          saleItems: salesSnapshot.items,
          salePayments: salesSnapshot.payments,
          restocks: restockSnapshot.restocks,
          restockItems: restockSnapshot.items,
          restockPayments: restockSnapshot.payments,
          expenses: expensesResult.data,
          inventoryItems: inventoryResult.data,
          inventoryMovements: movementResult.data,
          receivableDebts,
          payableDebts,
        })
      } catch (loadError) {
        if (!active) {
          return
        }

        setWorkspace(null)
        setError(loadError instanceof Error ? loadError.message : t('load_error'))
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadReportsWorkspace()

    return () => {
      active = false
    }
  }, [appliedRange.endDate, appliedRange.startDate, businessId, reloadKey, t])

  const selectedReport = useMemo<ReportDefinition>(
    () => REPORT_DEFINITIONS.find((report) => report.id === selectedReportId) ?? DEFAULT_REPORT,
    [selectedReportId],
  )

  const sectionLabels = useMemo<Record<ReportSectionKey, string>>(
    () => ({
      sales: t('sections.sales'),
      inventory: t('sections.inventory'),
      financial: t('sections.financial'),
      credit: t('sections.credit'),
    }),
    [t],
  )

  const filteredReports = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    if (!query) {
      return REPORT_DEFINITIONS
    }

    return REPORT_DEFINITIONS.filter((report) => {
      const haystack = [
        report.name,
        report.description,
        report.source,
        report.badge,
        report.id.replace(/-/g, ' '),
        sectionLabels[report.section],
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [deferredSearch, sectionLabels])

  useEffect(() => {
    const nextSelectedReport = filteredReports[0]
    if (!nextSelectedReport) {
      return
    }

    if (!filteredReports.some((report) => report.id === selectedReportId)) {
      setSelectedReportId(nextSelectedReport.id)
    }
  }, [filteredReports, selectedReportId])

  const derived = useMemo(() => {
    const sales = workspace?.sales ?? []
    const saleItems = workspace?.saleItems ?? []
    const salePayments = workspace?.salePayments ?? []
    const expenses = workspace?.expenses ?? []
    const inventoryItems = workspace?.inventoryItems ?? []
    const inventoryMovements = workspace?.inventoryMovements ?? []
    const restocks = workspace?.restocks ?? []
    const receivableDebts = workspace?.receivableDebts ?? []
    const payableDebts = workspace?.payableDebts ?? []

    const completedSales = sales.filter((sale) => sale.status === SaleStatus.COMPLETED)
    const voidedSales = sales.filter((sale) => sale.status === SaleStatus.VOIDED)
    const completedSaleIds = new Set(completedSales.map((sale) => sale.id))
    const completedItems = saleItems.filter((item) => completedSaleIds.has(item.sale_id))
    const completedPayments = salePayments.filter((payment) => completedSaleIds.has(payment.sale_id))
    const totalRevenue = sumNumbers(completedSales.map((sale) => sale.total_amount ?? 0))
    const totalCost = sumNumbers(
      completedItems.map((item) => (item.cost_price ?? 0) * item.quantity),
    )
    const grossProfit = totalRevenue - totalCost
    const totalExpenses = sumNumbers(expenses.map((expense) => expense.amount))
    const netProfit = grossProfit - totalExpenses
    const averageOrderValue = completedSales.length > 0 ? totalRevenue / completedSales.length : 0
    const totalCreditIssued = sumNumbers(completedSales.map((sale) => sale.credit_amount ?? 0))
    const paymentTotals = new Map<string, number>()
    for (const payment of completedPayments) {
      paymentTotals.set(payment.method, (paymentTotals.get(payment.method) ?? 0) + payment.amount)
    }

    const productMap = new Map<string, ProductAggregate>()
    for (const item of completedItems) {
      const current = productMap.get(item.product_id) ?? {
        productId: item.product_id,
        productName: item.product_name,
        quantity: 0,
        revenue: 0,
        cost: 0,
      }

      current.quantity += item.quantity
      current.revenue += item.line_total ?? item.total_price ?? 0
      current.cost += (item.cost_price ?? 0) * item.quantity
      productMap.set(item.product_id, current)
    }

    const topProducts = Array.from(productMap.values()).sort((left, right) => right.revenue - left.revenue)

    const cashierMap = new Map<string, CashierAggregate>()
    for (const sale of sales) {
      const key = sale.cashier_id || 'unknown'
      const current = cashierMap.get(key) ?? {
        cashierId: key,
        cashierName: sale.cashier_name || 'Local user',
        totalSales: 0,
        completedSales: 0,
        voidedSales: 0,
        revenue: 0,
      }

      current.totalSales += 1
      if (sale.status === SaleStatus.COMPLETED) {
        current.completedSales += 1
        current.revenue += sale.total_amount ?? 0
      }
      if (sale.status === SaleStatus.VOIDED) {
        current.voidedSales += 1
      }

      cashierMap.set(key, current)
    }

    const cashierRows = Array.from(cashierMap.values()).sort((left, right) => right.revenue - left.revenue)
    const lowStockItems = inventoryItems
      .filter((item) => item.isLowStock)
      .sort((left, right) => {
        const leftShortfall = (left.lowStockThreshold ?? 0) - left.quantity
        const rightShortfall = (right.lowStockThreshold ?? 0) - right.quantity
        return rightShortfall - leftShortfall
      })
    const expenseByCategory = new Map<string, { name: string; amount: number; recurringAmount: number; count: number }>()
    for (const expense of expenses) {
      const categoryName = expense.category?.name || t('uncategorized')
      const current = expenseByCategory.get(categoryName) ?? {
        name: categoryName,
        amount: 0,
        recurringAmount: 0,
        count: 0,
      }
      current.amount += expense.amount
      if (expense.isRecurring) {
        current.recurringAmount += expense.amount
      }
      current.count += 1
      expenseByCategory.set(categoryName, current)
    }
    const expenseCategoryRows = Array.from(expenseByCategory.values()).sort((left, right) => right.amount - left.amount)

    const movementTypeTotals = new Map<string, { label: string; quantity: number; count: number }>()
    for (const movement of inventoryMovements) {
      const key = movement.type
      const current = movementTypeTotals.get(key) ?? {
        label: getMovementTypeLabel(movement.type),
        quantity: 0,
        count: 0,
      }
      current.quantity += Math.abs(movement.quantityChange)
      current.count += 1
      movementTypeTotals.set(key, current)
    }
    const movementRows = Array.from(movementTypeTotals.values()).sort((left, right) => right.count - left.count)

    const receivableAgeing = buildAgeingRows(receivableDebts, localeTag)
    const payableAgeing = buildAgeingRows(payableDebts, localeTag)
    const openReceivableDebts = receivableDebts
      .filter((debt) => isOpenDebt(debt.status, debt.outstandingAmount))
      .sort((left, right) => right.outstandingAmount - left.outstandingAmount)
    const openPayableDebts = payableDebts
      .filter((debt) => isOpenDebt(debt.status, debt.outstandingAmount))
      .sort((left, right) => right.outstandingAmount - left.outstandingAmount)

    const contactBalanceRows = [...openReceivableDebts, ...openPayableDebts]
      .map((debt) => ({
        contactName: debt.contact?.name || debt.sourceReference,
        direction: debt.direction,
        balance: debt.outstandingAmount,
        reference: debt.sourceReference,
      }))
      .sort((left, right) => right.balance - left.balance)

    const collectedReceivable = sumNumbers(
      receivableDebts.flatMap((debt) =>
        (debt.payments ?? [])
          .filter((payment) => payment.paymentDate >= appliedRange.startDate && payment.paymentDate <= appliedRange.endDate)
          .map((payment) => payment.amount),
      ),
    )
    const writtenOffReceivable = sumNumbers(
      receivableDebts
        .filter(
          (debt) =>
            debt.status === DebtStatus.WRITTEN_OFF &&
            debt.writtenOffAt &&
            debt.writtenOffAt.slice(0, 10) >= appliedRange.startDate &&
            debt.writtenOffAt.slice(0, 10) <= appliedRange.endDate,
        )
        .map((debt) => debt.outstandingAmount),
    )
    const issuedReceivable = sumNumbers(
      receivableDebts
        .filter((debt) => debt.createdAt.slice(0, 10) >= appliedRange.startDate && debt.createdAt.slice(0, 10) <= appliedRange.endDate)
        .map((debt) => debt.originalAmount),
    )

    return {
      sales,
      completedSales,
      voidedSales,
      completedItems,
      completedPayments,
      totalRevenue,
      totalCost,
      grossProfit,
      totalExpenses,
      netProfit,
      averageOrderValue,
      totalCreditIssued,
      paymentTotals,
      topProducts,
      cashierRows,
      lowStockItems,
      expenseCategoryRows,
      movementRows,
      receivableAgeing,
      payableAgeing,
      openReceivableDebts,
      openPayableDebts,
      contactBalanceRows,
      collectedReceivable,
      writtenOffReceivable,
      issuedReceivable,
      restocks,
      inventoryItems,
      inventoryMovements,
      expenses,
    }
  }, [appliedRange.endDate, appliedRange.startDate, localeTag, t, workspace])

  const pnlRows = useMemo(() => {
    const expenseRows = [...derived.expenseCategoryRows]
    const topExpenseRows = expenseRows.slice(0, 5)
    const remainingExpenses = expenseRows.slice(5)
    const otherAmount = sumNumbers(remainingExpenses.map((row) => row.amount))

    const rows: WaterfallRow[] = [
      {
        label: t('waterfall.revenue'),
        value: derived.totalRevenue,
        tone: 'positive' as const,
      },
      {
        label: t('waterfall.cogs'),
        value: -derived.totalCost,
        tone: 'danger' as const,
      },
      {
        label: t('waterfall.gross_profit'),
        value: derived.grossProfit,
        tone: derived.grossProfit >= 0 ? ('positive' as const) : ('danger' as const),
        total: true,
      },
      ...topExpenseRows.map((row) => ({
        label: row.name,
        value: -row.amount,
        tone: 'warning' as const,
      })),
      ...(otherAmount > 0
        ? [
            {
              label: t('waterfall.other_expenses'),
              value: -otherAmount,
              tone: 'warning' as const,
            },
          ]
        : []),
      {
        label: t('waterfall.total_expenses'),
        value: -derived.totalExpenses,
        tone: 'danger' as const,
        total: true,
      },
      {
        label: t('waterfall.net_profit'),
        value: derived.netProfit,
        tone: derived.netProfit >= 0 ? ('positive' as const) : ('danger' as const),
        total: true,
      },
    ]

    const maxMagnitude = Math.max(
      derived.totalRevenue,
      ...rows.map((row) => Math.abs(row.value)),
      1,
    )

    return rows.map((row) => ({
      ...row,
      percent: Math.max(6, Math.round((Math.abs(row.value) / maxMagnitude) * 100)),
    }))
  }, [derived.expenseCategoryRows, derived.grossProfit, derived.netProfit, derived.totalCost, derived.totalExpenses, derived.totalRevenue, t])

  const reportViewModel = useMemo<ReportViewModel>(() => {
    const rangeLabel = buildRangeLabel(appliedRange.startDate, appliedRange.endDate, localeTag)
    const exportBase = `${slugify(selectedReport.name)}-${appliedRange.startDate}-${appliedRange.endDate}`

    if (selectedReport.id === 'revenue-trend') {
      const points = buildRevenueTrendPoints(derived.completedSales, localeTag, getGroupMode(appliedRange))

      return {
        kind: 'trend',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.revenue'),
            value: formatCurrencyCompact(derived.totalRevenue, localeTag),
            hint: `${formatNumber(derived.completedSales.length, localeTag)} ${t('stats.transactions_hint')}`,
            tone: 'positive',
          },
          {
            label: t('stats.gross_profit'),
            value: formatCurrencyCompact(derived.grossProfit, localeTag),
            hint: `${formatPercent(percentageOf(derived.grossProfit, derived.totalRevenue), localeTag)}% ${t('stats.margin_hint')}`,
            tone: derived.grossProfit >= 0 ? 'info' : 'danger',
          },
          {
            label: t('stats.avg_basket'),
            value: formatCurrencyCompact(derived.averageOrderValue, localeTag),
            hint: t('stats.avg_basket_hint'),
            tone: 'default',
          },
        ],
        legend: {
          primary: t('preview.legend_revenue'),
          secondary: t('preview.legend_transactions'),
        },
        points,
        primaryMaxLabel: formatCurrencyCompact(Math.max(...points.map((point) => point.primary), 0), localeTag),
        secondaryMaxLabel: formatNumber(Math.max(...points.map((point) => point.secondary), 0), localeTag),
        empty: t('preview.no_sales_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.revenue'), value: formatCurrency(derived.totalRevenue, localeTag) },
            { label: t('stats.gross_profit'), value: formatCurrency(derived.grossProfit, localeTag) },
            { label: t('stats.avg_basket'), value: formatCurrency(derived.averageOrderValue, localeTag) },
          ],
          table: {
            columns: [t('table.period'), t('preview.legend_revenue'), t('preview.legend_transactions')],
            rows: points.map((point) => [
              point.label,
              formatCurrency(point.primary, localeTag),
              formatNumber(point.secondary, localeTag),
            ]),
          },
        },
      }
    }

    if (selectedReport.id === 'daily-sales') {
      const table: PreviewTable = {
        columns: [
          t('table.sale_no'),
          t('table.time'),
          t('table.customer'),
          t('table.payment'),
          t('table.total'),
          t('table.status'),
        ],
        rows: derived.sales.slice(0, 12).map((sale) => [
          sale.sale_number || sale.receipt_number || sale.id,
          sale.sold_at ? new Intl.DateTimeFormat(localeTag, { hour: '2-digit', minute: '2-digit' }).format(new Date(sale.sold_at)) : '-',
          sale.customer_name || t('walk_in'),
          getPaymentLabel(sale.payment_method, tSell),
          formatCurrency(sale.total_amount ?? 0, localeTag),
          sale.status === SaleStatus.VOIDED ? 'Voided' : 'Completed',
        ]),
      }

      return {
        kind: 'table',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.transactions'),
            value: formatNumber(derived.sales.length, localeTag),
            hint: t('stats.all_sales_hint'),
            tone: 'info',
          },
          {
            label: t('stats.completed'),
            value: formatNumber(derived.completedSales.length, localeTag),
            hint: t('stats.completed_sales_hint'),
            tone: 'positive',
          },
          {
            label: t('stats.voided'),
            value: formatNumber(derived.voidedSales.length, localeTag),
            hint: formatCurrency(sumNumbers(derived.voidedSales.map((sale) => sale.total_amount ?? 0)), localeTag),
            tone: 'danger',
          },
        ],
        table,
        empty: t('preview.no_sales_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.transactions'), value: formatNumber(derived.sales.length, localeTag) },
            { label: t('stats.completed'), value: formatNumber(derived.completedSales.length, localeTag) },
            { label: t('stats.voided'), value: formatNumber(derived.voidedSales.length, localeTag) },
          ],
          table,
        },
      }
    }

    if (selectedReport.id === 'top-products') {
      const rows = derived.topProducts.slice(0, 10).map((product) => ({
        label: product.productName,
        valueLabel: formatCurrency(product.revenue, localeTag),
        meta: `${formatNumber(product.quantity, localeTag)} ${t('stats.units_sold_hint')} · ${formatCurrency(product.revenue - product.cost, localeTag)} ${t('stats.gross_contribution_hint')}`,
        tone: 'positive' as const,
      }))

      return {
        kind: 'ranked',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.products'),
            value: formatNumber(derived.topProducts.length, localeTag),
            hint: t('stats.products_ranked_hint'),
            tone: 'info',
          },
          {
            label: t('stats.best_seller'),
            value: rows[0]?.label || '-',
            hint: rows[0]?.valueLabel || t('preview.no_sales_data'),
            tone: 'positive',
          },
          {
            label: t('stats.units_sold'),
            value: formatNumber(sumNumbers(derived.topProducts.map((product) => product.quantity)), localeTag),
            hint: t('stats.units_sold_hint'),
            tone: 'default',
          },
        ],
        rows,
        empty: t('preview.no_sales_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.products'), value: formatNumber(derived.topProducts.length, localeTag) },
            { label: t('stats.units_sold'), value: formatNumber(sumNumbers(derived.topProducts.map((product) => product.quantity)), localeTag) },
            { label: t('stats.revenue'), value: formatCurrency(derived.totalRevenue, localeTag) },
          ],
          table: {
            columns: [t('table.product'), t('table.revenue'), t('table.units'), t('table.margin')],
            rows: derived.topProducts.slice(0, 12).map((product) => [
              product.productName,
              formatCurrency(product.revenue, localeTag),
              formatNumber(product.quantity, localeTag),
              formatCurrency(product.revenue - product.cost, localeTag),
            ]),
          },
        },
      }
    }

    if (selectedReport.id === 'cashier-performance') {
      const table: PreviewTable = {
        columns: [t('table.cashier'), t('table.revenue'), t('table.completed'), t('table.void_rate')],
        rows: derived.cashierRows.slice(0, 10).map((cashier) => [
          cashier.cashierName,
          formatCurrency(cashier.revenue, localeTag),
          formatNumber(cashier.completedSales, localeTag),
          `${formatPercent(percentageOf(cashier.voidedSales, cashier.totalSales), localeTag)}%`,
        ]),
      }

      return {
        kind: 'table',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.cashiers'),
            value: formatNumber(derived.cashierRows.length, localeTag),
            hint: t('stats.active_cashiers_hint'),
            tone: 'info',
          },
          {
            label: t('stats.top_cashier'),
            value: derived.cashierRows[0]?.cashierName || '-',
            hint: derived.cashierRows[0] ? formatCurrency(derived.cashierRows[0].revenue, localeTag) : t('preview.no_sales_data'),
            tone: 'positive',
          },
          {
            label: t('stats.avg_basket'),
            value: formatCurrencyCompact(derived.averageOrderValue, localeTag),
            hint: t('stats.avg_basket_hint'),
            tone: 'default',
          },
        ],
        table,
        empty: t('preview.no_sales_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.cashiers'), value: formatNumber(derived.cashierRows.length, localeTag) },
            { label: t('stats.revenue'), value: formatCurrency(derived.totalRevenue, localeTag) },
            { label: t('stats.avg_basket'), value: formatCurrency(derived.averageOrderValue, localeTag) },
          ],
          table,
        },
      }
    }

    if (selectedReport.id === 'payment-breakdown') {
      const paymentRows = [
        { label: getPaymentLabel(PaymentMethod.CASH, tSell), method: PaymentMethod.CASH, tone: 'positive' as const },
        { label: getPaymentLabel(PaymentMethod.MTN_MOMO, tSell), method: PaymentMethod.MTN_MOMO, tone: 'warning' as const },
        { label: getPaymentLabel(PaymentMethod.ORANGE_MONEY, tSell), method: PaymentMethod.ORANGE_MONEY, tone: 'info' as const },
        { label: getPaymentLabel(PaymentMethod.CARD, tSell), method: PaymentMethod.CARD, tone: 'default' as const },
      ]
      const bars: BarRow[] = paymentRows.map((row) => {
        const amount = derived.paymentTotals.get(row.method) ?? 0
        return {
          label: row.label,
          valueLabel: formatCurrency(amount, localeTag),
          percentage: Number(percentageOf(amount, derived.totalRevenue).toFixed(1)),
          tone: row.tone,
          meta: `${formatPercent(percentageOf(amount, derived.totalRevenue), localeTag)}%`,
        }
      })
      bars.push({
        label: 'Unpaid credit',
        valueLabel: formatCurrency(derived.totalCreditIssued, localeTag),
        percentage: Number(percentageOf(derived.totalCreditIssued, derived.totalRevenue).toFixed(1)),
        tone: 'danger',
      })

      return {
        kind: 'bars',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.collected'),
            value: formatCurrencyCompact(sumNumbers(Array.from(derived.paymentTotals.values())), localeTag),
            hint: t('stats.cash_in_hand_hint'),
            tone: 'positive',
          },
          {
            label: t('stats.credit_issued'),
            value: formatCurrencyCompact(derived.totalCreditIssued, localeTag),
            hint: t('stats.unpaid_credit_hint'),
            tone: 'danger',
          },
          {
            label: t('stats.methods'),
            value: formatNumber(bars.filter((bar) => bar.percentage > 0).length, localeTag),
            hint: t('stats.methods_used_hint'),
            tone: 'info',
          },
        ],
        bars,
        empty: t('preview.no_sales_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.collected'), value: formatCurrency(sumNumbers(Array.from(derived.paymentTotals.values())), localeTag) },
            { label: t('stats.credit_issued'), value: formatCurrency(derived.totalCreditIssued, localeTag) },
            { label: t('stats.revenue'), value: formatCurrency(derived.totalRevenue, localeTag) },
          ],
          table: {
            columns: [t('table.method'), t('table.amount'), t('table.share')],
            rows: bars.map((bar) => [bar.label, bar.valueLabel, `${bar.percentage}%`]),
          },
        },
      }
    }

    if (selectedReport.id === 'voided-sales') {
      const table: PreviewTable = {
        columns: [t('table.sale_no'), t('table.time'), t('table.customer'), t('table.total'), t('table.reason')],
        rows: derived.voidedSales.slice(0, 12).map((sale) => [
          sale.sale_number || sale.receipt_number || sale.id,
          sale.sold_at ? formatDateTimeLabel(sale.sold_at, localeTag) : '-',
          sale.customer_name || t('walk_in'),
          formatCurrency(sale.total_amount ?? 0, localeTag),
          sale.void_reason || t('not_set'),
        ]),
      }

      return {
        kind: 'table',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.voided'),
            value: formatNumber(derived.voidedSales.length, localeTag),
            hint: t('stats.voided_sales_hint'),
            tone: 'danger',
          },
          {
            label: t('stats.voided_value'),
            value: formatCurrencyCompact(sumNumbers(derived.voidedSales.map((sale) => sale.total_amount ?? 0)), localeTag),
            hint: t('stats.reversed_value_hint'),
            tone: 'warning',
          },
          {
            label: t('stats.price_warnings'),
            value: formatNumber(derived.voidedSales.filter((sale) => Boolean(sale.price_drift_warning)).length, localeTag),
            hint: t('stats.price_warnings_hint'),
            tone: 'default',
          },
        ],
        table,
        empty: t('preview.no_voided_sales'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.voided'), value: formatNumber(derived.voidedSales.length, localeTag) },
            { label: t('stats.voided_value'), value: formatCurrency(sumNumbers(derived.voidedSales.map((sale) => sale.total_amount ?? 0)), localeTag) },
          ],
          table,
        },
      }
    }

    if (selectedReport.id === 'stock-levels') {
      const table: PreviewTable = {
        columns: [t('table.product'), t('table.category'), t('table.quantity'), t('table.threshold'), t('table.reorder_point')],
        rows: derived.inventoryItems
          .slice()
          .sort((left, right) => left.quantity - right.quantity)
          .slice(0, 16)
          .map((item) => [
            item.productName || t('untitled_product'),
            item.categoryName || t('uncategorized'),
            formatNumber(item.quantity, localeTag),
            item.lowStockThreshold !== null ? formatNumber(item.lowStockThreshold, localeTag) : t('not_set'),
            item.reorderPoint !== null ? formatNumber(item.reorderPoint, localeTag) : t('not_set'),
          ]),
      }

      return {
        kind: 'table',
        title: selectedReport.name,
        description: `${selectedReport.description}`,
        stats: [
          {
            label: t('stats.tracked_products'),
            value: formatNumber(derived.inventoryItems.length, localeTag),
            hint: t('stats.tracked_products_hint'),
            tone: 'info',
          },
          {
            label: t('stats.low_stock'),
            value: formatNumber(derived.lowStockItems.length, localeTag),
            hint: t('stats.low_stock_hint'),
            tone: 'warning',
          },
          {
            label: t('stats.out_of_stock'),
            value: formatNumber(derived.inventoryItems.filter((item) => item.quantity <= 0).length, localeTag),
            hint: t('stats.out_of_stock_hint'),
            tone: 'danger',
          },
        ],
        table,
        empty: t('preview.no_inventory_data'),
        exportModel: {
          title: selectedReport.name,
          description: selectedReport.description,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.tracked_products'), value: formatNumber(derived.inventoryItems.length, localeTag) },
            { label: t('stats.low_stock'), value: formatNumber(derived.lowStockItems.length, localeTag) },
            { label: t('stats.out_of_stock'), value: formatNumber(derived.inventoryItems.filter((item) => item.quantity <= 0).length, localeTag) },
          ],
          table,
        },
      }
    }

    if (selectedReport.id === 'stock-movements') {
      return {
        kind: 'ranked',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.movements'),
            value: formatNumber(derived.inventoryMovements.length, localeTag),
            hint: t('stats.movements_hint'),
            tone: 'info',
          },
          {
            label: t('stats.movement_types'),
            value: formatNumber(derived.movementRows.length, localeTag),
            hint: t('stats.movement_types_hint'),
            tone: 'default',
          },
          {
            label: t('stats.low_stock'),
            value: formatNumber(derived.lowStockItems.length, localeTag),
            hint: t('stats.current_alerts_hint'),
            tone: 'warning',
          },
        ],
        rows: derived.movementRows.map((row) => ({
          label: row.label,
          valueLabel: `${formatNumber(row.count, localeTag)} ${t('stats.events_hint')}`,
          meta: `${formatNumber(row.quantity, localeTag)} ${t('stats.units_moved_hint')}`,
          tone: 'info',
        })),
        empty: t('preview.no_movement_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.movements'), value: formatNumber(derived.inventoryMovements.length, localeTag) },
            { label: t('stats.movement_types'), value: formatNumber(derived.movementRows.length, localeTag) },
          ],
          table: {
            columns: [t('table.type'), t('table.events'), t('table.quantity')],
            rows: derived.movementRows.map((row) => [
              row.label,
              formatNumber(row.count, localeTag),
              formatNumber(row.quantity, localeTag),
            ]),
          },
        },
      }
    }

    if (selectedReport.id === 'low-stock-alerts') {
      const rows = derived.lowStockItems.slice(0, 12).map((item) => {
        const shortfall = (item.lowStockThreshold ?? 0) - item.quantity
        return {
          label: item.productName || t('untitled_product'),
          valueLabel: `${formatNumber(item.quantity, localeTag)} ${t('stats.units_left_hint')}`,
          meta: `${t('table.threshold')}: ${item.lowStockThreshold ?? 0} · ${t('stats.shortfall_hint')}: ${formatNumber(shortfall, localeTag)}`,
          tone: shortfall > 0 ? ('danger' as const) : ('warning' as const),
        }
      })

      return {
        kind: 'ranked',
        title: selectedReport.name,
        description: selectedReport.description,
        stats: [
          {
            label: t('stats.alerts'),
            value: formatNumber(derived.lowStockItems.length, localeTag),
            hint: t('stats.current_alerts_hint'),
            tone: 'danger',
          },
          {
            label: t('stats.tracked_products'),
            value: formatNumber(derived.inventoryItems.length, localeTag),
            hint: t('stats.tracked_products_hint'),
            tone: 'info',
          },
          {
            label: t('stats.out_of_stock'),
            value: formatNumber(derived.inventoryItems.filter((item) => item.quantity <= 0).length, localeTag),
            hint: t('stats.out_of_stock_hint'),
            tone: 'warning',
          },
        ],
        rows,
        empty: t('preview.no_low_stock_alerts'),
        exportModel: {
          title: selectedReport.name,
          description: selectedReport.description,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.alerts'), value: formatNumber(derived.lowStockItems.length, localeTag) },
            { label: t('stats.out_of_stock'), value: formatNumber(derived.inventoryItems.filter((item) => item.quantity <= 0).length, localeTag) },
          ],
          table: {
            columns: [t('table.product'), t('table.quantity'), t('table.threshold'), t('table.shortfall')],
            rows: derived.lowStockItems.slice(0, 20).map((item) => [
              item.productName || t('untitled_product'),
              formatNumber(item.quantity, localeTag),
              formatNumber(item.lowStockThreshold ?? 0, localeTag),
              formatNumber((item.lowStockThreshold ?? 0) - item.quantity, localeTag),
            ]),
          },
        },
      }
    }

    if (selectedReport.id === 'restock-costs') {
      const table: PreviewTable = {
        columns: [t('table.reference'), t('table.supplier'), t('table.total_cost'), t('table.paid'), t('table.credit')],
        rows: derived.restocks.slice(0, 14).map((restock) => [
          restock.reference_number || restock.id,
          restock.supplier_name || t('not_set'),
          formatCurrency(restock.total_cost ?? restock.total_amount ?? 0, localeTag),
          formatCurrency(restock.amount_paid ?? 0, localeTag),
          formatCurrency(restock.credit_amount ?? 0, localeTag),
        ]),
      }

      return {
        kind: 'table',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.restocks'),
            value: formatNumber(derived.restocks.length, localeTag),
            hint: t('stats.restocks_hint'),
            tone: 'info',
          },
          {
            label: t('stats.total_cost'),
            value: formatCurrencyCompact(sumNumbers(derived.restocks.map((restock) => restock.total_cost ?? restock.total_amount ?? 0)), localeTag),
            hint: t('stats.stock_investment_hint'),
            tone: 'warning',
          },
          {
            label: t('stats.credit_issued'),
            value: formatCurrencyCompact(sumNumbers(derived.restocks.map((restock) => restock.credit_amount ?? 0)), localeTag),
            hint: t('stats.supplier_credit_hint'),
            tone: 'danger',
          },
        ],
        table,
        empty: t('preview.no_restock_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.restocks'), value: formatNumber(derived.restocks.length, localeTag) },
            { label: t('stats.total_cost'), value: formatCurrency(sumNumbers(derived.restocks.map((restock) => restock.total_cost ?? restock.total_amount ?? 0)), localeTag) },
          ],
          table,
        },
      }
    }

    if (selectedReport.id === 'profit-loss') {
      return {
        kind: 'bars',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.revenue'),
            value: formatCurrencyCompact(derived.totalRevenue, localeTag),
            hint: t('stats.topline_hint'),
            tone: 'positive',
          },
          {
            label: t('stats.expenses'),
            value: formatCurrencyCompact(derived.totalExpenses, localeTag),
            hint: t('stats.total_expense_hint'),
            tone: 'warning',
          },
          {
            label: t('stats.net_profit'),
            value: formatCurrencyCompact(derived.netProfit, localeTag),
            hint: `${formatPercent(percentageOf(derived.netProfit, derived.totalRevenue), localeTag)}% ${t('stats.net_margin_hint')}`,
            tone: derived.netProfit >= 0 ? 'positive' : 'danger',
          },
        ],
        bars: pnlRows.map((row) => ({
          label: row.label,
          valueLabel: formatCurrency(row.value, localeTag),
          percentage: row.percent,
          tone: row.tone,
        })),
        empty: t('preview.no_sales_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.revenue'), value: formatCurrency(derived.totalRevenue, localeTag) },
            { label: t('stats.cogs'), value: formatCurrency(derived.totalCost, localeTag) },
            { label: t('stats.expenses'), value: formatCurrency(derived.totalExpenses, localeTag) },
            { label: t('stats.net_profit'), value: formatCurrency(derived.netProfit, localeTag) },
          ],
          table: {
            columns: [t('table.line_item'), t('table.amount')],
            rows: pnlRows.map((row) => [row.label, formatCurrency(row.value, localeTag)]),
          },
        },
      }
    }

    if (selectedReport.id === 'expense-breakdown') {
      const bars = derived.expenseCategoryRows.map((row) => ({
        label: row.name,
        valueLabel: formatCurrency(row.amount, localeTag),
        percentage: Number(percentageOf(row.amount, derived.totalExpenses).toFixed(1)),
        tone: row.recurringAmount > 0 ? ('warning' as const) : ('default' as const),
        meta: `${formatNumber(row.count, localeTag)} ${t('stats.entries_hint')} · ${formatCurrency(row.recurringAmount, localeTag)} ${t('stats.recurring_hint')}`,
      }))

      return {
        kind: 'bars',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.expenses'),
            value: formatCurrencyCompact(derived.totalExpenses, localeTag),
            hint: `${formatNumber(derived.expenses.length, localeTag)} ${t('stats.entries_hint')}`,
            tone: 'warning',
          },
          {
            label: t('stats.recurring'),
            value: formatCurrencyCompact(sumNumbers(derived.expenses.filter((expense) => expense.isRecurring).map((expense) => expense.amount)), localeTag),
            hint: t('stats.recurring_expenses_hint'),
            tone: 'info',
          },
          {
            label: t('stats.categories'),
            value: formatNumber(derived.expenseCategoryRows.length, localeTag),
            hint: t('stats.categories_hint'),
            tone: 'default',
          },
        ],
        bars,
        empty: t('preview.no_expense_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.expenses'), value: formatCurrency(derived.totalExpenses, localeTag) },
            { label: t('stats.categories'), value: formatNumber(derived.expenseCategoryRows.length, localeTag) },
          ],
          table: {
            columns: [t('table.category'), t('table.amount'), t('table.share')],
            rows: derived.expenseCategoryRows.map((row) => [
              row.name,
              formatCurrency(row.amount, localeTag),
              `${formatPercent(percentageOf(row.amount, derived.totalExpenses), localeTag)}%`,
            ]),
          },
        },
      }
    }

    if (selectedReport.id === 'revenue-vs-expenses') {
      const points = buildRevenueVsExpensesPoints(derived.completedSales, derived.expenses, localeTag)

      return {
        kind: 'trend',
        title: selectedReport.name,
        description: `${selectedReport.description} Range: ${rangeLabel}.`,
        stats: [
          {
            label: t('stats.revenue'),
            value: formatCurrencyCompact(derived.totalRevenue, localeTag),
            hint: t('stats.topline_hint'),
            tone: 'positive',
          },
          {
            label: t('stats.expenses'),
            value: formatCurrencyCompact(derived.totalExpenses, localeTag),
            hint: t('stats.total_expense_hint'),
            tone: 'warning',
          },
          {
            label: t('stats.net_profit'),
            value: formatCurrencyCompact(derived.netProfit, localeTag),
            hint: t('stats.range_result_hint'),
            tone: derived.netProfit >= 0 ? 'positive' : 'danger',
          },
        ],
        legend: {
          primary: t('preview.legend_revenue'),
          secondary: t('preview.legend_expenses'),
        },
        points,
        primaryMaxLabel: formatCurrencyCompact(Math.max(...points.map((point) => point.primary), 0), localeTag),
        secondaryMaxLabel: formatCurrencyCompact(Math.max(...points.map((point) => point.secondary), 0), localeTag),
        empty: t('preview.no_expense_data'),
        exportModel: {
          title: selectedReport.name,
          description: `${selectedReport.description} (${rangeLabel})`,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.revenue'), value: formatCurrency(derived.totalRevenue, localeTag) },
            { label: t('stats.expenses'), value: formatCurrency(derived.totalExpenses, localeTag) },
            { label: t('stats.net_profit'), value: formatCurrency(derived.netProfit, localeTag) },
          ],
          table: {
            columns: [t('table.period'), t('preview.legend_revenue'), t('preview.legend_expenses')],
            rows: points.map((point) => [
              point.label,
              formatCurrency(point.primary, localeTag),
              formatCurrency(point.secondary, localeTag),
            ]),
          },
        },
      }
    }

    if (selectedReport.id === 'debtors-ageing' || selectedReport.id === 'creditors-ageing') {
      const isReceivable = selectedReport.id === 'debtors-ageing'
      const ageingRows = isReceivable ? derived.receivableAgeing : derived.payableAgeing
      const openRows = (isReceivable ? derived.openReceivableDebts : derived.openPayableDebts).slice(0, 12)
      const totalOutstanding = sumNumbers(openRows.map((debt) => debt.outstandingAmount))
      const bars = ageingRows.map((row) => ({
        label: row.label,
        valueLabel: formatCurrency(row.amount, localeTag),
        percentage: row.percentage,
        tone: row.label === '30+ days' ? ('danger' as const) : row.label === '16-30 days' ? ('warning' as const) : ('info' as const),
        meta: `${formatNumber(row.count, localeTag)} ${t('stats.balances_hint')}`,
      }))

      return {
        kind: 'bars',
        title: selectedReport.name,
        description: selectedReport.description,
        stats: [
          {
            label: t('stats.open_balances'),
            value: formatNumber(openRows.length, localeTag),
            hint: t('stats.open_balances_hint'),
            tone: 'info',
          },
          {
            label: t('stats.outstanding'),
            value: formatCurrencyCompact(totalOutstanding, localeTag),
            hint: t('stats.current_exposure_hint'),
            tone: isReceivable ? 'danger' : 'warning',
          },
          {
            label: t('stats.oldest_bucket'),
            value: formatCurrencyCompact(ageingRows[3]?.amount ?? 0, localeTag),
            hint: t('stats.oldest_bucket_hint'),
            tone: 'danger',
          },
        ],
        bars,
        empty: t('preview.no_debt_data'),
        exportModel: {
          title: selectedReport.name,
          description: selectedReport.description,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.open_balances'), value: formatNumber(openRows.length, localeTag) },
            { label: t('stats.outstanding'), value: formatCurrency(totalOutstanding, localeTag) },
          ],
          table: {
            columns: [t('table.bucket'), t('table.amount'), t('table.count')],
            rows: ageingRows.map((row) => [
              row.label,
              formatCurrency(row.amount, localeTag),
              formatNumber(row.count, localeTag),
            ]),
          },
        },
      }
    }

    if (selectedReport.id === 'contact-statement') {
      const topContacts = derived.contactBalanceRows.slice(0, 12)
      const note = t('preview.contact_statement_note')

      return {
        kind: 'note',
        title: selectedReport.name,
        description: selectedReport.description,
        stats: [
          {
            label: t('stats.contacts'),
            value: formatNumber(topContacts.length, localeTag),
            hint: t('stats.contacts_with_balances_hint'),
            tone: 'info',
          },
          {
            label: t('stats.receivables'),
            value: formatCurrencyCompact(sumNumbers(derived.openReceivableDebts.map((debt) => debt.outstandingAmount)), localeTag),
            hint: t('stats.customer_balances_hint'),
            tone: 'positive',
          },
          {
            label: t('stats.payables'),
            value: formatCurrencyCompact(sumNumbers(derived.openPayableDebts.map((debt) => debt.outstandingAmount)), localeTag),
            hint: t('stats.supplier_balances_hint'),
            tone: 'warning',
          },
        ],
        note,
        bullets: topContacts.slice(0, 5).map((contact) => `${contact.contactName} · ${contact.direction === DebtDirection.RECEIVABLE ? 'Receivable' : 'Payable'} · ${formatCurrency(contact.balance, localeTag)} · ${contact.reference}`),
        exportModel: {
          title: selectedReport.name,
          description: selectedReport.description,
          filenameBase: exportBase,
          summaryRows: [
            { label: t('stats.contacts'), value: formatNumber(topContacts.length, localeTag) },
            { label: t('stats.receivables'), value: formatCurrency(sumNumbers(derived.openReceivableDebts.map((debt) => debt.outstandingAmount)), localeTag) },
            { label: t('stats.payables'), value: formatCurrency(sumNumbers(derived.openPayableDebts.map((debt) => debt.outstandingAmount)), localeTag) },
          ],
          table: {
            columns: [t('table.contact'), t('table.direction'), t('table.balance'), t('table.reference')],
            rows: topContacts.map((contact) => [
              contact.contactName,
              contact.direction === DebtDirection.RECEIVABLE ? 'Receivable' : 'Payable',
              formatCurrency(contact.balance, localeTag),
              contact.reference,
            ]),
          },
        },
      }
    }

    const bars = [
      {
        label: t('stats.credit_issued'),
        valueLabel: formatCurrency(derived.issuedReceivable, localeTag),
        percentage: Number(percentageOf(derived.issuedReceivable, Math.max(derived.issuedReceivable, derived.collectedReceivable, derived.writtenOffReceivable, 1)).toFixed(1)),
        tone: 'warning' as const,
      },
      {
        label: t('stats.collected'),
        valueLabel: formatCurrency(derived.collectedReceivable, localeTag),
        percentage: Number(percentageOf(derived.collectedReceivable, Math.max(derived.issuedReceivable, derived.collectedReceivable, derived.writtenOffReceivable, 1)).toFixed(1)),
        tone: 'positive' as const,
      },
      {
        label: t('stats.written_off'),
        valueLabel: formatCurrency(derived.writtenOffReceivable, localeTag),
        percentage: Number(percentageOf(derived.writtenOffReceivable, Math.max(derived.issuedReceivable, derived.collectedReceivable, derived.writtenOffReceivable, 1)).toFixed(1)),
        tone: 'danger' as const,
      },
    ]

    return {
      kind: 'bars',
      title: selectedReport.name,
      description: `${selectedReport.description} Range: ${rangeLabel}.`,
      stats: [
        {
          label: t('stats.credit_issued'),
          value: formatCurrencyCompact(derived.issuedReceivable, localeTag),
          hint: t('stats.new_credit_hint'),
          tone: 'warning',
        },
        {
          label: t('stats.collected'),
          value: formatCurrencyCompact(derived.collectedReceivable, localeTag),
          hint: t('stats.collection_hint'),
          tone: 'positive',
        },
        {
          label: t('stats.written_off'),
          value: formatCurrencyCompact(derived.writtenOffReceivable, localeTag),
          hint: t('stats.write_off_hint'),
          tone: 'danger',
        },
      ],
      bars,
      empty: t('preview.no_debt_data'),
      exportModel: {
        title: selectedReport.name,
        description: `${selectedReport.description} (${rangeLabel})`,
        filenameBase: exportBase,
        summaryRows: [
          { label: t('stats.credit_issued'), value: formatCurrency(derived.issuedReceivable, localeTag) },
          { label: t('stats.collected'), value: formatCurrency(derived.collectedReceivable, localeTag) },
          { label: t('stats.written_off'), value: formatCurrency(derived.writtenOffReceivable, localeTag) },
        ],
        table: {
          columns: [t('table.metric'), t('table.amount')],
          rows: bars.map((bar) => [bar.label, bar.valueLabel]),
        },
      },
    }
  }, [appliedRange, derived, localeTag, selectedReport, t, tSell])

  const handlePresetSelect = (preset: Exclude<ReportPreset, 'custom'>) => {
    const nextRange = resolvePresetRange(preset)
    setDraftStartDate(nextRange.startDate)
    setDraftEndDate(nextRange.endDate)
    setAppliedRange(nextRange)
  }

  const handleRunReport = () => {
    if (!draftStartDate || !draftEndDate) {
      toast.error(t('errors.missing_dates'))
      return
    }

    if (draftStartDate > draftEndDate) {
      toast.error(t('errors.invalid_range'))
      return
    }

    setAppliedRange({
      preset: 'custom',
      startDate: draftStartDate,
      endDate: draftEndDate,
    })
  }

  const handleExportCsv = async () => {
    const csv = buildCsvContent(reportViewModel.exportModel)
    const filename = `${reportViewModel.exportModel.filenameBase}.csv`
    setExportingCsv(true)

    try {
      if (hasDesktopIpc()) {
        const result = await ipc.documents.exportFile({
          content: csv,
          filename,
          filters: [{ name: 'CSV file', extensions: ['csv'] }],
        })

        if (result.success) {
          toast.success(t('export.csv_ready'))
          return
        }

        if (!result.canceled) {
          toast.error(result.error || t('export.csv_error'))
        }

        return
      }

      downloadFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename)
      toast.success(t('export.csv_ready'))
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : t('export.csv_error'))
    } finally {
      setExportingCsv(false)
    }
  }

  const handleExportPdf = async () => {
    if (!hasDesktopIpc()) {
      toast.error(t('export.pdf_desktop_only'))
      return
    }

    setExportingPdf(true)

    try {
      const html = buildReportPdfHtml({
        title: reportViewModel.exportModel.title,
        description: reportViewModel.exportModel.description,
        rangeLabel: buildRangeLabel(appliedRange.startDate, appliedRange.endDate, localeTag),
        generatedOn: formatDateTimeLabel(new Date().toISOString(), localeTag),
        summaryRows: reportViewModel.exportModel.summaryRows,
        table: reportViewModel.exportModel.table,
      })
      const result = await ipc.documents.exportPdf({
        html,
        filename: `${reportViewModel.exportModel.filenameBase}.pdf`,
      })

      if (result.success) {
        toast.success(t('export.pdf_ready'))
        return
      }

      if (!result.canceled) {
        toast.error(result.error || t('export.pdf_error'))
      }
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : t('export.pdf_error'))
    } finally {
      setExportingPdf(false)
    }
  }

  const handleSharePdf = async () => {
    setSharingPdf(true)

    try {
      const lines = [
        reportViewModel.exportModel.title,
        reportViewModel.exportModel.description,
        `Range: ${buildRangeLabel(appliedRange.startDate, appliedRange.endDate, localeTag)}`,
        `Generated: ${formatDateTimeLabel(new Date().toISOString(), localeTag)}`,
        '',
        ...reportViewModel.exportModel.summaryRows.map((row) => `${row.label}: ${row.value}`),
        '',
      ]

      if (reportViewModel.exportModel.table) {
        lines.push(reportViewModel.exportModel.table.columns.join(' | '))
        lines.push(...reportViewModel.exportModel.table.rows.map((row) => row.join(' | ')))
      }

      const pdfBlob = buildSimplePdfBlob(lines)
      const filename = `${reportViewModel.exportModel.filenameBase}.pdf`

      if (hasDesktopIpc()) {
        const pdfBytes = Array.from(new Uint8Array(await pdfBlob.arrayBuffer()))
        const result = await ipc.share.file({
          buffer: pdfBytes,
          filename,
          mimeType: 'application/pdf',
        })

        if (result.shared) {
          toast.success(t('export.share_ready'))
          return
        }

        toast.success(t('export.share_saved'))
        return
      }

      downloadFile(pdfBlob, filename)
      toast.success(t('export.share_fallback'))
    } catch (shareError) {
      toast.error(shareError instanceof Error ? shareError.message : t('export.share_error'))
    } finally {
      setSharingPdf(false)
    }
  }

  if (!businessId) {
    return (
      <SurfaceCard title={t('title')} description={t('business_required')}>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </SurfaceCard>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground shadow-sm">
          <Spinner size="lg" />
          {t('loading')}
        </div>
      </div>
    )
  }

  if (error || !workspace) {
    return (
      <SurfaceCard
        title={t('title')}
        description={t('load_error')}
        action={
          <Button onClick={() => setReloadKey((value) => value + 1)} variant="primary">
            {t('retry')}
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">{error || t('load_error')}</p>
      </SurfaceCard>
    )
  }

  const sections: Array<{ key: ReportSectionKey; title: string }> = [
    { key: 'sales', title: sectionLabels.sales },
    { key: 'inventory', title: sectionLabels.inventory },
    { key: 'financial', title: sectionLabels.financial },
    { key: 'credit', title: sectionLabels.credit },
  ]
  const visibleSections = sections
    .map((section) => ({
      ...section,
      reports: filteredReports.filter((report) => report.section === section.key),
    }))
    .filter((section) => section.reports.length > 0)

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-muted-foreground">{t('range_label')}</span>
            {([
              ['today', t('presets.today')],
              ['last7', t('presets.last7')],
              ['thisMonth', t('presets.this_month')],
              ['lastMonth', t('presets.last_month')],
              ['quarter', t('presets.quarter')],
              ['year', t('presets.year')],
            ] as const).map(([preset, label]) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePresetSelect(preset)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                  appliedRange.preset === preset
                    ? 'border-success-400 bg-success-400 text-white'
                    : 'border-border bg-background text-muted-foreground hover:border-border/80 hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="reports-start-date">
            {t('start_date')}
          </label>
          <input
            id="reports-start-date"
            type="date"
            value={draftStartDate}
            onChange={(event) => setDraftStartDate(event.target.value)}
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">{t('to')}</span>
          <input
            type="date"
            value={draftEndDate}
            onChange={(event) => setDraftEndDate(event.target.value)}
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button onClick={handleRunReport} variant="primary">
            {t('run_report')}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="reports-search">
              {t('search.label')}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <SearchIcon />
              </span>
              <input
                id="reports-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('search.placeholder')}
                className="block h-11 w-full rounded-2xl border border-input bg-background pl-10 pr-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/80 px-4 py-3 shadow-sm lg:min-w-[280px]">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                {t('search.results', {
                  count: filteredReports.length,
                  total: REPORT_DEFINITIONS.length,
                })}
              </p>
              <p className="text-xs text-muted-foreground">{t('search.hint')}</p>
            </div>
            {search.trim() ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border/80 hover:text-foreground"
              >
                {t('search.clear')}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <SurfaceCard
        title={t('waterfall.title')}
        description={t('waterfall.description', {
          range: buildRangeLabel(appliedRange.startDate, appliedRange.endDate, localeTag),
        })}
      >
        <div className="space-y-3">
          {pnlRows.map((row, index) => (
            <div key={`${row.label}-${index}`} className="space-y-2">
              {row.total ? <div className="h-px bg-border" /> : null}
              <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_140px] md:items-center">
                <div className={cn('text-sm text-muted-foreground md:text-right', row.total && 'font-semibold text-foreground')}>
                  {row.label}
                </div>
                <div className="h-6 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'flex h-full items-center justify-end rounded-full px-3 text-[11px] font-semibold text-white',
                      row.tone === 'positive' && 'bg-success-400',
                      row.tone === 'warning' && 'bg-warning-400',
                      row.tone === 'danger' && 'bg-danger-400',
                    )}
                    style={{ width: `${row.percent}%` }}
                  >
                    {row.value >= 0 ? '' : '-'}
                    {formatPercent(Math.abs(percentageOf(row.value, Math.max(derived.totalRevenue, 1))), localeTag)}%
                  </div>
                </div>
                <div
                  className={cn(
                    'text-sm font-semibold md:text-right',
                    row.tone === 'positive' && 'text-success-600 dark:text-success-400',
                    row.tone === 'warning' && 'text-warning-600 dark:text-warning-400',
                    row.tone === 'danger' && 'text-danger-600 dark:text-danger-400',
                  )}
                >
                  {formatCurrency(row.value, localeTag)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SurfaceCard>

      {visibleSections.length > 0 ? (
        <>
          {visibleSections.map((section) => (
            <section key={section.key} className="space-y-3">
              <div className="border-b border-border pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {section.title}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {section.reports.map((report) => {
                  const isActive = report.id === selectedReportId

                  return (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => setSelectedReportId(report.id)}
                      className={cn(
                        'rounded-[22px] border bg-card p-4 text-left shadow-sm transition',
                        isActive
                          ? 'border-success-400 ring-2 ring-success-400/20'
                          : 'border-border hover:border-border/80 hover:shadow-md',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className={cn('flex h-10 w-10 items-center justify-center rounded-2xl', getReportIconWrapperClassName(report.badgeTone))}>
                          <ReportIcon name={report.icon} />
                        </div>
                        <Badge variant={report.badgeTone}>{report.badge}</Badge>
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-sm font-semibold text-foreground">{report.name}</h3>
                          {isActive ? (
                            <span className="rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-success-600">
                              {t('selected')}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm leading-6 text-muted-foreground">{report.description}</p>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                        <span className="text-[11px] text-muted-foreground">{report.source}</span>
                        <span className="text-sm font-medium text-primary">{t('generate')}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}

          <SurfaceCard
            title={reportViewModel.title}
            description={`${reportViewModel.description} ${t('preview.source')}: ${selectedReport.source}`}
          >
            <div className="grid gap-3 md:grid-cols-3">
              {reportViewModel.stats.map((stat) => (
                <ReportMetricCard key={`${reportViewModel.title}-${stat.label}`} stat={stat} />
              ))}
            </div>

            <div className="mt-6">
              {reportViewModel.kind === 'trend' ? (
                reportViewModel.points.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-success-400" />
                        {reportViewModel.legend.primary}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-[#A29F97]" />
                        {reportViewModel.legend.secondary}
                      </span>
                    </div>
                    <DualSeriesTrendChart
                      points={reportViewModel.points}
                      primaryMaxLabel={reportViewModel.primaryMaxLabel}
                      secondaryMaxLabel={reportViewModel.secondaryMaxLabel}
                    />
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-background/80 px-4 py-5 text-sm text-muted-foreground">
                    {reportViewModel.empty}
                  </div>
                )
              ) : null}

              {reportViewModel.kind === 'bars' ? (
                reportViewModel.bars.length > 0 ? (
                  <div className="space-y-4">
                    {reportViewModel.bars.map((bar) => (
                      <div key={`${reportViewModel.title}-${bar.label}`} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-muted-foreground">{bar.label}</span>
                          <span className="font-medium text-foreground">{bar.percentage}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              bar.tone === 'positive' && 'bg-success-400',
                              bar.tone === 'warning' && 'bg-warning-400',
                              bar.tone === 'danger' && 'bg-danger-400',
                              bar.tone === 'info' && 'bg-brand-400',
                              bar.tone === 'default' && 'bg-foreground/70',
                            )}
                            style={{ width: `${Math.max(bar.percentage, bar.percentage > 0 ? 6 : 0)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          <span>{bar.valueLabel}</span>
                          <span>{bar.meta}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-background/80 px-4 py-5 text-sm text-muted-foreground">
                    {reportViewModel.empty}
                  </div>
                )
              ) : null}

              {reportViewModel.kind === 'ranked' ? (
                reportViewModel.rows.length > 0 ? (
                  <div className="space-y-3">
                    {reportViewModel.rows.map((row) => (
                      <div
                        key={`${reportViewModel.title}-${row.label}`}
                        className="flex items-start justify-between gap-4 rounded-2xl border border-border/70 bg-background/70 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
                          {row.meta ? <p className="mt-1 text-xs text-muted-foreground">{row.meta}</p> : null}
                        </div>
                        <p
                          className={cn(
                            'shrink-0 text-sm font-semibold',
                            row.tone === 'positive' && 'text-success-600 dark:text-success-400',
                            row.tone === 'warning' && 'text-warning-600 dark:text-warning-400',
                            row.tone === 'danger' && 'text-danger-600 dark:text-danger-400',
                            (!row.tone || row.tone === 'default' || row.tone === 'info') && 'text-foreground',
                          )}
                        >
                          {row.valueLabel}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-background/80 px-4 py-5 text-sm text-muted-foreground">
                    {reportViewModel.empty}
                  </div>
                )
              ) : null}

              {reportViewModel.kind === 'table' ? (
                reportViewModel.table.rows.length > 0 ? (
                  <PreviewTableView table={reportViewModel.table} />
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-background/80 px-4 py-5 text-sm text-muted-foreground">
                    {reportViewModel.empty}
                  </div>
                )
              ) : null}

              {reportViewModel.kind === 'note' ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
                    {reportViewModel.note}
                  </div>
                  <div className="space-y-3">
                    {reportViewModel.bullets.map((bullet) => (
                      <div key={bullet} className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-foreground">
                        {bullet}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </SurfaceCard>

          <section className="flex flex-col gap-4 rounded-[24px] border border-border bg-card px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">{t('export.title')}</h3>
              <p className="text-sm text-muted-foreground">
                {selectedReport.name} · {buildRangeLabel(appliedRange.startDate, appliedRange.endDate, localeTag)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleExportPdf} disabled={exportingPdf} variant="secondary">
                {exportingPdf ? t('export.exporting_pdf') : t('export.pdf')}
              </Button>
              <Button onClick={handleExportCsv} disabled={exportingCsv} variant="secondary">
                {exportingCsv ? t('export.exporting_csv') : t('export.csv')}
              </Button>
              <Button onClick={handleSharePdf} disabled={sharingPdf} variant="primary">
                {sharingPdf ? t('export.sharing') : t('export.share')}
              </Button>
            </div>
          </section>
        </>
      ) : (
        <SurfaceCard
          title={t('search.empty_title')}
          description={t('search.empty_description')}
          action={
            <button
              type="button"
              onClick={() => setSearch('')}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border/80 hover:text-foreground"
            >
              {t('search.clear')}
            </button>
          }
        >
          <p className="text-sm text-muted-foreground">
            {t('search.results', {
              count: filteredReports.length,
              total: REPORT_DEFINITIONS.length,
            })}
          </p>
        </SurfaceCard>
      )}
    </div>
  )
}
