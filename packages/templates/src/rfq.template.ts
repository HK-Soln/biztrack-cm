import type { RfqDocument } from '@biztrack/types'
import { escapeHtml, escapeMultiline } from './format'
import { htmlDocument, renderBusinessBlock, renderInfoBlock, renderPartyBlock } from './shell'

/**
 * Render a Request for Quotation as a self-contained HTML document. No prices —
 * the supplier fills those in. Same rendering contract as the PO template.
 */
export function renderRfqHtml(doc: RfqDocument): string {
  const rows = doc.items
    .map(
      (it) => `<tr>
      <td>${escapeHtml(it.description)}${it.sku ? `<span class="sku">${escapeHtml(it.sku)}</span>` : ''}</td>
      <td class="num">${escapeHtml(String(it.quantity))}</td>
      <td class="num">&nbsp;</td>
    </tr>`,
    )
    .join('')

  const message = doc.messageBody
    ? `<div class="note"><div class="note-label">Message</div>${escapeMultiline(doc.messageBody)}</div>`
    : `<div class="note">Please provide your best unit price and availability for the items above.</div>`

  const body = `
    <div class="doc-head">
      ${renderBusinessBlock(doc.business)}
      <div class="doc-title">
        <h1>Request for Quotation</h1>
        <div class="doc-no">${escapeHtml(doc.number)}</div>
      </div>
    </div>

    <div class="meta-grid">
      ${renderPartyBlock('Supplier', doc.supplier)}
      ${renderInfoBlock('Issued', doc.issuedDate)}
      ${doc.responseDeadline ? renderInfoBlock('Respond by', doc.responseDeadline) : ''}
    </div>

    ${doc.title ? `<div class="meta-block" style="margin-bottom:14px"><div class="meta-label">Reference</div><div class="meta-strong">${escapeHtml(doc.title)}</div></div>` : ''}

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="num">Qty</th>
          <th class="num">Your unit price</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    ${message}

    <div class="foot">${escapeHtml(doc.business.name)} · ${escapeHtml(doc.number)}</div>
  `

  return htmlDocument(`Request for Quotation ${doc.number}`, body)
}
