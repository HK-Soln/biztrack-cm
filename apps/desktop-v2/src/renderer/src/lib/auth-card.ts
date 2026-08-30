import QRCode from 'qrcode'

/**
 * BIZ-3.3 — render a printable authorization card (a QR of the one-time token) as HTML for the
 * PDF pipeline. The token is only in memory here; nothing is persisted in clear. The card is laid
 * out centered on the page so it prints on any printer and can be cut/laminated.
 */
export async function buildAuthCardHtml(opts: {
  token: string
  holderName: string
  businessName: string
  label: string | null
}): Promise<string> {
  const qr = await QRCode.toDataURL(opts.token, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 360,
  })
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 24px; }
    .card { width: 320px; margin: 12px auto; border: 1.5px solid #111; border-radius: 14px;
      padding: 18px 18px 20px; text-align: center; }
    .biz { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #555; }
    .name { font-size: 18px; font-weight: 700; margin: 4px 0 2px; }
    .label { font-size: 12px; color: #666; margin-bottom: 12px; }
    .qr { width: 220px; height: 220px; }
    .foot { font-size: 10px; color: #888; margin-top: 12px; }
  </style></head><body>
    <div class="card">
      <div class="biz">${esc(opts.businessName)}</div>
      <div class="name">${esc(opts.holderName)}</div>
      <div class="label">${esc(opts.label ?? 'Authorization card')}</div>
      <img class="qr" src="${qr}" alt="QR" />
      <div class="foot">Scan at the till to authorize. Keep private — revoke if lost.</div>
    </div>
  </body></html>`
}
