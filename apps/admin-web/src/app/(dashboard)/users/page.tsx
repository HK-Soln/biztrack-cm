'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, useAdminApi } from '@/lib/api'
import { useAdmin } from '@/lib/use-admin'
import type { ClientUserSummary, Paginated } from '@/lib/types'
import { ClientUserDetailModal } from '@/components/ClientUserDetailModal'

const STATUSES = ['', 'PENDING', 'PHONE_VERIFIED', 'ACTIVE']

export default function UsersPage() {
  const api = useAdminApi()
  const { can, status } = useAdmin()

  const [result, setResult] = useState<Paginated<ClientUserSummary> | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      setResult(
        await api.get<Paginated<ClientUserSummary>>(`/admin/users/clients?${params.toString()}`),
      )
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to load users.')
    } finally {
      setLoading(false)
    }
  }, [api, page, search, statusFilter])

  useEffect(() => {
    if (status === 'authenticated') void load()
  }, [status, load])

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.24em] text-neutral-500">Operations</p>
        <h1 className="text-3xl font-semibold">Client users</h1>
      </header>

      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-56 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Search name, phone, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load())}
        />
        <select
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || 'All statuses'}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {result?.data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                    No users found.
                  </td>
                </tr>
              )}
              {result?.data.map((u) => (
                <tr
                  key={u.id}
                  className="cursor-pointer hover:bg-neutral-50"
                  onClick={() => setSelected(u.id)}
                >
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    <p>{u.phone}</p>
                    <p className="text-xs text-neutral-400">{u.email ?? ''}</p>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{u.status}</td>
                  <td className="px-4 py-3">
                    {u.isActive ? (
                      <span className="text-xs font-medium text-green-700">Active</span>
                    ) : (
                      <span className="text-xs font-medium text-red-600">Suspended</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && result.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-neutral-600">
          <span>
            Page {result.page} of {result.totalPages} · {result.total} total
          </span>
          <div className="flex gap-2">
            <button
              className="rounded-md border px-3 py-1 disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </button>
            <button
              className="rounded-md border px-3 py-1 disabled:opacity-40"
              disabled={page >= result.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selected && (
        <ClientUserDetailModal
          userId={selected}
          canSuspend={can('users:suspend')}
          canResendOtp={can('users:resend_otp')}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  )
}
