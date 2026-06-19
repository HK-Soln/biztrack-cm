import type { PurchaseOrderDocument } from '@biztrack/types'
import { escapeHtml, escapeMultiline, formatMoney } from './format'
import { htmlDocument, renderBusinessBlock, renderInfoBlock, renderPartyBlock } from './shell'

/**
 * Render a Purchase Order as a self-contained HTML document. Both the desktop app
 * (Electron printToPDF) and the API (headless chromium) feed this HTML to their
 * PDF engine, so the output is identical.
 */
export function renderPurchaseOrderHtml(doc: PurchaseOrderDocument): string {
  const locale = doc.locale ?? 'fr'
  const money = (n: number) => formatMoney(n, doc.currency, locale)

  const rows = doc.items
    .map(
      (it) => `<tr>
      <td>${escapeHtml(it.description)}${it.sku ? `<span class="sku">${escapeHtml(it.sku)}</span>` : ''}</td>
      <td class="num">${escapeHtml(String(it.quantity))}</td>
      <td class="num">${money(it.unitPrice)}</td>
      <td class="num">${money(it.lineTotal)}</td>
    </tr>`,
    )
    .join('')

  const message = doc.messageBody
    ? `<div class="note"><div class="note-label">Message</div>${escapeMultiline(doc.messageBody)}</div>`
    : ''

  const body = `
    <div class="doc-head">
      ${renderBusinessBlock(doc.business)}
      <div class="doc-title">
        <h1>Purchase Order</h1>
        <div class="doc-no">${escapeHtml(doc.number)}</div>
        <span class="doc-status">${escapeHtml(doc.status)}</span>
      </div>
    </div>

    <div class="meta-grid">
      ${renderPartyBlock('Supplier', doc.supplier)}
      ${renderInfoBlock('Issued', doc.issuedDate)}
      ${doc.expectedDate ? renderInfoBlock('Expected', doc.expectedDate) : ''}
    </div>

    ${doc.title ? `<div class="meta-block" style="margin-bottom:14px"><div class="meta-label">Reference</div><div class="meta-strong">${escapeHtml(doc.title)}</div></div>` : ''}

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="num">Qty</th>
          <th class="num">Unit price</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${money(doc.subtotal)}</span></div>
      <div class="row grand"><span>Total</span><span>${money(doc.total)}</span></div>
    </div>

    ${message}
    ${doc.notes ? `<div class="note"><div class="note-label">Notes</div>${escapeMultiline(doc.notes)}</div>` : ''}

    <div class="foot">${escapeHtml(doc.business.name)} · ${escapeHtml(doc.number)}</div>
  `

  return htmlDocument(`Purchase Order ${doc.number}`, body)
}
