'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, useAdminApi } from '@/lib/api'
import { useAdmin } from '@/lib/use-admin'
import type { Paginated, SubscriptionRow } from '@/lib/types'
import { SubscriptionEditModal } from '@/components/SubscriptionEditModal'

export default function SubscriptionsPage() {
  const api = useAdminApi()
  const { can, status } = useAdmin()
  const canEdit = can('subscriptions:edit')

  const [rows, setRows] = useState<SubscriptionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [trialsOnly, setTrialsOnly] = useState(false)
  const [editing, setEditing] = useState<SubscriptionRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (trialsOnly) {
        setRows(await api.get<SubscriptionRow[]>('/admin/subscriptions/trials'))
      } else {
        const res = await api.get<Paginated<SubscriptionRow>>('/admin/subscriptions?limit=50')
        setRows(res.data)
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to load subscriptions.')
    } finally {
      setLoading(false)
    }
  }, [api, trialsOnly])

  useEffect(() => {
    if (status === 'authenticated') void load()
  }, [status, load])

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-neutral-500">Platform</p>
          <h1 className="text-3xl font-semibold">Subscriptions</h1>
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={trialsOnly}
            onChange={(e) => setTrialsOnly(e.target.checked)}
          />
          Trials only
        </label>
      </header>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Trial ends</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    None.
                  </td>
                </tr>
              )}
              {rows.map((s) => (
                <tr key={s.businessId} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    {s.plan} · {s.billingCycle}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.subscriptionStatus === 'ACTIVE' ? 'bg-green-50 text-green-700' : s.subscriptionStatus === 'SUSPENDED' || s.subscriptionStatus === 'CANCELLED' ? 'bg-red-50 text-red-700' : 'bg-neutral-100 text-neutral-600'}`}
                    >
                      {s.subscriptionStatus}
                    </span>
                  </td>
                  <td
                    className={`px-4 py-3 text-neutral-600 ${s.endingWithin7Days ? 'font-semibold text-amber-700' : ''}`}
                  >
                    {s.trialEndsAt ? new Date(s.trialEndsAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canEdit && (
                      <button
                        className="rounded-md border px-3 py-1 text-xs font-medium hover:border-neutral-900"
                        onClick={() => setEditing(s)}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <SubscriptionEditModal sub={editing} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </div>
  )
}
