'use client'

import { signOut, useSession } from 'next-auth/react'

export default function OverviewPage() {
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-8">
        <p className="text-sm text-neutral-500">Loading…</p>
      </main>
    )
  }

  const admin = session?.admin

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-8 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.24em] text-neutral-500">Overview</p>
          <h1 className="text-3xl font-semibold text-neutral-900">Admin dashboard</h1>
          {admin && (
            <p className="text-sm text-neutral-600">
              Signed in as <span className="font-medium text-neutral-900">{admin.name}</span> ·{' '}
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                {admin.role?.name ?? (admin.isSuperAdmin ? 'SUPER_ADMIN' : 'NO ROLE')}
              </span>
            </p>
          )}
        </div>
        <button
          className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-900"
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          Sign out
        </button>
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
            Effective permissions ({admin.permissions.length})
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {admin.permissions.map((p) => (
              <span
                key={p}
                className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-mono text-neutral-700"
              >
                {p}
              </span>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
