// Shared app route registry (N7). One source of truth for the in-app route paths that
// notification deeplinks point at, used by BOTH the API (to build full external URLs) and
// the frontend router. Paths are relative (leading slash); build an absolute URL for an
// external channel with buildAppUrl(baseUrl, path).

export const APP_ROUTES = {
  home: (): string => '/',
  inventory: (): string => '/inventory',
  reorder: (): string => '/inventory/reorder',
  reports: (): string => '/reports',
  activity: (): string => '/activity',
  settings: (): string => '/settings',
  contacts: (): string => '/contacts',
  contact: (id: string): string => `/contacts/${id}`,
  /** Contacts list filtered to customers who owe (the debtors tab). */
  debtors: (): string => '/contacts?tab=debtors',
  onlineOrders: (): string => '/online/orders',
  onlineOrder: (id: string): string => `/online/orders/${id}`,
} as const

/** Build an absolute URL to an app route on the web/cloud app. The app is a HASH router
 *  (createHashRouter), so routes live after `#` — e.g. `https://app…/#/contacts/123`.
 *  Returns null when there's no base (the external link is then omitted). */
export function buildAppUrl(baseUrl: string | null | undefined, path: string): string | null {
  if (!baseUrl) return null
  const base = baseUrl.replace(/\/+$/, '')
  const rel = path.startsWith('/') ? path : `/${path}`
  return `${base}/#${rel}`
}
