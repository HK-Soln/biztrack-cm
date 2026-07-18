'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, useAdminApi } from '@/lib/api'
import type { ClientUserDetail } from '@/lib/types'

interface Props {
  userId: string
  canSuspend: boolean
  canResendOtp: boolean
  onClose: () => void
  onChanged: () => void
}

export function ClientUserDetailModal({
  userId,
  canSuspend,
  canResendOtp,
  onClose,
  onChanged,
}: Props) {
  const api = useAdminApi()
  const [u, setU] = useState<ClientUserDetail | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setU(await api.get<ClientUserDetail>(`/admin/users/clients/${userId}`))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to load user.')
    }
  }, [api, userId])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleStatus() {
    if (!u) return
    const next = u.isActive ? 'SUSPENDED' : 'ACTIVE'
    const why = window.prompt(`Reason for setting this user to ${next}:`)
    if (!why || why.trim().length < 3) return toast.error('A reason (min 3 chars) is required.')
    setBusy(true)
    try {
      await api.patch(`/admin/users/clients/${userId}/status`, { status: next, reason: why.trim() })
      toast.success(`User ${next === 'SUSPENDED' ? 'suspended' : 'activated'}.`)
      await load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to update status.')
    } finally {
      setBusy(false)
    }
  }

  async function resendOtp() {
    setBusy(true)
    try {
      const res = await api.post<{ deliveryWired: boolean; attemptsThisHour: number }>(
        `/admin/users/clients/${userId}/resend-otp`,
        {},
      )
      toast.success(
        res.deliveryWired
          ? 'OTP resent.'
          : `OTP queued (attempt ${res.attemptsThisHour}/3). Note: SMS delivery not yet wired.`,
      )
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to resend OTP.')
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
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">{u?.name ?? 'User'}</h2>
            {u && (
              <p className="text-xs text-neutral-500">
                {u.phone} ·{' '}
                <span className={u.isActive ? 'text-green-700' : 'text-red-600'}>
                  {u.isActive ? 'Active' : 'Suspended'}
                </span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {u && canResendOtp && (
              <button
                className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
                onClick={resendOtp}
                disabled={busy}
              >
                Resend OTP
              </button>
            )}
            {u && canSuspend && (
              <button
                className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                onClick={toggleStatus}
                disabled={busy}
              >
                {u.isActive ? 'Suspend' : 'Activate'}
              </button>
            )}
          </div>
        </div>
        {!u ? (
          <p className="p-6 text-sm text-neutral-500">Loading…</p>
        ) : (
          <div className="space-y-4 px-6 py-5 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email" value={u.email ?? '—'} />
              <Field label="Status" value={u.status} />
              <Field label="Phone verified" value={u.isPhoneVerified ? 'Yes' : 'No'} />
              <Field label="Email verified" value={u.isEmailVerified ? 'Yes' : 'No'} />
              <Field label="Onboarding" value={u.onboardingStep} />
              <Field label="Language" value={u.language} />
            </div>
            <div>
              <p className="mb-2 font-medium text-neutral-700">
                Business memberships ({u.memberships.length})
              </p>
              {u.memberships.length === 0 && <p className="text-xs text-neutral-500">None.</p>}
              {u.memberships.map((m) => (
                <div key={m.businessId} className="text-xs text-neutral-600">
                  {m.businessName ?? m.businessId} · {m.role} · {m.status}
                </div>
              ))}
            </div>
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
