'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import type { ReactNode } from 'react'
import { useAdmin } from '@/lib/use-admin'

interface NavItem {
  href: string
  label: string
  permission?: string // visible only if the admin holds it (super admin sees all)
}

const NAV: NavItem[] = [
  { href: '/overview', label: 'Overview' },
  { href: '/roles', label: 'Roles', permission: 'admin_roles:view' },
  { href: '/team', label: 'Team', permission: 'admin_users:view' },
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { admin, can } = useAdmin()

  const items = NAV.filter((i) => !i.permission || can(i.permission))

  return (
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
      <aside className="flex w-60 flex-col border-r border-neutral-200 bg-white">
        <div className="px-6 py-5">
          <p className="text-xs uppercase tracking-[0.24em] text-neutral-400">BizTrack</p>
          <p className="text-lg font-semibold">Admin</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-neutral-200 p-4">
          {admin && (
            <div className="mb-3">
              <p className="truncate text-sm font-medium text-neutral-900">{admin.name}</p>
              <p className="truncate text-xs text-neutral-500">{admin.email}</p>
              <span className="mt-1 inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                {admin.role?.name ?? (admin.isSuperAdmin ? 'SUPER_ADMIN' : 'NO ROLE')}
              </span>
            </div>
          )}
          <button
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-900"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden px-8 py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}
