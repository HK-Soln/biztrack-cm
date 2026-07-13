'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, useAdminApi } from '@/lib/api'
import { useAdmin } from '@/lib/use-admin'
import type { BusinessSummary, Paginated } from '@/lib/types'
import { BusinessDetailModal } from '@/components/BusinessDetailModal'

const STATUSES = ['', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'SUSPENDED']
const PLANS = ['', 'FREE', 'SOLO', 'BUSINESS', 'PRO']

export default function BusinessesPage() {
  const api = useAdminApi()
  const { can, status } = useAdmin()

  const [result, setResult] = useState<Paginated<BusinessSummary> | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      if (planFilter) params.set('plan', planFilter)
      setResult(await api.get<Paginated<BusinessSummary>>(`/admin/businesses?${params.toString()}`))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to load businesses.')
    } finally {
      setLoading(false)
    }
  }, [api, page, search, statusFilter, planFilter])

  useEffect(() => {
    if (status === 'authenticated') void load()
  }, [status, load])

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.24em] text-neutral-500">Operations</p>
        <h1 className="text-3xl font-semibold">Businesses</h1>
      </header>

      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-56 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Search name, owner phone/email…"
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
        <select
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          value={planFilter}
          onChange={(e) => {
            setPlanFilter(e.target.value)
            setPage(1)
          }}
        >
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {p || 'All plans'}
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
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Members</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {result?.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    No businesses found.
                  </td>
                </tr>
              )}
              {result?.data.map((b) => (
                <tr
                  key={b.id}
                  className="cursor-pointer hover:bg-neutral-50"
                  onClick={() => setSelected(b.id)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{b.name}</p>
                    <p className="text-xs text-neutral-500">
                      {b.city ?? '—'} · {b.type}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    <p>{b.ownerName ?? '—'}</p>
                    <p className="text-xs text-neutral-400">{b.ownerPhone ?? ''}</p>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{b.plan}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.subscriptionStatus === 'SUSPENDED' ? 'bg-red-50 text-red-700' : b.subscriptionStatus === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-600'}`}
                    >
                      {b.subscriptionStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{b.memberCount}</td>
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
        <BusinessDetailModal
          businessId={selected}
          canSuspend={can('businesses:suspend')}
          canOverride={can('businesses:override_permissions')}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  )
}
