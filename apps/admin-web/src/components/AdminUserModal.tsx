'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError, useAdminApi } from '@/lib/api'
import type { AdminRoleDetail, AdminUserSummary } from '@/lib/types'

interface Props {
  roles: AdminRoleDetail[]
  user?: AdminUserSummary | null // present = edit mode
  onClose: () => void
  onSaved: () => void
}

const PASSWORD_HINT = 'Min 12 chars, with upper, lower, digit, and a special character.'

export function AdminUserModal({ roles, user, onClose, onSaved }: Props) {
  const api = useAdminApi()
  const isEdit = !!user
  const assignableRoles = roles.filter((r) => r.name !== 'SUPER_ADMIN')

  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [roleId, setRoleId] = useState(user?.role?.id ?? assignableRoles[0]?.id ?? '')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!name.trim() || !email.trim() || !roleId) return toast.error('Name, email, and role are required.')
    if (!isEdit && password.length < 12) return toast.error(PASSWORD_HINT)

    setSaving(true)
    try {
      if (isEdit) {
        await api.patch(`/admin/users/${user!.id}`, { name: name.trim(), email: email.trim(), adminRoleId: roleId })
        toast.success('Admin updated.')
      } else {
        await api.post('/admin/users', { name: name.trim(), email: email.trim(), password, adminRoleId: roleId })
        toast.success('Admin created.')
      }
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to save admin.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold">{isEdit ? 'Edit admin' : 'New admin'}</h2>
        </div>
        <div className="space-y-4 px-6 py-5">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-neutral-700">Name</span>
            <input className="rounded-lg border border-neutral-300 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-neutral-700">Email</span>
            <input
              type="email"
              className="rounded-lg border border-neutral-300 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {!isEdit && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-neutral-700">Temporary password</span>
              <input
                type="text"
                className="rounded-lg border border-neutral-300 px-3 py-2 font-mono"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span className="text-xs text-neutral-500">{PASSWORD_HINT} They must change it on first login.</span>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-neutral-700">Role</span>
            <select className="rounded-lg border border-neutral-300 px-3 py-2" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {assignableRoles.length === 0 && <option value="">No roles available</option>}
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t border-neutral-200 px-6 py-4">
          <button
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-900"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={submit}
            disabled={saving}
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create admin'}
          </button>
        </div>
      </div>
    </div>
  )
}
