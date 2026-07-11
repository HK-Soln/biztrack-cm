import type { PublicStore } from '@biztrack/types'

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Per-store favicon. Prefer the uploaded logo (browsers render png/svg/ico directly);
 * otherwise generate an initial-on-brand SVG tile — matching the header avatar — so
 * every store gets a themed favicon with no extra runtime or image route.
 */
export function storeFaviconUrl(
  store: Pick<PublicStore, 'logoUrl' | 'storeName' | 'primaryColor'>,
): string {
  if (store.logoUrl) return store.logoUrl

  const bg = store.primaryColor || '#2563eb'
  const initial = escapeXml((store.storeName || '?').charAt(0).toUpperCase())
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="14" fill="${escapeXml(bg)}"/>` +
    `<text x="32" y="43" text-anchor="middle" fill="#ffffff" ` +
    `font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="34" font-weight="700">` +
    `${initial}</text></svg>`

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
