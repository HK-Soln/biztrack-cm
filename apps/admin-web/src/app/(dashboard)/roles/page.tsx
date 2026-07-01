'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, useAdminApi } from '@/lib/api'
import { useAdmin } from '@/lib/use-admin'
import type { AdminRoleDetail, PermissionCatalogEntry } from '@/lib/types'
import { RoleEditorModal } from '@/components/RoleEditorModal'

export default function RolesPage() {
  const api = useAdminApi()
  const { can, status } = useAdmin()
  const canManage = can('admin_roles:manage')

  const [roles, setRoles] = useState<AdminRoleDetail[]>([])
  const [catalog, setCatalog] = useState<PermissionCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AdminRoleDetail | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, c] = await Promise.all([
        api.get<AdminRoleDetail[]>('/admin/roles'),
        api.get<{ permissions: PermissionCatalogEntry[] }>('/admin/roles/permissions'),
      ])
      setRoles(r)
      setCatalog(c.permissions)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to load roles.')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    if (status === 'authenticated') void load()
  }, [status, load])

  async function remove(role: AdminRoleDetail) {
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return
    try {
      await api.del(`/admin/roles/${role.id}`)
      toast.success('Role deleted.')
      void load()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ROLE_HAS_MEMBERS') {
        const members = (e.details as { members?: { email: string }[] })?.members ?? []
        toast.error(`Reassign its ${members.length} member(s) first: ${members.map((m) => m.email).join(', ')}`)
      } else {
        toast.error(e instanceof ApiError ? e.message : 'Failed to delete role.')
      }
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-neutral-500">Access control</p>
          <h1 className="text-3xl font-semibold">Roles</h1>
        </div>
        {canManage && (
          <button
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => setCreating(true)}
          >
            New role
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
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Permissions</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {roles.map((role) => (
                <tr key={role.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{role.name}</span>
                      {role.isSystemRole && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          system
                        </span>
                      )}
                    </div>
                    {role.description && <p className="text-xs text-neutral-500">{role.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {role.name === 'SUPER_ADMIN' ? 'all (via flag)' : role.permissions.length}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{role.memberCount}</td>
                  <td className="px-4 py-3 text-right">
                    {canManage && (
                      <div className="flex justify-end gap-2">
                        <button
                          className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium hover:border-neutral-900"
                          onClick={() => setEditing(role)}
                        >
                          Edit
                        </button>
                        {!role.isSystemRole && (
                          <button
                            className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:border-red-500"
                            onClick={() => remove(role)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <RoleEditorModal
          catalog={catalog}
          role={editing}
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
