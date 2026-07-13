'use client'

import { useAdmin } from '@/lib/use-admin'

export default function OverviewPage() {
  const { admin, status } = useAdmin()

  if (status === 'loading') {
    return <p className="text-sm text-neutral-500">Loading…</p>
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.24em] text-neutral-500">Overview</p>
        <h1 className="text-3xl font-semibold text-neutral-900">Admin dashboard</h1>
      </header>

      {admin?.mustChangePassword && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          You are using a temporary password. Please change it from your account settings.
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        {['Total revenue', 'Active businesses', 'Open tickets'].map((label) => (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm" key={label}>
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="mt-4 text-2xl font-semibold text-neutral-900">—</p>
          </div>
        ))}
      </section>

      {admin && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-neutral-700">
            Your effective permissions ({admin.permissions.length})
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {admin.permissions.length === 0 && (
              <span className="text-sm text-neutral-500">
                {admin.isSuperAdmin ? 'SUPER_ADMIN — full access' : 'No permissions assigned.'}
              </span>
            )}
            {admin.permissions.map((p) => (
              <span key={p} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-mono text-neutral-700">
                {p}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
