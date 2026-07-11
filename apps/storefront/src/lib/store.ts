import { headers } from 'next/headers'

/** Root domains under which each business gets its own permanent subdomain. */
const ROOT_DOMAINS = ['biztrack.cm', 'localhost']

/**
 * Extract the store slug from a Host header. One subdomain = one shop, forever
 * (akwa.biztrack.cm → 'akwa'). The apex and `www` are not stores.
 */
export function slugFromHost(hostHeader: string | null | undefined): string | null {
  const host = (hostHeader ?? '').split(':')[0] ?? ''
  const root = ROOT_DOMAINS.find((domain) => host === domain || host.endsWith(`.${domain}`))
  if (!root || host === root) return null
  const sub = host.slice(0, host.length - root.length - 1)
  return sub && sub !== 'www' ? sub : null
}

/** The current request's store slug, from the Host header (server components). */
export async function getStoreSlug(): Promise<string | null> {
  return slugFromHost((await headers()).get('host'))
}
