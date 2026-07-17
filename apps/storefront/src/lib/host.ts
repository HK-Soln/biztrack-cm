/**
 * Host → store resolution. Pure functions over a Host header, with no `next/headers` import, so
 * this module is usable from middleware as well as from server components (see src/lib/store.ts).
 */

/**
 * Where a visitor goes when there is no shop to show — the root domain, its `www` alias, or a slug
 * that matches no store. The storefront only ever serves shops; everything else is marketing.
 *
 * Not env-driven: a fixed product decision, not per-deploy configuration.
 */
export const MARKETING_URL = 'https://hk-solutions.app'

/**
 * Root domains under which each business gets its own permanent subdomain (`<slug>.<root>`),
 * from STORE_ROOT_DOMAIN — a comma-separated list, so one deployment can serve several roots
 * (e.g. the live domain plus `localhost` in dev). Must match the desktop/cloud app's
 * VITE_STOREFRONT_DOMAIN, which is what builds the store URLs shown to merchants.
 *
 * Server-only. REQUIRED: no fallback, so a misconfigured deploy fails loudly instead of quietly
 * resolving every host to "not a store".
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

/** Strip the port and normalise case — `Akwa.Biztrack.CM:3010` → `akwa.biztrack.cm`. */
function normalizeHost(hostHeader: string | null | undefined): string {
  return (hostHeader ?? '').split(':')[0]?.toLowerCase() ?? ''
}

/**
 * True for a configured root domain itself or its `www` alias — hosts that are not, and never will
 * be, a shop. Deliberately narrower than `!slugFromHost(host)`: an unrecognised host (a *.vercel.app
 * preview URL, say) is not the root, so it still renders normally rather than being redirected away.
 */
export function isStoreRootHost(hostHeader: string | null | undefined): boolean {
  const host = normalizeHost(hostHeader)
  return rootDomains().some((root) => host === root || host === `www.${root}`)
}

/**
 * Extract the store slug from a Host header. One subdomain = one shop, forever
 * (akwa.biztrack.hk-solutions.app → 'akwa'). The root itself and `www` are not stores.
 */
export function slugFromHost(hostHeader: string | null | undefined): string | null {
  const host = normalizeHost(hostHeader)
  const root = rootDomains().find((domain) => host === domain || host.endsWith(`.${domain}`))
  if (!root || host === root) return null
  const sub = host.slice(0, host.length - root.length - 1)
  return sub && sub !== 'www' ? sub : null
}
