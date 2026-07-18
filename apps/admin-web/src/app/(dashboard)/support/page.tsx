'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, useAdminApi } from '@/lib/api'
import { useAdmin } from '@/lib/use-admin'
import type { Paginated, SupportTicketItem, SyncErrorRow } from '@/lib/types'
import { TicketModal } from '@/components/TicketModal'

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-50 text-red-700',
  WARNING: 'bg-amber-50 text-amber-700',
  INFO: 'bg-neutral-100 text-neutral-600',
}

export default function SupportPage() {
  const api = useAdminApi()
  const { can, status } = useAdmin()

  const [tickets, setTickets] = useState<Paginated<SupportTicketItem> | null>(null)
  const [syncErrors, setSyncErrors] = useState<SyncErrorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<SupportTicketItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, s] = await Promise.all([
        api.get<Paginated<SupportTicketItem>>('/admin/support/tickets?limit=50'),
        can('sync_errors:view')
          ? api.get<SyncErrorRow[]>('/admin/support/sync-errors')
          : Promise.resolve([]),
      ])
      setTickets(t)
      setSyncErrors(s)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to load support data.')
    } finally {
      setLoading(false)
    }
  }, [api, can])

  useEffect(() => {
    if (status === 'authenticated') void load()
  }, [status, load])

  async function resolveSync(businessId: string) {
    try {
      await api.post(`/admin/support/sync-errors/${businessId}/resolve`, {})
      toast.success('Sync errors acknowledged. (Re-sync trigger is a follow-up.)')
      void load()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to resolve.')
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-neutral-500">Operations</p>
          <h1 className="text-3xl font-semibold">Support</h1>
        </div>
        {can('support:create_ticket') && (
          <button
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => setCreating(true)}
          >
            New ticket
          </button>
        )}
      </header>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Tickets
            </h2>
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {tickets?.data.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                        No tickets.
                      </td>
                    </tr>
                  )}
                  {tickets?.data.map((t) => (
                    <tr
                      key={t.id}
                      className="cursor-pointer hover:bg-neutral-50"
                      onClick={() => setEditing(t)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{t.title}</p>
                        <p className="max-w-md truncate text-xs text-neutral-500">
                          {t.description}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{t.category}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEV_COLOR[t.severity] ?? ''}`}
                        >
                          {t.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {can('sync_errors:view') && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Sync errors
              </h2>
              <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-4 py-3">Business</th>
                      <th className="px-4 py-3">Failed</th>
                      <th className="px-4 py-3">Conflicts</th>
                      <th className="px-4 py-3">Last sync</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {syncErrors.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                          No sync errors 🎉
                        </td>
                      </tr>
                    )}
                    {syncErrors.map((s) => (
                      <tr key={s.businessId} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 font-medium">{s.businessName ?? s.businessId}</td>
                        <td className="px-4 py-3 text-red-600">{s.failedCount}</td>
                        <td className="px-4 py-3 text-neutral-600">{s.conflictCount}</td>
                        <td className="px-4 py-3 text-neutral-500">
                          {new Date(s.lastSyncAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {can('sync_errors:resolve') && (
                            <button
                              className="rounded-md border px-3 py-1 text-xs font-medium hover:border-neutral-900"
                              onClick={() => resolveSync(s.businessId)}
                            >
                              Acknowledge
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {(creating || editing) && (
        <TicketModal
          ticket={editing}
          canResolve={can('support:resolve_ticket')}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={load}
        />
      )}
    </div>
  )
}
