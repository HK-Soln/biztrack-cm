// Formatting helpers shared by all templates. Intl is available in Node (API) and
// Chromium (Electron), so currency/number formatting is identical on both sides.

export function formatMoney(amount: number, currency: string, locale = 'fr'): string {
  const value = Number.isFinite(amount) ? amount : 0
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value)
  } catch {
    return `${currency} ${Math.round(value).toLocaleString(locale)}`
  }
}

export function formatNumber(value: number, locale = 'fr'): string {
  try {
    return new Intl.NumberFormat(locale).format(Number.isFinite(value) ? value : 0)
  } catch {
    return String(value)
  }
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escape user-provided text before interpolating into a template. */
export function escapeHtml(input: string | null | undefined): string {
  if (input == null) return ''
  return String(input).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c)
}

/** Escape then convert newlines to <br/> for multi-line bodies (notes, messages). */
export function escapeMultiline(input: string | null | undefined): string {
  return escapeHtml(input).replace(/\n/g, '<br/>')
}
