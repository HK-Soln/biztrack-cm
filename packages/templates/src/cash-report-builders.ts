// Cash Z/X-report + daily-close builders (BIZ-2.6). Neutral cash-report data → ReportDocument
// (+ CSV), shared by the desktop (on-screen + PDF) and the API (server PDF), so a shift report
// looks identical wherever it's produced. Money/number formatting lives here; the generic
// renderer stays presentational.
import type {
  BuiltReportResult,
  CashDailyReportData,
  CashShiftReportData,
  ReportBuildOptions,
  ReportDocument,
  ReportKpi,
  ReportSection,
  ReportTone,
} from '@biztrack/types'
import { formatMoney, formatNumber } from './format'

function isFr(locale: string): boolean {
  return (locale || 'fr').toLowerCase().startsWith('fr')
}
function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}
function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((line) => line.map(csvCell).join(',')).join('\r\n')
}
function timeOf(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}
function dateTimeOf(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}
// Balanced → green; any discrepancy → red (a non-zero variance is a problem, either sign).
function varianceTone(v: number): ReportTone {
  return v === 0 ? 'up' : 'down'
}

// Movement kinds are a closed enum; label them bilingually here so the document is
// self-contained (the API builds the same doc without the renderer's i18n).
function movementLabel(kind: string, fr: boolean): string {
  const EN: Record<string, string> = {
    OPENING_FLOAT: 'Opening float',
    EXPENSE: 'Expense',
    SUPPLIER_PAYMENT: 'Supplier payment',
    DROP: 'Cash drop',
    OWNER_DRAW: 'Owner draw',
    CHANGE_IN: 'Change added',
    CHANGE_OUT: 'Change taken',
    CREDIT_REPAYMENT: 'Credit repayment',
    TRANSFER_TO_MTN_MOMO: 'Transfer to MTN MoMo',
    TRANSFER_TO_ORANGE_MONEY: 'Transfer to Orange Money',
    TRANSFER_TO_BANK: 'Transfer to bank',
    CUSTOMER_DEPOSIT: 'Customer deposit',
    DEPOSIT_REFUND: 'Deposit refund',
  }
  const FR: Record<string, string> = {
    OPENING_FLOAT: 'Fonds de caisse',
    EXPENSE: 'Dépense',
    SUPPLIER_PAYMENT: 'Paiement fournisseur',
    DROP: 'Prélèvement',
    OWNER_DRAW: 'Retrait propriétaire',
    CHANGE_IN: 'Monnaie ajoutée',
    CHANGE_OUT: 'Monnaie retirée',
    CREDIT_REPAYMENT: 'Remboursement crédit',
    TRANSFER_TO_MTN_MOMO: 'Transfert vers MTN MoMo',
    TRANSFER_TO_ORANGE_MONEY: 'Transfert vers Orange Money',
    TRANSFER_TO_BANK: 'Transfert bancaire',
    CUSTOMER_DEPOSIT: 'Acompte client',
    DEPOSIT_REFUND: 'Remboursement acompte',
  }
  return (fr ? FR[kind] : EN[kind]) ?? kind
}

function baseDoc(
  title: string,
  opts: ReportBuildOptions,
  sections: ReportSection[],
  subtitle?: string,
): ReportDocument {
  return {
    title,
    subtitle,
    business: opts.business,
    periodLabel: opts.periodLabel,
    generatedAt: opts.generatedAt,
    unit: opts.currency,
    sections,
  }
}

/**
 * Z-report (per shift, at close) or X-report (mid-shift read). The X variant hides the
 * blind drawer count / variance — those are only taken at close — and titles itself as a
 * running read. Sections: KPI strip → tender mix → drawer reconciliation → mobile money
 * → cash movements → notes.
 */
