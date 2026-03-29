'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { to: '/', label: 'Accueil' },
  { to: '/sell', label: 'Vendre' },
  { to: '/products', label: 'Produits' },
  { to: '/expenses', label: 'Depenses' },
  { to: '/reports', label: 'Rapports' },
  { to: '/settings', label: 'Parametres' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside style={{ width: 220, background: '#111827', color: '#fff', display: 'flex', flexDirection: 'column', padding: '1rem 0' }}>
      <div style={{ padding: '0 1rem 1.5rem', borderBottom: '1px solid #374151' }}>
        <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#16a34a' }}>BizTrack CM</span>
      </div>
      <nav style={{ flex: 1, marginTop: '1rem' }}>
        {navItems.map(({ to, label }) => (
          <Link
            key={to}
            href={to}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.65rem 1rem', color: pathname === to ? '#16a34a' : '#d1d5db',
              background: pathname === to ? '#1f2937' : 'transparent',
              textDecoration: 'none', fontSize: '0.9rem',
            }}
          >
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  )
}
