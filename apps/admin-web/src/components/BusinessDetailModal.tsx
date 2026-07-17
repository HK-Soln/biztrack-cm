'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, useAdminApi } from '@/lib/api'
import type { BusinessDetail } from '@/lib/types'

interface Props {
  businessId: string
  canSuspend: boolean
  canOverride: boolean
  onClose: () => void
  onChanged: () => void
}

export function BusinessDetailModal({
  businessId,
  canSuspend,
  canOverride,
  onClose,
  onChanged,
}: Props) {
  const api = useAdminApi()
  const [b, setB] = useState<BusinessDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [resource, setResource] = useState('')
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    try {
      setB(await api.get<BusinessDetail>(`/admin/businesses/${businessId}`))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to load business.')
    }
  }, [api, businessId])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleStatus() {
    if (!b) return
    const next = b.subscriptionStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'
    const why = window.prompt(`Reason for setting status to ${next}:`)
    if (!why || why.trim().length < 3) return toast.error('A reason (min 3 chars) is required.')
    setBusy(true)
    try {
      await api.patch(`/admin/businesses/${businessId}/status`, {
        status: next,
        reason: why.trim(),
      })
      toast.success(`Business ${next === 'SUSPENDED' ? 'suspended' : 'activated'}.`)
      await load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to update status.')
    } finally {
      setBusy(false)
    }
  }

  async function grant() {
    if (!resource.trim() || reason.trim().length < 3) {
      return toast.error('Resource and a reason (min 3 chars) are required.')
    }
    setBusy(true)
    try {
      await api.post(`/admin/businesses/${businessId}/override`, {
        resource: resource.trim(),
        reason: reason.trim(),
      })
      toast.success('Override granted.')
      setResource('')
      setReason('')
      await load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to grant override.')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(overrideId: string) {
    setBusy(true)
    try {
      await api.del(`/admin/businesses/${businessId}/override/${overrideId}`)
      toast.success('Override revoked.')
      await load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to revoke override.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">{b?.name ?? 'Business'}</h2>
            {b && (
              <p className="text-xs text-neutral-500">
                {b.plan} · {b.city ?? '—'} ·{' '}
                <span
                  className={
                    b.subscriptionStatus === 'SUSPENDED' ? 'text-red-600' : 'text-green-700'
                  }
                >
                  {b.subscriptionStatus}
                </span>
              </p>
            )}
          </div>
          {b && canSuspend && (
            <button
              className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              onClick={toggleStatus}
              disabled={busy}
            >
              {b.subscriptionStatus === 'SUSPENDED' ? 'Activate' : 'Suspend'}
            </button>
          )}
        </div>

        {!b ? (
          <p className="p-6 text-sm text-neutral-500">Loading…</p>
        ) : (
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 text-sm">
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Owner" value={b.owner ? `${b.owner.name}` : '—'} />
              <Field label="Owner phone" value={b.owner?.phone ?? '—'} />
              <Field label="Members" value={String(b.memberCount)} />
              <Field label="Billing" value={b.billingCycle} />
              <Field
                label="Trial ends"
                value={b.trialEndsAt ? new Date(b.trialEndsAt).toLocaleDateString() : '—'}
              />
              <Field label="Type" value={b.type} />
            </section>

            <section>
              <p className="mb-2 font-medium text-neutral-700">Overrides ({b.overrides.length})</p>
              <div className="space-y-1">
                {b.overrides.length === 0 && (
                  <p className="text-xs text-neutral-500">No overrides.</p>
                )}
                {b.overrides.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-1.5"
                  >
                    <span className="font-mono text-xs">
                      {o.resource} {o.granted ? '' : '(revoked)'}{' '}
                      <span className="text-neutral-400">· {o.reason}</span>
                    </span>
                    {canOverride && (
                      <button
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        onClick={() => revoke(o.id)}
                        disabled={busy}
                      >
                        remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {canOverride && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    className="w-48 rounded-md border border-neutral-300 px-2 py-1 font-mono text-xs"
                    placeholder="RESOURCE (e.g. SCANNER_CAMERA)"
                    value={resource}
                    onChange={(e) => setResource(e.target.value.toUpperCase())}
                  />
                  <input
                    className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs"
                    placeholder="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <button
                    className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    onClick={grant}
                    disabled={busy}
                  >
                    Grant
                  </button>
                </div>
              )}
            </section>

            <section>
              <p className="mb-2 font-medium text-neutral-700">Members</p>
              {b.members.map((m) => (
                <div key={m.userId} className="text-xs text-neutral-600">
                  {m.name ?? m.userId} · {m.role} · {m.status}
                </div>
              ))}
            </section>

            <section>
              <p className="mb-2 font-medium text-neutral-700">Recent sync</p>
              {b.recentSync.length === 0 && (
                <p className="text-xs text-neutral-500">No sync activity.</p>
              )}
              {b.recentSync.map((s, i) => (
                <div key={i} className="text-xs text-neutral-600">
                  {s.deviceId} · {s.status} · failed {s.failedCount} · conflicts {s.conflictCount}
                  {s.lastError ? ` · ${s.lastError}` : ''}
                </div>
              ))}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="text-neutral-800">{value}</p>
    </div>
  )
}
