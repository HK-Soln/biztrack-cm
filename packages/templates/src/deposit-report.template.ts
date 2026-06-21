import type { DepositReport } from '@biztrack/types'
import { escapeHtml, formatMoney } from './format'
import { htmlDocument, renderBusinessBlock, renderInfoBlock, renderPartyBlock } from './shell'

export interface DepositReportLabels {
  title: string
  customer: string
  created: string
  status: string
  deposited: string
  collected: string
  refunded: string
  transferred: string
  balance: string
  taggedItems: string
  statement: string
  date: string
  entry: string
  amount: string
  running: string
  types: Record<string, string>
  methods: Record<string, string>
  statuses: Record<string, string>
  outcomes: Record<string, string>
}

export function depositReportLabels(locale: string): DepositReportLabels {
  const fr = (locale || 'fr').toLowerCase().startsWith('fr')
  const methods = fr
    ? { CASH: 'Espèces', MTN_MOMO: 'MTN MoMo', ORANGE_MONEY: 'Orange Money', CARD: 'Carte', SAVINGS: 'Dépôt' }
    : { CASH: 'Cash', MTN_MOMO: 'MTN MoMo', ORANGE_MONEY: 'Orange Money', CARD: 'Card', SAVINGS: 'Deposit' }
  const types = fr
    ? { deposit: 'Dépôt', refund: 'Remboursement', sale: 'Marchandises retirées', voided_sale: 'Vente annulée', transfer_in: 'Transfert entrant', transfer_out: 'Transfert sortant' }
    : { deposit: 'Deposit', refund: 'Refund', sale: 'Goods collected', voided_sale: 'Sale voided', transfer_in: 'Transferred in', transfer_out: 'Transferred out' }
  const statuses = fr ? { OPEN: 'Ouverte', CLOSED: 'Fermée' } : { OPEN: 'Open', CLOSED: 'Closed' }
  const outcomes = fr
    ? { COLLECTED: 'Marchandises retirées', COLLECTED_REFUNDED: 'Retirées · remboursé', COLLECTED_TRANSFERRED: 'Retirées · transféré', REFUNDED: 'Remboursé' }
    : { COLLECTED: 'Goods collected', COLLECTED_REFUNDED: 'Collected · refunded', COLLECTED_TRANSFERRED: 'Collected · transferred', REFUNDED: 'Refunded' }
  return fr
    ? { title: 'Relevé de session de dépôt', customer: 'Client', created: 'Ouverte le', status: 'Statut', deposited: 'Total déposé', collected: 'Marchandises retirées', refunded: 'Remboursé', transferred: 'Transféré', balance: 'Solde', taggedItems: 'Articles associés', statement: 'Relevé', date: 'Date', entry: 'Opération', amount: 'Montant', running: 'Solde', types, methods, statuses, outcomes }
    : { title: 'Deposit session statement', customer: 'Customer', created: 'Opened', status: 'Status', deposited: 'Total deposited', collected: 'Goods collected', refunded: 'Refunded', transferred: 'Transferred', balance: 'Balance', taggedItems: 'Tagged items', statement: 'Statement', date: 'Date', entry: 'Entry', amount: 'Amount', running: 'Balance', types, methods, statuses, outcomes }
}

export interface DepositReportOptions {
  labels: DepositReportLabels
  locale?: string
}

/** Render a full deposit-session report as a self-contained HTML document (PDF source). */
export function renderDepositReportHtml(report: DepositReport, opts: DepositReportOptions): string {
  const L = opts.labels
  const locale = opts.locale ?? 'fr'
  const currency = (report.currency as string) || 'XAF'
  const m = (n: number): string => formatMoney(n, currency, locale)
  const statusText: string =
    (report.status === 'CLOSED' && report.outcome ? L.outcomes[report.outcome] : L.statuses[report.status]) ?? report.status

  const rows = report.entries
    .map((e) => {
      const label = L.types[e.type] ?? e.type
      const method = e.method ? ` · ${L.methods[e.method] ?? e.method}` : ''
      const signed = `${e.direction === 'inbound' ? '+' : '−'} ${m(e.amount)}`
      return `<tr>
        <td>${escapeHtml(formatDate(e.occurredAt, locale))}</td>
        <td>${escapeHtml(label + method)}${e.notes ? `<span class="sku">${escapeHtml(e.notes)}</span>` : ''}</td>
        <td class="num">${escapeHtml(signed)}</td>
        <td class="num">${escapeHtml(m(e.runningBalance))}</td>
      </tr>`
    })
    .join('')

  const tagged = report.taggedProducts.length
    ? `<div class="note"><div class="note-label">${escapeHtml(L.taggedItems)}</div>${report.taggedProducts.map((p) => escapeHtml(p.productName)).join(' · ')}</div>`
    : ''

  const body = `
    <div class="doc-head">
      ${renderBusinessBlock({ name: report.businessName, address: report.businessAddress ?? undefined, phone: report.businessPhone ?? undefined })}
      <div class="doc-title">
        <h1>${escapeHtml(L.title)}</h1>
        <div class="doc-no">${escapeHtml(report.sessionRef)}</div>
        <span class="doc-status">${escapeHtml(statusText)}</span>
      </div>
    </div>

    <div class="meta-grid">
      ${renderPartyBlock(L.customer, { name: report.customerName ?? '—', phone: report.customerPhone ?? undefined })}
      ${renderInfoBlock(L.created, formatDate(report.createdAt, locale))}
      ${renderInfoBlock(L.status, statusText)}
    </div>

    <div class="totals">
      <div class="row"><span>${escapeHtml(L.deposited)}</span><span>${m(report.totalDeposited)}</span></div>
      <div class="row"><span>${escapeHtml(L.collected)}</span><span>${m(report.totalUsed)}</span></div>
      ${report.totalRefunded > 0 ? `<div class="row"><span>${escapeHtml(L.refunded)}</span><span>${m(report.totalRefunded)}</span></div>` : ''}
      ${report.totalTransferred > 0 ? `<div class="row"><span>${escapeHtml(L.transferred)}</span><span>${m(report.totalTransferred)}</span></div>` : ''}
      <div class="row grand"><span>${escapeHtml(L.balance)}</span><span>${m(report.balance)}</span></div>
    </div>

    ${tagged}

    <table>
      <thead>
        <tr><th>${escapeHtml(L.date)}</th><th>${escapeHtml(L.entry)}</th><th class="num">${escapeHtml(L.amount)}</th><th class="num">${escapeHtml(L.running)}</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="foot">${escapeHtml(report.businessName)} · ${escapeHtml(report.sessionRef)}</div>
  `

  return htmlDocument(`${L.title} ${report.sessionRef}`, body)
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}
