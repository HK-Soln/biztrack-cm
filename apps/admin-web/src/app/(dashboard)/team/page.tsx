'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, useAdminApi } from '@/lib/api'
import { useAdmin } from '@/lib/use-admin'
import type { AdminRoleDetail, AdminUserSummary } from '@/lib/types'
import { AdminUserModal } from '@/components/AdminUserModal'

export default function TeamPage() {
  const api = useAdminApi()
  const { admin, can, status } = useAdmin()
  const canManage = can('admin_users:manage')

  const [users, setUsers] = useState<AdminUserSummary[]>([])
  const [roles, setRoles] = useState<AdminRoleDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AdminUserSummary | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const users = await api.get<AdminUserSummary[]>('/admin/users')
      setUsers(users)
      // Roles populate the assignment dropdown; only needed/visible to managers.
      if (canManage) {
        const roles = await api.get<AdminRoleDetail[]>('/admin/roles').catch(() => [])
        setRoles(roles)
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to load team.')
    } finally {
      setLoading(false)
    }
  }, [api, canManage])

  useEffect(() => {
    if (status === 'authenticated') void load()
  }, [status, load])

  async function deactivate(user: AdminUserSummary) {
    if (!confirm(`Deactivate ${user.email}? They will be signed out and unable to log in.`)) return
    try {
      await api.patch(`/admin/users/${user.id}/deactivate`, {})
      toast.success('Admin deactivated.')
      void load()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to deactivate.')
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-neutral-500">Access control</p>
          <h1 className="text-3xl font-semibold">Team</h1>
        </div>
        {canManage && (
          <button
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => setCreating(true)}
          >
            New admin
          </button>
        )}
      </header>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {users.map((u) => {
                const isSelf = admin?.id === u.id
                return (
                  <tr key={u.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {u.name} {isSelf && <span className="text-xs text-neutral-400">(you)</span>}
                      </p>
                      <p className="text-xs text-neutral-500">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                        {u.role?.name ?? (u.isSuperAdmin ? 'SUPER_ADMIN' : '—')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.isActive ? (
                        <span className="text-xs font-medium text-green-700">Active</span>
                      ) : (
                        <span className="text-xs font-medium text-neutral-400">Deactivated</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && (
                        <div className="flex justify-end gap-2">
                          <button
                            className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium hover:border-neutral-900 disabled:opacity-40"
                            onClick={() => setEditing(u)}
                            disabled={u.isSuperAdmin}
                            title={u.isSuperAdmin ? 'SUPER_ADMIN accounts are managed via migration' : undefined}
                          >
                            Edit
                          </button>
                          {u.isActive && (
                            <button
                              className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:border-red-500 disabled:opacity-40"
                              onClick={() => deactivate(u)}
                              disabled={isSelf || u.isSuperAdmin}
                              title={isSelf ? 'You cannot deactivate yourself' : undefined}
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <AdminUserModal
          roles={roles}
          user={editing}
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
