import { headers } from 'next/headers'

/**
 * Root domains under which each business gets its own permanent subdomain (`<slug>.<root>`),
 * from STORE_ROOT_DOMAIN — a comma-separated list, so one deployment can serve several roots
 * (e.g. the live domain plus `localhost` in dev). Must match the desktop/cloud app's
 * VITE_STOREFRONT_DOMAIN, which is what builds the store URLs shown to merchants.
 *
 * Server-only and read per request rather than inlined at build — see src/lib/config.ts.
 * REQUIRED: no fallback, so a misconfigured deploy fails loudly instead of quietly resolving
 * every host to "not a store".
 */
function rootDomains(): string[] {
  const raw = process.env.STORE_ROOT_DOMAIN?.trim()
  if (!raw) {
    throw new Error(
      '[storefront] STORE_ROOT_DOMAIN is required (no localhost fallback). Set it to the ' +
        'storefront root domain, e.g. biztrack.hk-solutions.app.',
    )
  }
  return raw
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^\.+/, '').split(':')[0] ?? '')
    .filter(Boolean)
}

/**
 * Extract the store slug from a Host header. One subdomain = one shop, forever
 * (akwa.biztrack.hk-solutions.app → 'akwa'). The root itself and `www` are not stores.
 */
export function slugFromHost(hostHeader: string | null | undefined): string | null {
  const host = (hostHeader ?? '').split(':')[0]?.toLowerCase() ?? ''
  const root = rootDomains().find((domain) => host === domain || host.endsWith(`.${domain}`))
  if (!root || host === root) return null
  const sub = host.slice(0, host.length - root.length - 1)
  return sub && sub !== 'www' ? sub : null
}

/** The current request's store slug, from the Host header (server components). */
export async function getStoreSlug(): Promise<string | null> {
  return slugFromHost((await headers()).get('host'))
}
