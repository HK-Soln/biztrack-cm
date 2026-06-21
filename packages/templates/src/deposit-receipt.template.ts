import type { DepositReceipt } from '@biztrack/types'
import { escapeHtml, formatMoney } from './format'

/** Translated strings the deposit receipt needs (caller passes en/fr). */
export interface DepositReceiptLabels {
  deposit: string
  refund: string
  method: string
  balance: string
  totalDeposited: string
  cashier: string
  customer: string
  session: string
  thankYou: string
  methods: Record<string, string>
}

export function depositReceiptLabels(locale: string): DepositReceiptLabels {
  const fr = (locale || 'fr').toLowerCase().startsWith('fr')
  const methods = fr
    ? { CASH: 'Espèces', MTN_MOMO: 'MTN MoMo', ORANGE_MONEY: 'Orange Money', CARD: 'Carte', SAVINGS: 'Dépôt' }
    : { CASH: 'Cash', MTN_MOMO: 'MTN MoMo', ORANGE_MONEY: 'Orange Money', CARD: 'Card', SAVINGS: 'Deposit' }
  return fr
    ? { deposit: 'Reçu de dépôt', refund: 'Reçu de remboursement', method: 'Méthode', balance: 'Nouveau solde', totalDeposited: 'Total déposé', cashier: 'Caissier', customer: 'Client', session: 'Session', thankYou: 'Merci !', methods }
    : { deposit: 'Deposit receipt', refund: 'Refund receipt', method: 'Method', balance: 'New balance', totalDeposited: 'Total deposited', cashier: 'Cashier', customer: 'Customer', session: 'Session', thankYou: 'Thank you!', methods }
}

export interface DepositReceiptOptions {
  labels: DepositReceiptLabels
  locale?: string
  widthMm?: number
}

/** Render a deposit/refund receipt as a self-contained thermal-style HTML document. */
export function renderDepositReceiptHtml(receipt: DepositReceipt, opts: DepositReceiptOptions): string {
  const L = opts.labels
  const locale = opts.locale ?? 'fr'
  const width = opts.widthMm ?? 58
  const currency = (receipt.currency as string) || 'XAF'
  const m = (n: number): string => formatMoney(n, currency, locale)
  const when = formatDateTime(receipt.occurredAt, locale)
  const title = receipt.kind === 'refund' ? L.refund : L.deposit

  const row = (label: string, value: string, cls = ''): string =>
    `<div class="r ${cls}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`

  const head = [
    `<div class="c h">${escapeHtml(receipt.businessName)}</div>`,
    receipt.businessPhone ? `<div class="c s">${escapeHtml(receipt.businessPhone)}</div>` : '',
    receipt.businessAddress ? `<div class="c s">${escapeHtml(receipt.businessAddress)}</div>` : '',
  ].join('')

  const body = `
    ${head}
    <div class="d"></div>
    <div class="c b">${escapeHtml(title)}</div>
    <div class="c s">${escapeHtml(receipt.receiptNumber)}</div>
    <div class="c s">${escapeHtml(when)}</div>
    <div class="c s">${escapeHtml(L.session)}: ${escapeHtml(receipt.sessionRef)}</div>
    ${receipt.cashierName ? `<div class="c s">${escapeHtml(L.cashier)}: ${escapeHtml(receipt.cashierName)}</div>` : ''}
    ${receipt.customerName ? `<div class="c s cust">${escapeHtml(L.customer)}: ${escapeHtml(receipt.customerName)}</div>` : ''}
    <div class="d"></div>
    ${row(title, `${receipt.kind === 'refund' ? '- ' : ''}${m(receipt.amount)}`, 'big')}
    ${receipt.method ? row(L.method, L.methods[receipt.method] ?? receipt.method) : ''}
    <div class="d"></div>
    ${row(L.balance, m(receipt.balanceAfter))}
    ${row(L.totalDeposited, m(receipt.totalDeposited))}
    <div class="d"></div>
    <div class="c foot">${escapeHtml(receipt.footer || L.thankYou)}</div>
  `

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(receipt.receiptNumber)}</title><style>
    *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{background:#fff}
    body{font:13px/1.55 'Courier New',ui-monospace,monospace;font-weight:700;color:#000;width:${width}mm;padding:10mm 4mm;text-rendering:geometricPrecision;-webkit-font-smoothing:none}
    .c{text-align:center}
    .h{font-size:16px;font-weight:800;margin-bottom:6px}
    .s{font-size:12px;color:#000}
    .cust{margin-bottom:8px}
    .foot{margin-top:12px}
    .b{font-weight:800}
    .d{border-top:1px dashed #000;margin:6px 0}
    .r{display:flex;justify-content:space-between;gap:8px}
    .r.big{font-size:15px;font-weight:800;border-top:2px solid #000;margin-top:4px;padding-top:4px}
    @media print{@page{margin:0}}
  </style></head><body>${body}</body></html>`
}

function formatDateTime(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}
