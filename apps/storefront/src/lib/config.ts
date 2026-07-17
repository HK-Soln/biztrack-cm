/**
 * Storefront configuration. Every value is REQUIRED — there is no localhost fallback, so a
 * misconfigured deploy fails loudly instead of silently shipping a store pointed at localhost.
 *
 * Two different lifetimes, which is why they are read in two different places:
 *   - NEXT_PUBLIC_API_URL (here) is inlined into the CLIENT bundle at BUILD time. It must be
 *     present in the environment that runs `next build` — for CI that means the GitHub
 *     Environment (see .github/workflows/storefront-web.yml), because `vercel build` runs in
 *     the runner where the Vercel project's env vars are not applied.
 *   - STORE_ROOT_DOMAIN (src/lib/store.ts) is server-only and read per request, so it comes
 *     from the Vercel project env at runtime.
 */

function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) {
    throw new Error(
      `[storefront] ${name} is required (no localhost fallback). Set it in the environment that ` +
        'runs the build, or in apps/storefront/.env.local for a local build.',
    )
  }
  return trimmed
}

// Referenced as a full literal (not process.env[name]) so Next can inline it at build time.
const apiUrl = required('NEXT_PUBLIC_API_URL', process.env.NEXT_PUBLIC_API_URL)

try {
  new URL(apiUrl)
} catch {
  throw new Error(
    `[storefront] NEXT_PUBLIC_API_URL must be a full URL including the /api/v1 prefix (got "${apiUrl}").`,
  )
}

/** API base URL, including the /api/v1 prefix. */
export const API_BASE_URL = apiUrl
