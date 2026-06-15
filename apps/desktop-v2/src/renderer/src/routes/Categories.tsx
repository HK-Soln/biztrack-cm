import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal, Select } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import type { CategoryInput, LocalCategory } from '@shared/ipc'

const DEFAULT_COLOR = '#1D9E75'

function avatar(c: Pick<LocalCategory, 'color'>) {
  return c.color ? { background: c.color } : undefined
}

export function Categories() {
  const t = useT()
  const bp = useBreakpoint()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.categories })

  const { data: categories = [], isPending } = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => dataClient.categories.list(),
    enabled: isElectron,
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<LocalCategory | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<LocalCategory | null>(null)

  // form state
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [nameError, setNameError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const createM = useMutation({
    mutationFn: (input: CategoryInput) => dataClient.categories.create(input),
    onSuccess: () => invalidate(),
  })
  const updateM = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CategoryInput }) => dataClient.categories.update(id, input),
    onSuccess: () => invalidate(),
  })
  const removeM = useMutation({
    mutationFn: (id: string) => dataClient.categories.remove(id),
    onSuccess: () => invalidate(),
  })

  const selected = categories.find((c) => c.id === selectedId) ?? null

  // Parent options: anything that can still have a child (depth < 3), excluding the
  // category being edited (can't be its own parent).
  const parentOptions = useMemo(
    () =>
      categories
        .filter((c) => c.depth < 3 && c.id !== editing?.id)
        .map((c) => ({ value: c.id, label: c.name })),
    [categories, editing],
  )

  const openCreate = () => {
    setEditing(null)
    setName('')
    setParentId('')
    setColor(DEFAULT_COLOR)
    setNameError(null)
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (c: LocalCategory) => {
    setEditing(c)
    setName(c.name)
    setParentId(c.parentId ?? '')
    setColor(c.color || DEFAULT_COLOR)
    setNameError(null)
    setFormError(null)
    setFormOpen(true)
  }

  const submit = async () => {
    if (!name.trim()) {
      setNameError(t('cat.nameRequired'))
      return
    }
    const input: CategoryInput = { name: name.trim(), parentId: parentId || null, color }
    try {
      if (editing) await updateM.mutateAsync({ id: editing.id, input })
      else await createM.mutateAsync(input)
      setFormOpen(false)
    } catch {
      setFormError(t('cat.error'))
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await removeM.mutateAsync(deleteTarget.id)
    if (selectedId === deleteTarget.id) setSelectedId(null)
    setDeleteTarget(null)
  }

  const busy = createM.isPending || updateM.isPending

  const Row = ({ c }: { c: LocalCategory }) => (
    <button
      type="button"
      className={`cat-row${selectedId === c.id ? ' sel' : ''}${c.depth > 1 ? ' child' : ''}`}
      onClick={() => (bp === 'mobile' ? openEdit(c) : setSelectedId(c.id))}
    >
      <span className="ava" style={avatar(c)}>
        {c.name.trim().charAt(0) || 'C'}
      </span>
      <span className="meta">
        <span className="nm">{c.name}</span>
        <span className="sub">
          {t('cat.level')} {c.depth}
        </span>
      </span>
    </button>
  )

  const list = (
    <div className="cat-list">
      {categories.map((c) => (
        <Row key={c.id} c={c} />
      ))}
    </div>
  )

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('cat.title')}</h1>
          <p>{t('cat.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t('cat.new')}
        </Button>
      </div>

      {isPending ? (
        <div className="cat-empty">{t('cat.loading')}</div>
      ) : categories.length === 0 ? (
        <div className="card">
          <div className="cat-empty">{t('cat.empty')}</div>
        </div>
      ) : bp === 'mobile' ? (
        list
      ) : (
        <div className="md">
          {list}
          <div className="card cat-detail">
            {selected ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  <span className="av" style={avatar(selected)}>
                    {selected.name.trim().charAt(0) || 'C'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h1 style={{ fontSize: 20, fontWeight: 700 }}>{selected.name}</h1>
                    <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
                      {t('cat.level')} {selected.depth}
                    </p>
                  </div>
                  <Button variant="soft" onClick={() => openEdit(selected)}>
                    {t('cat.edit')}
                  </Button>
                  <Button variant="soft" onClick={() => setDeleteTarget(selected)} style={{ color: 'var(--danger)' }}>
                    {t('cat.delete')}
                  </Button>
                </div>
                <div className="cat-empty">{t('cat.noProducts')}</div>
              </>
            ) : (
              <div className="cat-empty">{t('cat.selectHint')}</div>
            )}
          </div>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? t('cat.editTitle') : t('cat.newTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setFormOpen(false)} disabled={busy}>
              {t('cat.cancel')}
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void submit()}>
              {editing ? t('cat.save') : t('cat.create')}
            </Button>
          </>
        }
      >
        <div className="fform">
          <div className={`ff${nameError ? ' invalid' : ''}`}>
            <label className="lbl2">
              {t('cat.name')} <span className="req">*</span>
            </label>
            <Input
              value={name}
              error={!!nameError}
              placeholder={t('cat.namePh')}
              onChange={(e) => {
                setName(e.target.value)
                setNameError(null)
              }}
            />
            {nameError ? (
              <div className="msg err">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16h.01" />
                </svg>
                <span>{nameError}</span>
              </div>
            ) : null}
          </div>
          <div className="ff">
            <label className="lbl2">{t('cat.parent')}</label>
            <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">{t('cat.parentNone')}</option>
              {parentOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="ff">
            <label className="lbl2">{t('cat.color')}</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ width: 56, height: 36, border: '1px solid var(--border)', borderRadius: 8, background: 'none', cursor: 'pointer' }}
            />
          </div>
          {formError ? (
            <p style={{ color: 'var(--danger)', fontSize: 12.5 }} role="alert">
              {formError}
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('cat.deleteTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setDeleteTarget(null)} disabled={removeM.isPending}>
              {t('cat.cancel')}
            </Button>
            <Button variant="primary" loading={removeM.isPending} style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => void confirmDelete()}>
              {t('cat.delete')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {t('cat.deleteBody').replace('{name}', deleteTarget?.name ?? '')}
        </p>
      </Modal>
    </div>
  )
}
