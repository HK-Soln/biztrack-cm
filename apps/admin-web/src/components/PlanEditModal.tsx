'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, useAdminApi } from '@/lib/api'
import type { PlanConfigItem } from '@/lib/types'

interface Props {
  plan: PlanConfigItem
  onClose: () => void
  onSaved: () => void
}

export function PlanEditModal({ plan, onClose, onSaved }: Props) {
  const api = useAdminApi()
  const [text, setText] = useState(plan.resources.join('\n'))
  const [reason, setReason] = useState('')
  const [blast, setBlast] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .get<{ total: number }>(`/admin/plans/${plan.plan}/businesses`)
      .then((r) => setBlast(r.total))
      .catch(() => setBlast(null))
  }, [api, plan.plan])

  async function submit() {
    const resources = text
      .split('\n')
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean)
    if (resources.length === 0) return toast.error('At least one resource is required.')
    if (reason.trim().length < 3) return toast.error('A reason (min 3 chars) is required.')
    setBusy(true)
    try {
      const res = await api.patch<{ cacheInvalidatedFor: number }>(`/admin/plans/${plan.plan}`, {
        resources,
        reason: reason.trim(),
      })
      toast.success(
        `Plan ${plan.plan} updated. Cache cleared for ${res.cacheInvalidatedFor} business(es).`,
      )
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to update plan.')
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
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold">Edit {plan.displayName} plan</h2>
          <p className="text-xs text-neutral-500">
            High-impact — applies to{' '}
            <span className="font-medium text-amber-700">{blast ?? '…'} business(es)</span> on this
            plan.
          </p>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-sm">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-neutral-700">Resources (one per line)</span>
            <textarea
              className="h-64 rounded-lg border border-neutral-300 px-3 py-2 font-mono text-xs"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-neutral-700">Reason</span>
            <input
              className="rounded-lg border border-neutral-300 px-3 py-2"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="required — explains the change"
            />
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t border-neutral-200 px-6 py-4">
          <button
            className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={submit}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save plan'}
          </button>
        </div>
      </div>
    </div>
  )
}
