import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BackButton, Button, Input, Modal, Pagination, Select } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { usePaged } from '@/lib/usePaged'
import { useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import type { AttributeDisplayType, LocalAttributeGroup, LocalAttributeOption } from '@shared/ipc'

const DISPLAY_TYPES: AttributeDisplayType[] = ['SWATCHES', 'CHIPS', 'DROPDOWN']
const DISPLAY_LABEL: Record<AttributeDisplayType, string> = {
  SWATCHES: 'attr.swatches',
  CHIPS: 'attr.chips',
  DROPDOWN: 'attr.dropdown',
}

export function Attributes() {
  const t = useT()
  const bp = useBreakpoint()
  const qc = useQueryClient()

  const {
    items: groups,
    total,
    page,
    limit,
    totalPages,
    isPending,
    search,
    setSearch,
    setPage,
  } = usePaged<LocalAttributeGroup>(
    queryKeys.attributeGroups,
    (q) => dataClient.attributes.listGroups(q),
    {
      enabled: true,
    },
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [groupModal, setGroupModal] = useState<{
    mode: 'create' | 'edit'
    group?: LocalAttributeGroup
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LocalAttributeGroup | null>(null)
  // Surfaces delete-guard / write failures (e.g. option still used by a live variant).
  const [actionError, setActionError] = useState<string | null>(null)
  const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

  // Keep a valid selection as the list changes.
  useEffect(() => {
    if (groups.length === 0) {
      if (selectedId !== null) setSelectedId(null)
      return
    }
    if (!selectedId || !groups.some((g) => g.id === selectedId)) {
      if (bp !== 'mobile') setSelectedId(groups[0]?.id ?? null)
    }
  }, [groups, selectedId, bp])

  const selected = groups.find((g) => g.id === selectedId) ?? null
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.attributeGroups })

  const removeGroup = useMutation({
    mutationFn: (id: string) => dataClient.attributes.deleteGroup(id),
    onSuccess: invalidate,
    onError: (e) => setActionError(errMessage(e)),
  })
  const setDisplayType = useMutation({
    mutationFn: ({
      group,
      displayType,
    }: {
      group: LocalAttributeGroup
      displayType: AttributeDisplayType
    }) =>
      dataClient.attributes.updateGroup(group.id, {
        name: group.name,
        displayType,
        isActive: group.isActive,
      }),
    onSuccess: invalidate,
  })
  const addOption = useMutation({
    mutationFn: ({
      groupId,
      value,
      colorHex,
    }: {
      groupId: string
      value: string
      colorHex?: string | null
    }) => dataClient.attributes.addOption(groupId, { value, colorHex }),
    onSuccess: invalidate,
  })
  const removeOption = useMutation({
    mutationFn: (optionId: string) => dataClient.attributes.deleteOption(optionId),
    onSuccess: () => {
      setActionError(null)
      invalidate()
    },
    onError: (e) => setActionError(errMessage(e)),
  })
  const updateOption = useMutation({
    mutationFn: ({
      optionId,
      value,
      colorHex,
    }: {
      optionId: string
      value: string
      colorHex?: string | null
    }) => dataClient.attributes.updateOption(optionId, { value, colorHex }),
    onSuccess: invalidate,
  })
  const reorderOptions = useMutation({
    // Persist the new order by writing each option's sortOrder (reuses updateOption).
    mutationFn: async (ordered: LocalAttributeOption[]) => {
      for (let i = 0; i < ordered.length; i++) {
        const o = ordered[i]
        if (!o) continue
        await dataClient.attributes.updateOption(o.id, {
          value: o.value,
          colorHex: o.colorHex,
          sortOrder: i,
        })
      }
    },
    onSuccess: invalidate,
  })

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await removeGroup.mutateAsync(deleteTarget.id)
      if (selectedId === deleteTarget.id) setSelectedId(null)
      setDeleteTarget(null)
    } catch {
      // Guard failure (attribute in use) — keep the modal open; error shown below.
    }
  }

  const groupList = (
    <div className="panel">
      <div className="panel-head">
        <h3>{t('attr.groups')}</h3>
        <span className="chip-tag">{total}</span>
        <div className="spacer" style={{ flex: 1 }} />
        <Input
          value={search}
          placeholder={t('attr.search')}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 180, height: 34 }}
        />
      </div>
      <div className="slist">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`it${g.id === selectedId ? ' sel' : ''}`}
            onClick={() => setSelectedId(g.id)}
          >
            <span className={`ic${g.displayType === 'SWATCHES' ? ' sw' : ''}`}>
              {g.displayType === 'SWATCHES' ? '◐' : '▭'}
            </span>
            <span className="tx">
              <span className="nm">{g.name}</span>
              <span className="sub">
                {g.displayType === 'SWATCHES' && g.options.length > 0 ? (
                  <span className="dots">
                    {g.options.slice(0, 6).map((o) => (
                      <span
                        key={o.id}
                        className="dot"
                        style={{ background: o.colorHex ?? '#ccc' }}
                      />
                    ))}
                  </span>
                ) : (
                  `${g.options.length} ${t('attr.optionsWord')}`
                )}
              </span>
            </span>
            <span className="rt">
              {g.options.length}
              <span className="rs">{t('attr.optionsWord')}</span>
            </span>
          </button>
        ))}
        {groups.length === 0 ? <div className="cat-empty">{t('attr.empty')}</div> : null}
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPage={setPage}
        prevLabel={t('common.prev')}
        nextLabel={t('common.next')}
      />
    </div>
  )

  const detail = selected ? (
    <GroupDetail
      key={selected.id}
      group={selected}
      busy={setDisplayType.isPending || addOption.isPending}
      onBack={bp === 'mobile' ? () => setSelectedId(null) : undefined}
      onRename={() => setGroupModal({ mode: 'edit', group: selected })}
      onDelete={() => {
        setActionError(null)
        setDeleteTarget(selected)
      }}
      error={actionError}
      onDismissError={() => setActionError(null)}
      onSetDisplayType={(displayType) => setDisplayType.mutate({ group: selected, displayType })}
      onAddOption={(value, colorHex) => addOption.mutate({ groupId: selected.id, value, colorHex })}
      onRemoveOption={(optionId) => removeOption.mutate(optionId)}
      onUpdateOption={(optionId, value, colorHex) =>
        updateOption.mutate({ optionId, value, colorHex })
      }
      onReorderOptions={(ordered) => reorderOptions.mutate(ordered)}
    />
  ) : (
    <div className="card mddetail">
      <div className="cat-empty">{t('attr.selectHint')}</div>
    </div>
  )

  const modals = (
    <>
      {groupModal ? (
        <GroupModal
          mode={groupModal.mode}
          group={groupModal.group}
          onClose={() => setGroupModal(null)}
          onSaved={(id) => {
            invalidate()
            setGroupModal(null)
            if (groupModal.mode === 'create') setSelectedId(id)
          }}
        />
      ) : null}

      <Modal
        open={!!deleteTarget}
        onClose={() => {
          setDeleteTarget(null)
          setActionError(null)
        }}
        title={t('attr.deleteGroupTitle')}
        footer={
          <>
            <Button
              variant="soft"
              onClick={() => setDeleteTarget(null)}
              disabled={removeGroup.isPending}
            >
              {t('attr.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={removeGroup.isPending}
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={() => void confirmDelete()}
            >
              {t('attr.delete')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {t('attr.deleteGroupBody').replace('{name}', deleteTarget?.name ?? '')}
        </p>
        {actionError ? (
          <div className="attr-err" style={{ marginTop: 10 }}>
            {actionError}
          </div>
        ) : null}
      </Modal>
    </>
  )

  // --- mobile: master-detail (group list → tap → detail with back) + FAB ---
  if (bp === 'mobile') {
    return (
      <>
        {selected ? (
          detail
        ) : (
          <>
            <header className="m-head">
              <div className="m-tt">
                <div className="m-title">{t('attr.title')}</div>
                <div className="m-sub">{t('attr.subtitle')}</div>
              </div>
            </header>
            {isPending ? <div className="cat-empty">{t('attr.loading')}</div> : groupList}
            <div style={{ height: 76 }} />
            <button
              type="button"
              className="mfab"
              onClick={() => setGroupModal({ mode: 'create' })}
              aria-label={t('attr.newGroup')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </>
        )}
        {modals}
      </>
    )
  }

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('attr.title')}</h1>
          <p>{t('attr.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => setGroupModal({ mode: 'create' })}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t('attr.newGroup')}
        </Button>
      </div>

      {isPending ? (
        <div className="cat-empty">{t('attr.loading')}</div>
      ) : (
        <div className="mdlayout wide">
          {groupList}
          {detail}
        </div>
      )}

      {modals}
    </div>
  )
}

function GroupDetail({
  group,
  busy,
  onBack,
  onRename,
  onDelete,
  onSetDisplayType,
  onAddOption,
  onRemoveOption,
  onUpdateOption,
  onReorderOptions,
  error,
  onDismissError,
}: {
  group: LocalAttributeGroup
  busy: boolean
  onBack?: () => void
  onRename: () => void
  onDelete: () => void
  onSetDisplayType: (t: AttributeDisplayType) => void
  onAddOption: (value: string, colorHex?: string | null) => void
  onRemoveOption: (optionId: string) => void
  onUpdateOption: (optionId: string, value: string, colorHex?: string | null) => void
  onReorderOptions: (ordered: LocalAttributeOption[]) => void
  error?: string | null
  onDismissError: () => void
}) {
  const t = useT()
  const isSwatch = group.displayType === 'SWATCHES'
  const [value, setValue] = useState('')
  const [color, setColor] = useState('#1565C0')
  const [editing, setEditing] = useState<{ id: string; value: string; colorHex: string } | null>(
    null,
  )

  // Drag-and-drop reorder: keep a local ordered copy that shifts live while dragging
  // (smooth), then persist the new order on drop.
  const [items, setItems] = useState<LocalAttributeOption[]>(group.options)
  useEffect(() => setItems(group.options), [group.options])
  const dragId = useRef<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  const onDragOver = (e: DragEvent, overId: string) => {
    e.preventDefault()
    const fromId = dragId.current
    if (!fromId || fromId === overId) return
    setItems((prev) => {
      const from = prev.findIndex((o) => o.id === fromId)
      const to = prev.findIndex((o) => o.id === overId)
      if (from === -1 || to === -1 || from === to) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      if (moved) next.splice(to, 0, moved)
      return next
    })
  }
  const onDrop = () => {
    // Both the row's onDrop and the grip's onDragEnd fire on release — run once.
    if (!dragId.current) return
    dragId.current = null
    setDragging(null)
    // Persist only if the order actually changed.
    if (items.some((o, i) => o.id !== group.options[i]?.id)) onReorderOptions(items)
  }

  const submitOption = () => {
    const v = value.trim()
    if (!v) return
    onAddOption(v, isSwatch ? color : null)
    setValue('')
  }

  const saveEdit = () => {
    const v = editing?.value.trim()
    if (!editing || !v) return
    onUpdateOption(editing.id, v, isSwatch ? editing.colorHex : null)
    setEditing(null)
  }

  return (
    <div className="mddetail">
      {onBack ? (
        <BackButton onClick={onBack} style={{ marginBottom: 12 }}>
          {t('attr.back')}
        </BackButton>
      ) : null}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="dhero-in">
          <span className={`av${isSwatch ? ' sw' : ''}`}>{isSwatch ? '◐' : '▭'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow">{t('attr.groupEyebrow')}</div>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>{group.name}</h1>
          </div>
          <Button variant="soft" onClick={onRename}>
            {t('attr.rename')}
          </Button>
          <Button variant="soft" onClick={onDelete} style={{ color: 'var(--danger)' }}>
            {t('attr.delete')}
          </Button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h">
          <div>
            <h3>{t('attr.display')}</h3>
            <p>{t('attr.displayHint')}</p>
          </div>
        </div>
        <div className="seg-pick">
          {DISPLAY_TYPES.map((dt) => (
            <button
              key={dt}
              type="button"
              aria-pressed={dt === group.displayType}
              disabled={busy}
              onClick={() => dt !== group.displayType && onSetDisplayType(dt)}
            >
              {t(DISPLAY_LABEL[dt] as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
        <div className="hint" style={{ marginTop: 9 }}>
          {isSwatch ? t('attr.swatchesHint') : t('attr.chipsHint')}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div>
            <h3>
              {t('attr.options')} · {items.length}
            </h3>
            <p>
              {t('attr.usedInPrefix')} {group.categoryCount} {t('attr.categoriesWord')}
            </p>
          </div>
        </div>
        {error ? (
          <div
            className="attr-err"
            style={{ margin: '0 0 10px', display: 'flex', gap: 8, alignItems: 'flex-start' }}
          >
            <span style={{ flex: 1 }}>{error}</span>
            <button
              type="button"
              onClick={onDismissError}
              style={{
                background: 'none',
                border: 0,
                color: 'inherit',
                cursor: 'pointer',
                padding: 0,
                lineHeight: 1,
                fontSize: 16,
              }}
              aria-label="dismiss"
            >
              ×
            </button>
          </div>
        ) : null}
        <div className="opt-list">
          {items.map((o) =>
            editing?.id === o.id ? (
              <div key={o.id} className="opt-edit">
                {isSwatch ? (
                  <input
                    type="color"
                    value={editing.colorHex}
                    onChange={(e) => setEditing({ ...editing, colorHex: e.target.value })}
                    className="opt-color"
                  />
                ) : null}
                <Input
                  autoFocus
                  value={editing.value}
                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      saveEdit()
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setEditing(null)
                    }
                  }}
                  style={{ flex: 1, height: 32 }}
                />
                <button
                  type="button"
                  className="opt-ok"
                  title={t('attr.save')}
                  disabled={busy || !editing.value.trim()}
                  onClick={saveEdit}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="opt-del"
                  title={t('attr.cancel')}
                  onClick={() => setEditing(null)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
            ) : (
              <div
                key={o.id}
                className={`opt-edit opt-row${dragging === o.id ? ' dragging' : ''}`}
                onDragOver={(e) => onDragOver(e, o.id)}
                onDrop={onDrop}
              >
                <span
                  className="opt-grip"
                  draggable
                  title={t('attr.reorder')}
                  onDragStart={(e) => {
                    dragId.current = o.id
                    setDragging(o.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={onDrop}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width={14} height={14}>
                    <circle cx="9" cy="6" r="1.6" />
                    <circle cx="15" cy="6" r="1.6" />
                    <circle cx="9" cy="12" r="1.6" />
                    <circle cx="15" cy="12" r="1.6" />
                    <circle cx="9" cy="18" r="1.6" />
                    <circle cx="15" cy="18" r="1.6" />
                  </svg>
                </span>
                {isSwatch ? (
                  <span className="sw-dot" style={{ background: o.colorHex ?? '#ccc' }} />
                ) : null}
                <button
                  type="button"
                  className="ov"
                  title={t('attr.editOption')}
                  onClick={() =>
                    setEditing({ id: o.id, value: o.value, colorHex: o.colorHex ?? '#1565C0' })
                  }
                >
                  {o.value}
                </button>
                {isSwatch && o.colorHex ? (
                  <span className="hx">{o.colorHex.toUpperCase()}</span>
                ) : null}
                <button
                  type="button"
                  className="opt-del"
                  title={t('attr.removeOption')}
                  onClick={() => onRemoveOption(o.id)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
            ),
          )}
          {items.length === 0 ? <div className="cat-empty">{t('attr.noOptions')}</div> : null}
        </div>
        <div className="opt-add">
          {isSwatch ? (
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="opt-color"
            />
          ) : null}
          <Input
            value={value}
            placeholder={t('attr.optionPh')}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitOption()
              }
            }}
          />
          <Button variant="primary" onClick={submitOption} disabled={busy || !value.trim()}>
            {t('attr.add')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function GroupModal({
  mode,
  group,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit'
  group?: LocalAttributeGroup
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const t = useT()
  const [name, setName] = useState(group?.name ?? '')
  const [displayType, setDisplayType] = useState<AttributeDisplayType>(
    group?.displayType ?? 'CHIPS',
  )
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () =>
      mode === 'edit' && group
        ? dataClient.attributes.updateGroup(group.id, {
            name: name.trim(),
            displayType,
            isActive: group.isActive,
          })
        : dataClient.attributes.createGroup({ name: name.trim(), displayType }),
    onSuccess: (g) => onSaved(g.id),
    onError: () => setError(t('attr.saveError')),
  })

  const submit = () => {
    if (!name.trim()) {
      setError(t('attr.nameRequired'))
      return
    }
    setError(null)
    save.mutate()
  }

  const displayOptions = useMemo(() => DISPLAY_TYPES, [])

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'edit' ? t('attr.editGroupTitle') : t('attr.newGroup')}
      footer={
        <>
          <Button variant="soft" onClick={onClose} disabled={save.isPending}>
            {t('attr.cancel')}
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {mode === 'edit' ? t('attr.save') : t('attr.create')}
          </Button>
        </>
      }
    >
      <div className="ff" style={{ marginBottom: 12 }}>
        <label className="lbl2">
          {t('attr.name')} <span className="req">*</span>
        </label>
        <Input
          value={name}
          error={!!error}
          placeholder={t('attr.namePh')}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
        />
      </div>
      <div className="ff">
        <label className="lbl2">{t('attr.display')}</label>
        <Select
          value={displayType}
          onChange={(e) => setDisplayType(e.target.value as AttributeDisplayType)}
        >
          {displayOptions.map((dt) => (
            <option key={dt} value={dt}>
              {t(DISPLAY_LABEL[dt] as Parameters<typeof t>[0])}
            </option>
          ))}
        </Select>
      </div>
      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
