// Renderer-side configuration constants.

// Root domain for customer storefronts (subdomain per store: <slug>.<root>). Configurable
// via VITE_STOREFRONT_DOMAIN; defaults to hk-solutions.app (biztrack.cm is not yet available).
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
export const STORE_ROOT_DOMAIN = env?.VITE_STOREFRONT_DOMAIN?.trim() || 'hk-solutions.app'
