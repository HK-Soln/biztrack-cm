/**
 * Resolve the absolute store URLs for SEO routes from the incoming request.
 * Subdomain access ({slug}.host) serves at the origin root; path access (host/{slug})
 * carries the slug prefix.
 */
export function storeUrls(req: Request, slug: string): { origin: string; base: string } {
  const hostHeader = req.headers.get('host') ?? ''
  const host = hostHeader.split(':')[0] ?? ''
  const proto = req.headers.get('x-forwarded-proto') ?? (host === 'localhost' ? 'http' : 'https')
  const origin = `${proto}://${hostHeader}`
  const onSubdomain = host.startsWith(`${slug}.`)
  return { origin, base: onSubdomain ? origin : `${origin}/${slug}` }
}

export const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
