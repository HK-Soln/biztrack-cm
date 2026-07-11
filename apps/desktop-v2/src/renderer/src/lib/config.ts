import { resolveDesktopConfig } from '@shared/config'

// The single place the renderer reads env (import.meta.env). VITE_API_URL and
// VITE_STOREFRONT_DOMAIN are injected by Vite at build time; the schema + defaults live in
// src/shared/config.ts (shared with the main process). Import the resolved values from here.
const env = import.meta.env as unknown as Record<string, string | undefined>
export const config = resolveDesktopConfig({
  apiUrl: env.VITE_API_URL,
  storeRootDomain: env.VITE_STOREFRONT_DOMAIN,
})

/** API base URL for the cloud/browser build (the renderer talks to apps/api directly). */
export const CLOUD_API_BASE_URL = config.apiBaseUrl

/** Root domain for customer storefronts (subdomain per store: `<slug>.<root>`). */
export const STORE_ROOT_DOMAIN = config.storeRootDomain
