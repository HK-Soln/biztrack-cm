import type { DocumentBusinessInfo, DocumentParty } from '@biztrack/types'
import { DOCUMENT_CSS } from './styles'
import { escapeHtml } from './format'

/** Wrap body markup in a full, self-contained HTML document with inlined styles. */
export function htmlDocument(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${DOCUMENT_CSS}</style>
</head>
<body><div class="doc">${body}</div></body>
</html>`
}

export function renderBusinessBlock(b: DocumentBusinessInfo): string {
  const meta = [b.address, b.phone, b.email].filter(Boolean).map(escapeHtml).join('\n')
  const logo = b.logoUrl ? `<img class="biz-logo" src="${escapeHtml(b.logoUrl)}" alt="" />` : ''
  return `<div class="biz">${logo}<div>
    <div class="biz-name">${escapeHtml(b.name)}</div>
    ${meta ? `<div class="biz-meta">${meta}</div>` : ''}
  </div></div>`
}

export function renderPartyBlock(label: string, p: DocumentParty): string {
  const lines = [p.phone, p.email, p.address].filter(Boolean).map((l) => `<div class="meta-line">${escapeHtml(l)}</div>`).join('')
  return `<div class="meta-block">
    <div class="meta-label">${escapeHtml(label)}</div>
    <div class="meta-strong">${escapeHtml(p.name)}</div>
    ${lines}
  </div>`
}

export function renderInfoBlock(label: string, value: string): string {
  return `<div class="meta-block">
    <div class="meta-label">${escapeHtml(label)}</div>
    <div class="meta-strong">${escapeHtml(value)}</div>
  </div>`
}
