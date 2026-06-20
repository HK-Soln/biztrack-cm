import type { SaleReceipt } from '@biztrack/types'
import { escapeHtml, formatMoney } from './format'

/**
 * Translated strings the receipt needs. Passed in by the caller so the template stays
 * language-agnostic (desktop passes en/fr from its catalog; the API passes its own i18n).
 * `methods` maps a PaymentMethod value to its display label.
 */
export interface SaleReceiptLabels {
  subtotal: string
  discounts: string
  charges: string
  total: string
  paid: string
  credit: string
  change: string
  cashier: string
  customer: string
  thankYou: string
  methods: Record<string, string>
}

/** Built-in en/fr receipt labels so the API and desktop render identical receipts
 * without each re-deriving the strings. Callers may still pass their own labels. */
export function saleReceiptLabels(locale: string): SaleReceiptLabels {
  const fr = (locale || 'fr').toLowerCase().startsWith('fr')
  const methods = fr
    ? { CASH: 'Espèces', MTN_MOMO: 'MTN MoMo', ORANGE_MONEY: 'Orange Money', CARD: 'Carte', SAVINGS: 'Dépôt', MIXED: 'Partagé' }
    : { CASH: 'Cash', MTN_MOMO: 'MTN MoMo', ORANGE_MONEY: 'Orange Money', CARD: 'Card', SAVINGS: 'Deposit', MIXED: 'Split' }
  return fr
    ? { subtotal: 'Sous-total', discounts: 'Remises', charges: 'Frais', total: 'Total', paid: 'Payé', credit: 'Crédit', change: 'Monnaie rendue', cashier: 'Caissier', customer: 'Client', thankYou: 'Merci pour votre achat !', methods }
    : { subtotal: 'Subtotal', discounts: 'Discounts', charges: 'Charges', total: 'Total', paid: 'Paid', credit: 'Credit', change: 'Change given', cashier: 'Cashier', customer: 'Customer', thankYou: 'Thank you for your purchase!', methods }
}

export interface SaleReceiptOptions {
  labels: SaleReceiptLabels
  /** Locale for money/date formatting (e.g. 'fr', 'en'). Defaults to 'fr'. */
  locale?: string
  /** Paper width in mm (thermal rolls are 58 or 80). Defaults to 58. */
  widthMm?: number
}

/**
 * Render a point-of-sale receipt as a self-contained thermal-style HTML document.
 * Shared by the desktop app (printed via an iframe / printToPDF) and the API (PDF render
 * + dispatch) so a customer's receipt looks identical wherever it's produced.
 */
export function renderSaleReceiptHtml(receipt: SaleReceipt, opts: SaleReceiptOptions): string {
  const L = opts.labels
  const locale = opts.locale ?? 'fr'
  const width = opts.widthMm ?? 58
  const currency = (receipt.currency as string) || 'XAF'
  const m = (n: number): string => formatMoney(n, currency, locale)
  const when = formatDateTime(receipt.soldAt, locale)

  const row = (label: string, value: string, cls = ''): string =>
    `<div class="r ${cls}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`

  const items = receipt.items
    .map((it) => {
      const sub = `${m(it.unitPrice)} × ${formatQty(it.qty, locale)}`
      return `<div class="it"><div class="r b"><span>${escapeHtml(it.name)}</span><span>${escapeHtml(m(it.total))}</span></div><div class="sub">${escapeHtml(sub)}</div></div>`
    })
    .join('')

  const pays = receipt.payments
    .map((p) => row(L.methods[p.method] ?? p.method, m(p.amount)))
    .join('')

  const head = [
    `<div class="c h">${escapeHtml(receipt.businessName)}</div>`,
    receipt.businessPhone ? `<div class="c s">${escapeHtml(receipt.businessPhone)}</div>` : '',
    receipt.businessAddress ? `<div class="c s">${escapeHtml(receipt.businessAddress)}</div>` : '',
  ].join('')

  const body = `
    ${head}
    <div class="d"></div>
    <div class="c b">${escapeHtml(receipt.saleNumber)}</div>
    <div class="c s">${escapeHtml(when)}</div>
    ${receipt.cashierName ? `<div class="c s">${escapeHtml(L.cashier)}: ${escapeHtml(receipt.cashierName)}</div>` : ''}
    ${receipt.customerName ? `<div class="c s cust">${escapeHtml(L.customer)}: ${escapeHtml(receipt.customerName)}</div>` : ''}
    <div class="d"></div>
    ${items}
    <div class="d"></div>
    ${row(L.subtotal, m(receipt.subtotal))}
    ${receipt.discountAmount > 0 ? row(L.discounts, `- ${m(receipt.discountAmount)}`) : ''}
    ${receipt.chargesAmount > 0 ? row(L.charges, `+ ${m(receipt.chargesAmount)}`) : ''}
    ${row(L.total, m(receipt.totalAmount), 'big')}
    <div class="d"></div>
    ${pays}
    ${receipt.creditAmount > 0 ? row(L.credit, m(receipt.creditAmount)) : ''}
    ${receipt.changeGiven > 0 ? row(L.change, m(receipt.changeGiven)) : ''}
    <div class="d"></div>
    <div class="c foot">${escapeHtml(receipt.footer || L.thankYou)}</div>
  `

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(receipt.saleNumber)}</title><style>
    *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{background:#fff}
    html{scrollbar-width:thin;scrollbar-color:#cbd5e1 transparent}
    ::-webkit-scrollbar{width:5px;height:5px}
    ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:9999px}
    ::-webkit-scrollbar-track{background:transparent}
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
    .it{margin-bottom:3px}
    .it .sub{font-size:11.5px;color:#000}
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
function formatQty(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(n)
  } catch {
    return String(n)
  }
}
