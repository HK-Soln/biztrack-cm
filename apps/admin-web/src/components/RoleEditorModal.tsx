'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, useAdminApi } from '@/lib/api'
import type { AdminRoleDetail, PermissionCatalogEntry, RolePermissionEntry } from '@/lib/types'

interface PermState {
  checked: boolean
  city: string
  plan: string
}

interface Props {
  catalog: PermissionCatalogEntry[]
  role?: AdminRoleDetail | null // present = edit mode
  onClose: () => void
  onSaved: () => void
}

function initialState(catalog: PermissionCatalogEntry[], role?: AdminRoleDetail | null) {
  const byPerm = new Map<string, RolePermissionEntry>()
  role?.permissions.forEach((p) => byPerm.set(p.permission, p))
  const state: Record<string, PermState> = {}
  for (const entry of catalog) {
    const existing = byPerm.get(entry.permission)
    state[entry.permission] = {
      checked: !!existing,
      city: existing?.scope?.city ?? '',
      plan: existing?.scope?.plan ?? '',
    }
  }
  return state
}

export function RoleEditorModal({ catalog, role, onClose, onSaved }: Props) {
  const api = useAdminApi()
  const isEdit = !!role
  const isSystem = !!role?.isSystemRole

  // System roles' permissions can be edited, but super-admin-only perms are never assignable.
  const assignable = useMemo(() => catalog.filter((c) => !c.superAdminOnly), [catalog])
  const grouped = useMemo(() => {
    const map = new Map<string, PermissionCatalogEntry[]>()
    for (const e of assignable) {
      const list = map.get(e.module) ?? []
      list.push(e)
      map.set(e.module, list)
    }
    return [...map.entries()]
  }, [assignable])

  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [perms, setPerms] = useState<Record<string, PermState>>(() => initialState(assignable, role))
  const [saving, setSaving] = useState(false)

  const EMPTY: PermState = { checked: false, city: '', plan: '' }
  const toggle = (permission: string) =>
    setPerms((prev) => {
      const cur = prev[permission] ?? EMPTY
      return { ...prev, [permission]: { ...cur, checked: !cur.checked } }
    })
  const setScope = (permission: string, key: 'city' | 'plan', value: string) =>
    setPerms((prev) => {
      const cur = prev[permission] ?? EMPTY
      return { ...prev, [permission]: { ...cur, [key]: value } }
    })

  const selectedCount = Object.values(perms).filter((p) => p.checked).length

  async function submit() {
    const permissions = Object.entries(perms)
      .filter(([, s]) => s.checked)
      .map(([permission, s]) => {
        const scope: Record<string, string> = {}
        if (s.city.trim()) scope.city = s.city.trim()
        if (s.plan.trim()) scope.plan = s.plan.trim()
        return { permission, ...(Object.keys(scope).length ? { scope } : {}) }
      })

    if (!isEdit && !name.trim()) return toast.error('Name is required.')
    if (!isEdit && permissions.length === 0) return toast.error('Select at least one permission.')

    setSaving(true)
    try {
      if (isEdit) {
        const body: Record<string, unknown> = { description, permissions }
        if (!isSystem) body.name = name.trim()
        await api.patch(`/admin/roles/${role!.id}`, body)
        toast.success('Role updated.')
      } else {
        await api.post('/admin/roles', { name: name.trim(), description: description || undefined, permissions })
        toast.success('Role created.')
      }
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to save role.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold">{isEdit ? `Edit role` : 'New role'}</h2>
          {isSystem && (
            <p className="mt-1 text-xs text-neutral-500">
              System role — the name is locked, but you can adjust its permissions.
            </p>
          )}
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-neutral-700">Name</span>
              <input
                className="rounded-lg border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
                value={name}
                disabled={isSystem}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Customer Success Douala"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-neutral-700">Description</span>
              <input
                className="rounded-lg border border-neutral-300 px-3 py-2"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-neutral-700">
              Permissions <span className="text-neutral-400">({selectedCount} selected)</span>
            </p>
            <div className="space-y-4">
              {grouped.map(([module, entries]) => (
                <div key={module} className="rounded-xl border border-neutral-200">
                  <p className="border-b border-neutral-100 bg-neutral-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {module}
                  </p>
                  <div className="divide-y divide-neutral-100">
                    {entries.map((entry) => {
                      const s = perms[entry.permission] ?? EMPTY
                      return (
                        <div key={entry.permission} className="px-3 py-2">
                          <label className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={s.checked}
                              onChange={() => toggle(entry.permission)}
                            />
                            <span className="flex-1">
                              <span className="font-mono text-sm text-neutral-800">{entry.permission}</span>
                              <span className="block text-xs text-neutral-500">{entry.description}</span>
                            </span>
                          </label>
                          {s.checked && (
                            <div className="ml-7 mt-2 flex flex-wrap gap-2">
                              <input
                                className="w-32 rounded-md border border-neutral-200 px-2 py-1 text-xs"
                                placeholder="scope city"
                                value={s.city}
                                onChange={(e) => setScope(entry.permission, 'city', e.target.value)}
                              />
                              <input
                                className="w-32 rounded-md border border-neutral-200 px-2 py-1 text-xs"
                                placeholder="scope plan"
                                value={s.plan}
                                onChange={(e) => setScope(entry.permission, 'plan', e.target.value)}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
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
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create role'}
          </button>
        </div>
      </div>
    </div>
  )
}
