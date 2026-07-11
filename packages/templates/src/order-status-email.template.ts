import { escapeHtml } from './format'

export interface OrderEmailBusiness {
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  logoUrl?: string | null
}

export interface OrderStatusEmailOptions {
  business: OrderEmailBusiness
  order: {
    orderNumber: string
    customerName: string
    /** Pre-formatted money string (e.g. "15 000 XAF"); omitted to hide the line. */
    total?: string | null
    /** Public tracking URL; renders a "Track your order" button when present. */
    trackingUrl?: string | null
  }
  headline: string
  message: string
  /** Env-configured BizTrack marketing URL for the "Powered by" footer. */
  poweredByUrl: string
}

export interface OrderStatusEmailResult {
  subject: string
  html: string
}

/**
 * A branded, email-client-safe (inline-styled, table-based) order-status email. Shows the
 * BUSINESS's identity only; BizTrack appears just as a "Powered by" footer link. Shared by the
 * API so every order email is identical.
 */
export function renderOrderStatusEmail(
  subject: string,
  opts: OrderStatusEmailOptions,
): OrderStatusEmailResult {
  const { business, order, headline, message, poweredByUrl } = opts

  const logo = business.logoUrl
    ? `<img src="${escapeHtml(business.logoUrl)}" alt="${escapeHtml(business.name)}" height="40" style="display:block;max-height:40px;margin-bottom:10px" />`
    : ''
  const bizMeta = [business.address, business.phone, business.email]
    .filter(Boolean)
    .map((line) => escapeHtml(String(line)))
    .join(' &middot; ')
  const totalRow = order.total
    ? `<tr><td style="padding:6px 32px 0;color:#555;font-size:14px">Order total: <strong style="color:#111">${escapeHtml(order.total)}</strong></td></tr>`
    : ''
  const trackRow = order.trackingUrl
    ? `<tr><td style="padding:22px 32px 0">
        <a href="${escapeHtml(order.trackingUrl)}" style="display:inline-block;background:#1565C0;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px">Track your order</a>
      </td></tr>`
    : ''

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e8eb">
  <tr><td style="padding:28px 32px 4px">${logo}
    <div style="font-size:15px;font-weight:700;color:#111">${escapeHtml(business.name)}</div>
    ${bizMeta ? `<div style="font-size:12px;color:#888;margin-top:2px">${bizMeta}</div>` : ''}
  </td></tr>
  <tr><td style="padding:20px 32px 0"><div style="font-size:20px;font-weight:700;color:#111">${escapeHtml(headline)}</div></td></tr>
  <tr><td style="padding:8px 32px 0;color:#333;font-size:15px;line-height:1.55">Hi ${escapeHtml(order.customerName)},<br />${escapeHtml(message)}</td></tr>
  <tr><td style="padding:14px 32px 0;color:#555;font-size:14px">Order <strong style="color:#111">${escapeHtml(order.orderNumber)}</strong></td></tr>
  ${totalRow}
  ${trackRow}
  <tr><td style="padding:28px 32px 24px"><hr style="border:none;border-top:1px solid #eeeeee;margin:0 0 14px" />
    <div style="font-size:12px;color:#9aa0a6">Powered by <a href="${escapeHtml(poweredByUrl)}" style="color:#1565C0;text-decoration:none">BizTrack</a></div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`

  return { subject, html }
}
