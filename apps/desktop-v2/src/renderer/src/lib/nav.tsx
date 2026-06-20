import type { ReactNode } from 'react'
import type { MessageKey } from '@/i18n/messages'

// Minimal inline icon set mirroring the design (stroke icons). Kept app-local for
// now; can graduate to @biztrack/ui if reused across apps.
const s = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    {d}
  </svg>
)

export const Icon = {
  home: s(
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
    </>,
  ),
  sell: s(
    <>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h3l2.2 12.2a1.5 1.5 0 0 0 1.5 1.3h8.4a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
    </>,
  ),
  products: s(
    <>
      <path d="M21 8 12 3 3 8l9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
    </>,
  ),
  tag: s(
    <>
      <path d="M3 7v6l8 8 7-7-8-8H3Z" />
      <circle cx="7" cy="11" r="1.3" />
    </>,
  ),
  ruler: s(
    <>
      <path d="M3 17 17 3l4 4L7 21Z" />
      <path d="M9 7l2 2M12 4l2 2M6 10l2 2" />
    </>,
  ),
  inventory: s(
    <>
      <path d="M3 7h18v12H3z" />
      <path d="M3 11h18M8 7V4h8v3" />
    </>,
  ),
  sales: s(
    <>
      <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2Z" />
      <path d="M8 8h8M8 12h8" />
    </>,
  ),
  contacts: s(
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6" />
    </>,
  ),
  expenses: s(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18M7 14h4" />
    </>,
  ),
  deposits: s(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.2a2.5 2 0 0 1 5 0c0 2.5-5 1-5 3.6a2.5 2 0 0 0 5 0" />
    </>,
  ),
  reports: s(
    <>
      <path d="M4 20V4M4 20h16" />
      <rect x="7" y="11" width="3" height="6" />
      <rect x="13" y="7" width="3" height="10" />
    </>,
  ),
  settings: s(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.5h-4l-.3 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" />
    </>,
  ),
  more: s(
    <>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </>,
  ),
  store: s(
    <>
      <path d="M3 9 4.5 4h15L21 9" />
      <path d="M4 9v11h16V9" />
      <path d="M9 20v-6h6v6" />
    </>,
  ),
  card: s(
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
    </>,
  ),
  bell: s(
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>,
  ),
  search: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="9" cy="9" r="6" />
      <path d="m14 14 3 3" />
    </svg>
  ),
  cart: s(
    <>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
      <path d="M3 4h2l2 12h11l2-8H7" />
    </>,
  ),
  quote: s(
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4M9 12h7M9 16h5" />
    </>,
  ),
}

export type NavLeaf = { to: string; label: MessageKey; icon?: keyof typeof Icon; badge?: MessageKey }
export type NavEntry = NavLeaf | { label: MessageKey; icon: keyof typeof Icon; children: NavLeaf[] }

export function isGroup(e: NavEntry): e is { label: MessageKey; icon: keyof typeof Icon; children: NavLeaf[] } {
  return 'children' in e
}

// Desktop / tablet sidebar structure (mirrors design-shell.js). Labels are i18n keys.
export const NAV: NavEntry[] = [
  { to: '/', label: 'nav.home', icon: 'home' },
  { to: '/sell', label: 'nav.sell', icon: 'sell', badge: 'nav.active' },
  {
    label: 'nav.products',
    icon: 'products',
    children: [
      { to: '/products', label: 'nav.allProducts', icon: 'products' },
      { to: '/products/categories', label: 'nav.categories', icon: 'tag' },
      { to: '/products/brands', label: 'nav.brands', icon: 'tag' },
      { to: '/products/attributes', label: 'nav.attributes', icon: 'ruler' },
      { to: '/products/units', label: 'nav.units', icon: 'ruler' },
    ],
  },
  { to: '/inventory', label: 'nav.inventory', icon: 'inventory' },
  {
    label: 'nav.purchasing',
    icon: 'cart',
    children: [
      { to: '/purchasing/rfqs', label: 'nav.rfqs', icon: 'quote' },
      { to: '/purchasing/orders', label: 'nav.purchaseOrders', icon: 'cart' },
    ],
  },
  { to: '/sales', label: 'nav.sales', icon: 'sales' },
  {
    label: 'nav.online',
    icon: 'store',
    children: [
      { to: '/online/orders', label: 'nav.onlineOrders', icon: 'sell' },
      { to: '/online/store', label: 'nav.onlineStore', icon: 'settings' },
    ],
  },
  { to: '/contacts', label: 'nav.contacts', icon: 'contacts' },
  { to: '/expenses', label: 'nav.expenses', icon: 'expenses' },
  { to: '/deposits', label: 'nav.deposits', icon: 'deposits' },
  { to: '/reports', label: 'nav.reports', icon: 'reports' },
  {
    label: 'nav.settings',
    icon: 'settings',
    children: [
      { to: '/settings', label: 'nav.general', icon: 'settings' },
      { to: '/settings/appearance', label: 'nav.appearance', icon: 'settings' },
      { to: '/settings/subscription', label: 'nav.subscription', icon: 'card' },
      { to: '/settings/team', label: 'nav.team', icon: 'contacts' },
      { to: '/settings/roles', label: 'nav.roles', icon: 'settings' },
    ],
  },
]

// Mobile bottom tab bar (5 slots, Sell centered).
export const TABS: Array<NavLeaf & { center?: boolean }> = [
  { to: '/', label: 'nav.home', icon: 'home' },
  { to: '/products', label: 'nav.products', icon: 'products' },
  { to: '/sell', label: 'nav.sell', icon: 'sell', center: true },
  { to: '/reports', label: 'nav.reports', icon: 'reports' },
  { to: '/more', label: 'nav.more', icon: 'more' },
]
