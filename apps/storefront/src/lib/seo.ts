/** Absolute origin for the current request (subdomain-only storefront). */
export function storeOrigin(req: Request): string {
  const hostHeader = req.headers.get('host') ?? ''
  const host = hostHeader.split(':')[0] ?? ''
  const proto = req.headers.get('x-forwarded-proto') ?? (host === 'localhost' ? 'http' : 'https')
  return `${proto}://${hostHeader}`
}

export const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
