import { headers } from 'next/headers'

/**
 * Where storefront links point. Subdomain access ({slug}.host/…) serves at the URL
 * root so links carry no slug; path access (host/{slug}/…) needs the /slug prefix.
 * Detect from the Host header.
 */
export async function resolveBase(slug: string): Promise<string> {
  const host = (await headers()).get('host')?.split(':')[0] ?? ''
  return host.startsWith(`${slug}.`) ? '' : `/${slug}`
}
