import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal, Pagination, Select } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { usePaged } from '@/lib/usePaged'
import { useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import type { LocalUnit, UnitType } from '@shared/ipc'

const UNIT_TYPES: UnitType[] = ['QUANTITY', 'WEIGHT', 'VOLUME', 'LENGTH', 'CUSTOM']
const TYPE_LABEL: Record<UnitType, string> = {
  QUANTITY: 'unit.typeQuantity',
  WEIGHT: 'unit.typeWeight',
  VOLUME: 'unit.typeVolume',
  LENGTH: 'unit.typeLength',
  CUSTOM: 'unit.typeCustom',
}

export function Units() {
  const t = useT()
  const bp = useBreakpoint()
  const qc = useQueryClient()

  const {
    items: filtered,
    total,
    page,
    limit,
    totalPages,
    isPending,
    search,
    setSearch,
    setPage,
  } = usePaged<LocalUnit>(queryKeys.units, (q) => dataClient.units.list(q), { enabled: true })

  const [edit, setEdit] = useState<{ unit?: LocalUnit } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LocalUnit | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.units })

  const removeM = useMutation({
    mutationFn: (id: string) => dataClient.units.remove(id),
    onSuccess: invalidate,
  })

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await removeM.mutateAsync(deleteTarget.id)
    setDeleteTarget(null)
  }

  const roleBadge = (u: LocalUnit) =>
    u.isSystem ? (
      <span className="st st-neutral">{t('unit.system')}</span>
    ) : u.isDefault ? (
      <span className="st st-brand">{t('unit.default')}</span>
    ) : (
      <span className="st st-soft">{t('unit.custom')}</span>
    )

  const actions = (u: LocalUnit) =>
    u.isSystem ? (
      <span className="u-locked">{t('unit.locked')}</span>
    ) : (
      <span className="acts">
        <button title={t('unit.edit')} onClick={() => setEdit({ unit: u })}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
            <path d="M14 6l4 4" />
          </svg>
        </button>
        <button title={t('unit.delete')} onClick={() => setDeleteTarget(u)} style={{ color: 'var(--danger)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
          </svg>
        </button>
      </span>
    )

  const editModal = edit ? (
    <UnitModal
      unit={edit.unit}
      onClose={() => setEdit(null)}
      onSaved={() => {
        invalidate()
        setEdit(null)
      }}
    />
  ) : null
  const deleteModal = (
    <Modal
      open={!!deleteTarget}
      onClose={() => setDeleteTarget(null)}
      title={t('unit.deleteTitle')}
      footer={
        <>
          <Button variant="soft" onClick={() => setDeleteTarget(null)} disabled={removeM.isPending}>
            {t('unit.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={removeM.isPending}
            style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={() => void confirmDelete()}
          >
            {t('unit.delete')}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
        {t('unit.deleteBody').replace('{name}', deleteTarget?.name ?? '')}
      </p>
    </Modal>
  )

  // --- mobile: full-bleed header + search + tappable list + FAB -------------
  if (bp === 'mobile') {
    const mRole = (u: LocalUnit) =>
      u.isSystem ? (
        <span className="mst mst-neutral"><span className="d" />{t('unit.system')}</span>
      ) : u.isDefault ? (
        <span className="mst mst-ok"><span className="d" />{t('unit.default')}</span>
      ) : (
        <span className="mst mst-neutral"><span className="d" />{t('unit.custom')}</span>
      )
    return (
      <>
        <header className="m-head">
          <div className="m-tt">
            <div className="m-title">{t('unit.title')}</div>
            <div className="m-sub">{t('unit.subtitle')}</div>
          </div>
        </header>

        <div className="msearch" style={{ marginBottom: 13 }}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="9" cy="9" r="6" /><path d="m14 14 3 3" /></svg>
          <input value={search} placeholder={t('unit.search')} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="mlist">
          {isPending && filtered.length === 0 ? <div className="mrow" style={{ cursor: 'default' }}><div className="mt"><div className="sub">{t('unit.loading')}</div></div></div> : null}
          {!isPending && filtered.length === 0 ? <div className="mrow" style={{ cursor: 'default' }}><div className="mt"><div className="sub">{t('unit.empty')}</div></div></div> : null}
          {filtered.map((u) => (
            <div
              key={u.id}
              className="mrow"
              style={{ cursor: u.isSystem ? 'default' : 'pointer' }}
              onClick={() => { if (!u.isSystem) setEdit({ unit: u }) }}
            >
              <div className="th">{u.abbreviation || u.name.slice(0, 3)}</div>
              <div className="mt">
                <div className="nm">{u.name}</div>
                <div className="sub">{t(TYPE_LABEL[u.type] as Parameters<typeof t>[0])}</div>
              </div>
              <div className="rt"><div className="s">{mRole(u)}</div></div>
              {u.isSystem ? (
                <span className="mrow-lock">{t('unit.locked')}</span>
              ) : (
                <button type="button" className="mrow-x" onClick={(e) => { e.stopPropagation(); setDeleteTarget(u) }} aria-label={t('unit.delete')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>

        {totalPages > 1 ? (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
            <button type="button" className="mbtn" style={{ width: 'auto', padding: '0 18px' }} disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('common.prev')}</button>
            <button type="button" className="mbtn" style={{ width: 'auto', padding: '0 18px' }} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{t('common.next')}</button>
          </div>
        ) : null}

        <div style={{ height: 76 }} />
        <button type="button" className="mfab" onClick={() => setEdit({})} aria-label={t('unit.new')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>
        </button>

        {editModal}
        {deleteModal}
      </>
    )
  }

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('unit.title')}</h1>
          <p>{t('unit.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => setEdit({})}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t('unit.new')}
        </Button>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{t('unit.all')}</h3>
          <div className="spacer" style={{ flex: 1 }} />
          <Input
            value={search}
            placeholder={t('unit.search')}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 230, height: 36 }}
          />
        </div>

        {isPending ? (
          <div className="cat-empty">{t('unit.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="cat-empty">{t('unit.empty')}</div>
        ) : (
          <table className="utbl">
            <thead>
              <tr>
                <th>{t('unit.colUnit')}</th>
                <th>{t('unit.colAbbr')}</th>
                <th>{t('unit.colType')}</th>
                <th>{t('unit.colRole')}</th>
                <th className="right">{t('unit.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="u-cell">
                      <span className="u-abbr">{u.abbreviation || u.name.slice(0, 3)}</span>
                      <span className="u-nm">{u.name}</span>
                    </div>
                  </td>
                  <td className="mono">{u.abbreviation || '—'}</td>
                  <td>
                    <span className="chip-tag">{t(TYPE_LABEL[u.type] as Parameters<typeof t>[0])}</span>
                  </td>
                  <td>{roleBadge(u)}</td>
                  <td className="right">{actions(u)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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

      {editModal}
      {deleteModal}
    </div>
  )
}

function UnitModal({
  unit,
  onClose,
  onSaved,
}: {
  unit?: LocalUnit
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const editing = Boolean(unit)
  const [name, setName] = useState(unit?.name ?? '')
  const [abbreviation, setAbbreviation] = useState(unit?.abbreviation ?? '')
  const [type, setType] = useState<UnitType>(unit?.type ?? 'QUANTITY')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () =>
      editing && unit
        ? dataClient.units.update(unit.id, { name: name.trim(), abbreviation: abbreviation.trim(), type })
        : dataClient.units.create({ name: name.trim(), abbreviation: abbreviation.trim(), type }),
    onSuccess: onSaved,
    onError: () => setError(t('unit.saveError')),
  })

  const submit = () => {
    if (!name.trim() || !abbreviation.trim()) {
      setError(t('unit.required'))
      return
    }
    setError(null)
    save.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t('unit.editTitle') : t('unit.new')}
      footer={
        <>
          <Button variant="soft" onClick={onClose} disabled={save.isPending}>
            {t('unit.cancel')}
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {editing ? t('unit.save') : t('unit.create')}
          </Button>
        </>
      }
    >
      <div className="ff" style={{ marginBottom: 12 }}>
        <label className="lbl2">
          {t('unit.name')} <span className="req">*</span>
        </label>
        <Input value={name} error={!!error && !name.trim()} placeholder={t('unit.namePh')} onChange={(e) => { setName(e.target.value); setError(null) }} />
      </div>
      <div className="ff" style={{ marginBottom: 12 }}>
        <label className="lbl2">
          {t('unit.abbr')} <span className="req">*</span>
        </label>
        <Input value={abbreviation} error={!!error && !abbreviation.trim()} placeholder={t('unit.abbrPh')} onChange={(e) => { setAbbreviation(e.target.value); setError(null) }} />
      </div>
      <div className="ff">
        <label className="lbl2">{t('unit.type')}</label>
        <Select value={type} onChange={(e) => setType(e.target.value as UnitType)}>
          {UNIT_TYPES.map((ut) => (
            <option key={ut} value={ut}>
              {t(TYPE_LABEL[ut] as Parameters<typeof t>[0])}
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
