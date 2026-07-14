'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError, useAdminApi } from '@/lib/api'
import type { SubscriptionRow } from '@/lib/types'

const PLANS = ['FREE', 'SOLO', 'BUSINESS', 'PRO']
const STATUSES = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'SUSPENDED']

interface Props {
  sub: SubscriptionRow
  onClose: () => void
  onSaved: () => void
}

export function SubscriptionEditModal({ sub, onClose, onSaved }: Props) {
  const api = useAdminApi()
  const [plan, setPlan] = useState(sub.plan)
  const [subscriptionStatus, setSubscriptionStatus] = useState(sub.subscriptionStatus)
  const [trialEndsAt, setTrialEndsAt] = useState(
    sub.trialEndsAt ? sub.trialEndsAt.slice(0, 10) : '',
  )
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (reason.trim().length < 3) return toast.error('A reason (min 3 chars) is required.')
    setBusy(true)
    try {
      const body: Record<string, unknown> = { reason: reason.trim() }
      if (plan !== sub.plan) body.plan = plan
      if (subscriptionStatus !== sub.subscriptionStatus)
        body.subscriptionStatus = subscriptionStatus
      if (trialEndsAt) body.trialEndsAt = new Date(trialEndsAt).toISOString()
      await api.patch(`/admin/subscriptions/${sub.businessId}`, body)
      toast.success('Subscription updated.')
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to update subscription.')
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
        className="w-full max-w-md rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold">{sub.name}</h2>
          <p className="text-xs text-neutral-500">Adjust subscription</p>
        </div>
        <div className="space-y-4 px-6 py-5 text-sm">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-neutral-700">Plan</span>
            <select
              className="rounded-lg border border-neutral-300 px-3 py-2"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            >
              {PLANS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-neutral-700">Status</span>
            <select
              className="rounded-lg border border-neutral-300 px-3 py-2"
              value={subscriptionStatus}
              onChange={(e) => setSubscriptionStatus(e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-neutral-700">Trial ends</span>
            <input
              type="date"
              className="rounded-lg border border-neutral-300 px-3 py-2"
              value={trialEndsAt}
              onChange={(e) => setTrialEndsAt(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-neutral-700">Reason</span>
            <input
              className="rounded-lg border border-neutral-300 px-3 py-2"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="required"
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
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
