'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AttributeDisplayType } from '@biztrack/types'
import type { AttributeGroup } from '@biztrack/types'
import { Button, Input } from '@biztrack/ui'
import { Loader2, Plus, Tag, Trash2, X } from 'lucide-react'
import {
  addAttributeOption,
  createAttributeGroup,
  deleteAttributeGroup,
  deleteAttributeOption,
  listAttributeGroups,
} from '@/services/attributes.api'
import { getApiErrorMessage } from '@/services/api-response'

const DISPLAY_TYPES = [
  AttributeDisplayType.CHIPS,
  AttributeDisplayType.SWATCHES,
  AttributeDisplayType.DROPDOWN,
]

export default function ProductAttributesPage() {
  const [groups, setGroups] = useState<AttributeGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // create-group form
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<AttributeDisplayType>(AttributeDisplayType.CHIPS)

  // per-group add-option drafts: { [groupId]: { value, colorHex } }
  const [optionDrafts, setOptionDrafts] = useState<Record<string, { value: string; colorHex: string }>>(
    {},
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setGroups(await listAttributeGroups())
    } catch (err) {
      setError(getApiErrorMessage(err, 'Something went wrong. Please try again.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreateGroup = async () => {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    setError(null)
    try {
      await createAttributeGroup({ name, displayType: newType })
      setNewName('')
      setNewType(AttributeDisplayType.CHIPS)
      await load()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Something went wrong. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteGroup = async (id: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteAttributeGroup(id)
      await load()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Something went wrong. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const handleAddOption = async (group: AttributeGroup) => {
    const draft = optionDrafts[group.id]
    const value = draft?.value?.trim()
    if (!value || busy) return
    setBusy(true)
    setError(null)
    try {
      await addAttributeOption(group.id, {
        value,
        colorHex:
          group.displayType === AttributeDisplayType.SWATCHES && draft?.colorHex
            ? draft.colorHex
            : undefined,
      })
      setOptionDrafts((prev) => ({ ...prev, [group.id]: { value: '', colorHex: '' } }))
      await load()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Something went wrong. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteOption = async (groupId: string, optionId: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteAttributeOption(groupId, optionId)
      await load()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Something went wrong. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [groups],
  )

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Tag className="h-5 w-5" /> Product attributes
        </h1>
        <p className="text-sm text-muted-foreground">
          Reusable attribute groups (Color, Size, Storage…) used to generate product variants.
          Changes require an internet connection.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* Create group */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Group name</label>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Color"
            maxLength={100}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Display</label>
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as AttributeDisplayType)}
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {DISPLAY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={handleCreateGroup} disabled={busy || !newName.trim()}>
          <Plus className="mr-1 h-4 w-4" /> Add group
        </Button>
      </div>

      {/* Groups list */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : sortedGroups.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No attribute groups yet.</p>
      ) : (
        <div className="space-y-3">
          {sortedGroups.map((group) => {
            const draft = optionDrafts[group.id] ?? { value: '', colorHex: '' }
            const isSwatches = group.displayType === AttributeDisplayType.SWATCHES
            return (
              <div key={group.id} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{group.name}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {group.displayType}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteGroup(group.id)}
                    disabled={busy}
                    className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                    title="Delete group"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mb-3 flex flex-wrap gap-2">
                  {(group.options ?? []).length === 0 ? (
                    <span className="text-xs text-muted-foreground">No options</span>
                  ) : (
                    (group.options ?? []).map((option) => (
                      <span
                        key={option.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-sm text-foreground"
                      >
                        {isSwatches && option.colorHex ? (
                          <span
                            className="h-3 w-3 rounded-full border border-border"
                            style={{ backgroundColor: option.colorHex }}
                          />
                        ) : null}
                        {option.value}
                        <button
                          type="button"
                          onClick={() => handleDeleteOption(group.id, option.id)}
                          disabled={busy}
                          className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                          title="Remove option"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={draft.value}
                    onChange={(e) =>
                      setOptionDrafts((prev) => ({
                        ...prev,
                        [group.id]: { ...draft, value: e.target.value },
                      }))
                    }
                    placeholder="Add an option…"
                    maxLength={100}
                    className="h-9 max-w-xs"
                  />
                  {isSwatches ? (
                    <input
                      type="color"
                      value={draft.colorHex || '#1a1a1a'}
                      onChange={(e) =>
                        setOptionDrafts((prev) => ({
                          ...prev,
                          [group.id]: { ...draft, colorHex: e.target.value },
                        }))
                      }
                      className="h-9 w-12 cursor-pointer rounded-lg border border-input bg-background"
                      title="Swatch colour"
                    />
                  ) : null}
                  <Button
                    variant="secondary"
                    onClick={() => handleAddOption(group)}
                    disabled={busy || !draft.value.trim()}
                  >
                    <Plus className="mr-1 h-4 w-4" /> Add option
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
