import { z } from 'zod'

/**
 * Single source of truth for desktop-v2 configuration — the schema, defaults, and validation
 * live here (the apps/api `configuration.ts` analog). Because the app has two runtimes that read
 * env differently, each has a thin binding that feeds its raw env into `resolveDesktopConfig`:
 *   - main process  → src/main/config.ts            (process.env, baked by electron-vite)
 *   - renderer      → src/renderer/src/lib/config.ts (import.meta.env)
 * Nothing else should read env directly — import the resolved `config` from those bindings.
 *
 * `apiUrl` and `storeRootDomain` are REQUIRED — there is no localhost fallback. A build or deploy
 * that doesn't provide them fails fast (the web build fails; the desktop app won't start). Only the
 * dev-only `dbPath` / `rendererDevUrl` stay optional.
 */

/** Raw env each runtime supplies (main from process.env, renderer from import.meta.env). */
export interface RawDesktopEnv {
  /** API base URL incl. the /api/v1 prefix (VITE_API_URL). REQUIRED — no default. */
  apiUrl?: string | null
  /** SQLite path override — dev/testing only (DESKTOP_DB_PATH). Main process only. */
  dbPath?: string | null
  /** electron-vite dev server URL (ELECTRON_RENDERER_URL). Main process only. */
  rendererDevUrl?: string | null
  /** Root domain for customer storefronts (VITE_STOREFRONT_DOMAIN). REQUIRED — no default. */
  storeRootDomain?: string | null
}

// Empty/whitespace → undefined so a required field reports a clear "Required" error.
const optionalTrimmed = (schema: z.ZodTypeAny) =>
  z.preprocess((v) => {
    if (typeof v !== 'string') return undefined
    const t = v.trim()
    return t.length ? t : undefined
  }, schema)

const schema = z.object({
  apiUrl: optionalTrimmed(
    z
      .string({ required_error: 'VITE_API_URL is required (no localhost fallback)' })
      .url('VITE_API_URL must be a full URL including the /api/v1 prefix'),
  ),
  dbPath: optionalTrimmed(z.string().optional()),
  rendererDevUrl: optionalTrimmed(z.string().url().optional()),
  storeRootDomain: optionalTrimmed(
    z.string({ required_error: 'VITE_STOREFRONT_DOMAIN is required (no localhost fallback)' }),
  ),
})

export interface DesktopConfig {
  /** API base URL incl. /api/v1. */
  apiBaseUrl: string
  /** SQLite path override, or null to use the default per-runtime location. */
  dbPathOverride: string | null
  /** electron-vite dev renderer URL, or null in a packaged build. */
  rendererDevUrl: string | null
  /** Storefront root domain (`<slug>.<root>`). */
  storeRootDomain: string
}

/** Validate raw env and derive the typed config. Throws on a missing/malformed value (fail fast). */
export function resolveDesktopConfig(raw: RawDesktopEnv): DesktopConfig {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid desktop configuration: ${detail}`)
  }
  return {
    apiBaseUrl: parsed.data.apiUrl,
    dbPathOverride: parsed.data.dbPath ?? null,
    rendererDevUrl: parsed.data.rendererDevUrl ?? null,
    storeRootDomain: parsed.data.storeRootDomain,
  }
}
