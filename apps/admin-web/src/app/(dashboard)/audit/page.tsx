'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, useAdminApi } from '@/lib/api'
import { useAdmin } from '@/lib/use-admin'
import type { AuditLogRow, Paginated } from '@/lib/types'

export default function AuditPage() {
  const api = useAdminApi()
  const { status } = useAdmin()

  const [result, setResult] = useState<Paginated<AuditLogRow> | null>(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '30' })
      if (action) params.set('action', action)
      if (entityType) params.set('entityType', entityType)
      setResult(await api.get<Paginated<AuditLogRow>>(`/admin/audit-logs?${params.toString()}`))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to load audit log.')
    } finally {
      setLoading(false)
    }
  }, [api, page, action, entityType])

  useEffect(() => {
    if (status === 'authenticated') void load()
  }, [status, load])

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.24em] text-neutral-500">Compliance</p>
        <h1 className="text-3xl font-semibold">Audit log</h1>
        <p className="mt-1 text-sm text-neutral-500">Immutable record of every admin mutation.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <input
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Filter action…"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load())}
        />
        <input
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Filter entity type…"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load())}
        />
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Actor role</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {result?.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    No entries.
                  </td>
                </tr>
              )}
              {result?.data.map((a) => (
                <tr key={a.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-neutral-500">{new Date(a.at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-neutral-600">{a.adminRoleName}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs">{a.action}</span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {a.entityType}
                    {a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ''}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-400">{a.ipAddress}</td>
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
    </div>
  )
}