export function buildCashShiftReport(
  data: CashShiftReportData,
  opts: ReportBuildOptions,
): BuiltReportResult {
  const fr = isFr(opts.locale)
  const m = (x: number) => formatMoney(x, data.currency, opts.locale)
  const n = (x: number) => formatNumber(x, opts.locale)
  const isZ = data.kind === 'Z'
  const L = fr
    ? {
        titleZ: 'Rapport Z (clôture de caisse)',
        titleX: 'Rapport X (lecture en cours)',
        cashier: 'Caissier',
        opened: 'Ouverture',
        closed: 'Clôture',
        netSales: 'Ventes nettes',
        txns: 'Transactions',
        voids: 'annulations',
        expected: 'Espèces attendues',
        variance: 'Écart',
        tenderSec: 'Encaissements',
        cash: 'Espèces',
        momo: 'MTN MoMo',
        orange: 'Orange Money',
        card: 'Carte',
        credit: 'Crédit accordé',
        gross: 'Ventes brutes',
        discounts: 'Remises',
        drawerSec: 'Rapprochement de caisse',
        openingFloat: 'Fonds de caisse',
        cashSales: '+ Ventes espèces',
        change: '− Monnaie rendue',
        cashIn: '+ Entrées de caisse',
        cashOut: '− Sorties de caisse',
        expectedRow: '= Espèces attendues',
        counted: 'Espèces comptées',
        momoSec: 'Mobile Money',
        expectedTender: 'Attendu',
        confirmed: 'Confirmé',
        pending: 'à confirmer',
        movesSec: 'Mouvements de caisse',
        time: 'Heure',
        movement: 'Mouvement',
        in: 'Entrée',
        out: 'Sortie',
        noMoves: 'Aucun mouvement de caisse.',
        reasonNote: 'Motif de l’écart',
        closingNote: 'Note de clôture',
        balanced: 'Caisse équilibrée.',
        over: 'Excédent en caisse.',
        short: 'Manquant en caisse.',
      }
    : {
        titleZ: 'Z-Report (shift close)',
        titleX: 'X-Report (mid-shift read)',
        cashier: 'Cashier',
        opened: 'Opened',
        closed: 'Closed',
        netSales: 'Net sales',
        txns: 'Transactions',
        voids: 'voids',
        expected: 'Expected cash',
        variance: 'Variance',
        tenderSec: 'Takings',
        cash: 'Cash',
        momo: 'MTN MoMo',
        orange: 'Orange Money',
        card: 'Card',
        credit: 'Credit issued',
        gross: 'Gross sales',
        discounts: 'Discounts',
        drawerSec: 'Drawer reconciliation',
        openingFloat: 'Opening float',
        cashSales: '+ Cash sales',
        change: '− Change given',
        cashIn: '+ Cash in',
        cashOut: '− Cash out',
        expectedRow: '= Expected cash',
        counted: 'Counted cash',
        momoSec: 'Mobile Money',
        expectedTender: 'Expected',
        confirmed: 'Confirmed',
        pending: 'to confirm',
        movesSec: 'Cash movements',
        time: 'Time',
        movement: 'Movement',
        in: 'In',
        out: 'Out',
        noMoves: 'No cash movements.',
        reasonNote: 'Variance reason',
        closingNote: 'Closing note',
        balanced: 'Drawer balanced.',
        over: 'Drawer over.',
        short: 'Drawer short.',
      }

  const variance = data.drawer.varianceCash ?? 0
  const sections: ReportSection[] = []

  // KPI strip.
  const kpis: ReportKpi[] = [
    { label: L.netSales, value: m(data.sales.netSales) },
    {
      label: L.txns,
      value: n(data.sales.count),
      hint: data.sales.voidCount > 0 ? `${n(data.sales.voidCount)} ${L.voids}` : undefined,
    },
    { label: L.expected, value: m(data.drawer.expectedCash) },
  ]
  if (isZ) {
    kpis.push({
      label: L.variance,
      value: `${variance > 0 ? '+' : ''}${m(variance)}`,
      tone: varianceTone(variance),
      hint: variance === 0 ? L.balanced : variance > 0 ? L.over : L.short,
    })
  }
  sections.push({ kind: 'kpis', items: kpis })

  // Takings (tender mix).
  sections.push({
    kind: 'keyvalue',
    title: L.tenderSec,
    rows: [
      { label: L.gross, value: m(data.sales.grossSales) },
      { label: L.discounts, value: `− ${m(data.sales.discountTotal)}` },
      { label: L.cash, value: m(data.tenders.cash) },
      { label: L.momo, value: m(data.tenders.mtnMomo) },
      { label: L.orange, value: m(data.tenders.orangeMoney) },
      { label: L.card, value: m(data.tenders.card) },
      { label: L.credit, value: m(data.sales.creditIssued) },
    ],
  })

  // Drawer reconciliation.
  const drawerRows: Array<{
    label: string
    value: string
    subtotal?: boolean
    strong?: boolean
    tone?: ReportTone
  }> = [
    { label: L.openingFloat, value: m(data.drawer.openingFloat) },
    { label: L.cashSales, value: m(data.drawer.cashSales) },
    { label: L.change, value: m(data.drawer.changeGiven) },
    { label: L.cashIn, value: m(data.drawer.movementsIn) },
    { label: L.cashOut, value: m(data.drawer.movementsOut) },
    { label: L.expectedRow, value: m(data.drawer.expectedCash), subtotal: true },
  ]
  if (isZ) {
    drawerRows.push({ label: L.counted, value: m(data.drawer.countedCash ?? 0) })
    drawerRows.push({
      label: L.variance,
      value: `${variance > 0 ? '+' : ''}${m(variance)}`,
      strong: true,
      tone: varianceTone(variance),
    })
  }
  sections.push({ kind: 'keyvalue', title: L.drawerSec, rows: drawerRows })

  // Mobile money (only when there was any momo activity).
  if (data.tenders.mtnMomo > 0 || data.tenders.orangeMoney > 0) {
    const momoRow = (
      label: string,
      expected: number,
      confirmed: number | null,
    ): { label: string; value: string } => ({
      label,
      value:
        confirmed == null
          ? `${m(expected)} · ${L.pending}`
          : `${L.confirmed} ${m(confirmed)} / ${L.expectedTender} ${m(expected)}`,
    })
    const momoRows: Array<{ label: string; value: string }> = []
    if (data.tenders.mtnMomo > 0)
      momoRows.push(momoRow(L.momo, data.momo.expectedMtn, data.momo.confirmedMtn))
    if (data.tenders.orangeMoney > 0)
      momoRows.push(momoRow(L.orange, data.momo.expectedOrange, data.momo.confirmedOrange))
    sections.push({ kind: 'keyvalue', title: L.momoSec, rows: momoRows })
  }

  // Cash movements.
  sections.push({
    kind: 'table',
    title: L.movesSec,
    columns: [
      { key: 'time', label: L.time },
      { key: 'movement', label: L.movement },
      { key: 'in', label: L.in, align: 'right' },
      { key: 'out', label: L.out, align: 'right' },
    ],
    rows: data.movements.map((mv) => ({
      time: timeOf(mv.createdAt, opts.locale),
      movement: movementLabel(mv.kind, fr) + (mv.note ? ` — ${mv.note}` : ''),
      in: mv.direction === 'IN' ? m(mv.amount) : '',
      out: mv.direction === 'OUT' ? m(mv.amount) : '',
    })),
    empty: L.noMoves,
  })

  // Notes.
  if (data.varianceReason || data.varianceNote) {
    const parts = [data.varianceReason, data.varianceNote].filter(Boolean).join(' — ')
    sections.push({ kind: 'note', text: `${L.reasonNote}: ${parts}` })
  }
  if (data.closingNote) {
    sections.push({ kind: 'note', text: `${L.closingNote}: ${data.closingNote}` })
  }

  const subtitle = [
    data.cashierName ? `${L.cashier}: ${data.cashierName}` : null,
    `${L.opened}: ${dateTimeOf(data.openedAt, opts.locale)}`,
    isZ && data.closedAt ? `${L.closed}: ${dateTimeOf(data.closedAt, opts.locale)}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ')

  const document = baseDoc(isZ ? L.titleZ : L.titleX, opts, sections, subtitle)

  const csv = toCsv(
    [L.movement, L.netSales, L.expected, L.counted, L.variance],
    [
      [
        L.cash,
        String(data.tenders.cash),
        String(data.drawer.expectedCash),
        String(data.drawer.countedCash ?? ''),
        String(variance),
      ],
      [L.momo, String(data.tenders.mtnMomo), '', '', ''],
      [L.orange, String(data.tenders.orangeMoney), '', '', ''],
      [L.card, String(data.tenders.card), '', '', ''],
    ],
  )
  return { document, csv }
}

/**
 * Daily close — a per-shift roster for the day plus rolled-up totals. Read-only review; the
 * server reconciliation (against daily_sale_summaries) is surfaced as a note when present.
 */
export function buildCashDailyReport(
  data: CashDailyReportData,
  opts: ReportBuildOptions,
): BuiltReportResult {
  const fr = isFr(opts.locale)
  const m = (x: number) => formatMoney(x, data.currency, opts.locale)
  const n = (x: number) => formatNumber(x, opts.locale)
  const L = fr
    ? {
        title: 'Clôture de caisse',
        netSales: 'Ventes nettes',
        txns: 'Transactions',
        shifts: 'Postes',
        variance: 'Écart total',
        rosterSec: 'Postes du jour',
        cashier: 'Caissier',
        opened: 'Ouverture',
        status: 'Statut',
        cashSales: 'Espèces',
        expected: 'Attendu',
        counted: 'Compté',
        totalsSec: 'Totaux du jour',
        gross: 'Ventes brutes',
        discounts: 'Remises',
        cash: 'Espèces',
        momo: 'MTN MoMo',
        orange: 'Orange Money',
        card: 'Carte',
        credit: 'Crédit accordé',
        openingFloat: 'Fonds de caisse',
        totalRow: 'TOTAL',
        empty: 'Aucun poste ouvert ce jour.',
        open: 'Ouvert',
        reconOk: 'Rapproché avec le résumé journalier ✓',
        reconOff: 'Écart avec le résumé journalier — à vérifier.',
      }
    : {
        title: 'Cash close',
        netSales: 'Net sales',
        txns: 'Transactions',
        shifts: 'Shifts',
        variance: 'Total variance',
        rosterSec: 'Shifts today',
        cashier: 'Cashier',
        opened: 'Opened',
        status: 'Status',
        cashSales: 'Cash',
        expected: 'Expected',
        counted: 'Counted',
        totalsSec: 'Day totals',
        gross: 'Gross sales',
        discounts: 'Discounts',
        cash: 'Cash',
        momo: 'MTN MoMo',
        orange: 'Orange Money',
        card: 'Card',
        credit: 'Credit issued',
        openingFloat: 'Opening float',
        totalRow: 'TOTAL',
        empty: 'No shifts opened this day.',
        open: 'Open',
        reconOk: 'Reconciled with the daily summary ✓',
        reconOff: 'Differs from the daily summary — please review.',
      }

  const t = data.totals
  const sections: ReportSection[] = [
    {
      kind: 'kpis',
      items: [
        { label: L.netSales, value: m(t.netSales) },
        { label: L.txns, value: n(t.salesCount) },
        { label: L.shifts, value: n(t.shifts) },
        {
          label: L.variance,
          value: `${t.varianceCash > 0 ? '+' : ''}${m(t.varianceCash)}`,
          tone: varianceTone(t.varianceCash),
        },
      ],
    },
    {
      kind: 'table',
      title: L.rosterSec,
      columns: [
        { key: 'cashier', label: L.cashier },
        { key: 'opened', label: L.opened },
        { key: 'status', label: L.status },
        { key: 'cash', label: L.cashSales, align: 'right' },
        { key: 'expected', label: L.expected, align: 'right' },
        { key: 'counted', label: L.counted, align: 'right' },
        { key: 'variance', label: L.variance, align: 'right' },
      ],
      rows: data.shifts.map((s) => ({
        cashier: s.cashierName || '—',
        opened: timeOf(s.openedAt, opts.locale),
        status: s.closedAt ? s.status : L.open,
        cash: m(s.cashSales),
        expected: m(s.expectedCash),
        counted: s.countedCash == null ? '—' : m(s.countedCash),
        variance:
          s.varianceCash == null ? '—' : `${s.varianceCash > 0 ? '+' : ''}${m(s.varianceCash)}`,
      })),
      total: {
        cashier: L.totalRow,
        opened: '',
        status: '',
        cash: m(t.cash),
        expected: m(t.expectedCash),
        counted: m(t.countedCash),
        variance: `${t.varianceCash > 0 ? '+' : ''}${m(t.varianceCash)}`,
      },
      empty: L.empty,
    },
    {
      kind: 'keyvalue',
      title: L.totalsSec,
      rows: [
        { label: L.gross, value: m(t.grossSales) },
        { label: L.discounts, value: `− ${m(t.discountTotal)}` },
        { label: L.netSales, value: m(t.netSales), subtotal: true },
        { label: L.cash, value: m(t.cash) },
        { label: L.momo, value: m(t.mtnMomo) },
        { label: L.orange, value: m(t.orangeMoney) },
        { label: L.card, value: m(t.card) },
        { label: L.credit, value: m(t.creditIssued) },
        { label: L.openingFloat, value: m(t.openingFloat) },
      ],
    },
  ]

  if (data.reconciliation) {
    sections.push({
      kind: 'note',
      text: data.reconciliation.matches ? L.reconOk : L.reconOff,
    })
  }

  const document = baseDoc(L.title, opts, sections)
  const csv = toCsv(
    [L.cashier, L.opened, L.status, L.cashSales, L.expected, L.counted, L.variance],
    data.shifts.map((s) => [
      s.cashierName || '',
      s.openedAt,
      s.status,
      String(s.cashSales),
      String(s.expectedCash),
      String(s.countedCash ?? ''),
      String(s.varianceCash ?? ''),
    ]),
  )
  return { document, csv }
}
