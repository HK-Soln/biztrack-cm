import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@biztrack/ui/biztrack'
import { PermissionEditor } from '@/components/roles/PermissionEditor'
import { dataClient } from '@/lib/data-client'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import { errorMessage } from '@/lib/error'
import type { RoleItem } from '@shared/ipc'

const Shield = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: size, height: size }}><path d="M12 3 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6Z" /></svg>
)
const Plus = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>)

export function Roles() {
  const t = useT()
  const qc = useQueryClient()
  const nav = useNavigate()
  const rolesQ = useQuery({ queryKey: ['roles', 'list'], queryFn: () => dataClient.roles.list({ limit: 100 }) })
  const permsQ = useQuery({ queryKey: ['roles', 'permissions'], queryFn: () => dataClient.roles.permissions() })

  const roles = rolesQ.data?.roles ?? []
  const [picked, setPicked] = useState<string | null>(null)
  const activeId = picked ?? roles[0]?.id ?? null
  const roleQ = useQuery({ queryKey: ['roles', 'detail', activeId], queryFn: () => dataClient.roles.get(activeId as string), enabled: !!activeId })

  const [confirmDel, setConfirmDel] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const del = useMutation({
    mutationFn: () => dataClient.roles.remove(activeId as string),
    onSuccess: () => { setConfirmDel(false); setPicked(null); qc.invalidateQueries({ queryKey: ['roles'] }) },
    onError: (e) => { setConfirmDel(false); setError(errorMessage(e, t('roles.actionError'))) },
  })

  const catalogue = permsQ.data?.permissions ?? []
  const role = roleQ.data
  const permSet = useMemo(() => new Set(role?.permissions ?? []), [role])

  if (rolesQ.isError) {
    return (
      <div className="frame">
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 12 }}>{t('roles.loadError')}</div>
          <Button variant="soft" type="button" onClick={() => void rolesQ.refetch()}>{t('roles.retry')}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="frame">
      <div className="page-head">
        <div><h1>{t('roles.title')}</h1><p>{t('roles.subtitle')}</p></div>
        <Button variant="primary" type="button" onClick={() => nav('/roles/new')}><Plus />{t('roles.newRole')}</Button>
      </div>

      {error ? <div className="banner warn" style={{ marginBottom: 12 }}><span>{error}</span></div> : null}

      <div className="mdlayout wide">
        <div className="panel">
          <div className="panel-head"><h3>{t('roles.roles')}</h3><div className="spacer" /><span className="chip-tag">{roles.length}</span></div>
          <div className="slist">
            {roles.map((r) => (
              <button key={r.id} type="button" className={`it${r.id === activeId ? ' sel' : ''}`} onClick={() => setPicked(r.id)}>
                <div className="ic" style={{ color: r.colour || 'var(--brand-int)', background: 'var(--inset)' }}><Shield /></div>
                <div className="tx">
                  <div className="nm">{r.name}{!r.isSystem ? <span className="chip-tag" style={{ fontSize: 9.5, marginLeft: 6 }}>{t('roles.custom')}</span> : null}</div>
                  <div className="sub">{t('roles.memberCount').replace('{n}', String(r.userCount))}</div>
                </div>
                <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 15, height: 15, color: 'var(--text-muted)' }}><path d="m9 6 6 6-6 6" /></svg>
              </button>
            ))}
          </div>
        </div>

        <div className="mddetail">
          {!role ? (
            <div className="card" style={{ color: 'var(--text-muted)', fontSize: 13 }}>…</div>
          ) : (
            <RoleDetail key={role.id} role={role} catalogue={catalogue} permSet={permSet} totalPerms={catalogue.length} t={t}
              onEdit={() => nav(`/roles/${role.id}/edit`)} onDelete={() => setConfirmDel(true)} />
          )}
        </div>
      </div>

      {confirmDel && role ? (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDel(false) }}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 400 }}>
            <div className="modal-head"><h2>{t('roles.deleteTitle')}</h2></div>
            <div className="modal-body" style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{t('roles.deleteBody').replace('{name}', role.name)}</div>
            <div className="modal-foot">
              <Button variant="soft" type="button" onClick={() => setConfirmDel(false)}>{t('roles.cancel')}</Button>
              <Button variant="primary" type="button" loading={del.isPending} onClick={() => del.mutate()} style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}>{t('roles.deleteConfirm')}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x))
}

function RoleDetail({ role, catalogue, permSet, totalPerms, t, onEdit, onDelete }: {
  role: RoleItem & { permissions: string[] }
  catalogue: import('@shared/ipc').PermissionCatalogItem[]
  permSet: Set<string>
  totalPerms: number
  t: (k: MessageKey) => string
  onEdit: () => void
  onDelete: () => void
}) {
  const qc = useQueryClient()
  // The route is owner-only, so any role EXCEPT the owner role can be edited. The owner
  // role stays immutable (its permissions are the super-admin safety net).
  const editable = !role.isOwnerRole
  const [edited, setEdited] = useState<Set<string>>(() => new Set(permSet))
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const dirty = !sameSet(edited, permSet)

  const save = useMutation({
    mutationFn: () => dataClient.roles.setPermissions(role.id, [...edited]),
    onSuccess: () => {
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
      void qc.invalidateQueries({ queryKey: ['roles'] })
    },
    onError: (e) => setSaveErr(errorMessage(e, t('roles.actionError'))),
  })

  const toggle = (key: string) => {
    setSaveErr(null)
    setSaved(false)
    setEdited((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="dhero-in" style={{ alignItems: 'center' }}>
          <div className="av" style={{ width: 52, height: 52, color: role.colour || 'var(--brand-int)', background: 'var(--inset)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 24, height: 24 }}><path d="M12 3 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6Z" /></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow">{role.isSystem ? t('roles.systemRole') : t('roles.customRole')}</div>
            <h1 style={{ fontSize: 20 }}>{role.name}</h1>
            {role.description ? <p className="desc" style={{ marginTop: 4 }}>{role.description}</p> : null}
          </div>
          {!role.isSystem ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="soft" type="button" onClick={onDelete} style={{ color: 'var(--danger)' }}>{t('roles.delete')}</Button>
              <Button variant="primary" type="button" onClick={onEdit}>{t('roles.editRole')}</Button>
            </div>
          ) : (
            <span className="chip-tag">{t('roles.builtIn')}</span>
          )}
        </div>
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div className="mc"><div className="l">{t('roles.members')}</div><div className="v">{role.userCount}</div></div>
          <div className="mc"><div className="l">{t('roles.permissions')}</div><div className="v">{edited.size} / {totalPerms}</div></div>
          <div className="mc"><div className="l">{t('roles.type')}</div><div className="v" style={{ fontSize: 16 }}>{role.isSystem ? t('roles.builtIn') : t('roles.custom')}</div></div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div><h3>{t('roles.permissions')}</h3><p>{editable ? t('roles.permsEditHint') : t('roles.permsReadonly')}</p></div>
          {editable && dirty ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="soft" type="button" onClick={() => { setEdited(new Set(permSet)); setSaveErr(null) }} disabled={save.isPending}>{t('roles.reset')}</Button>
              <Button variant="primary" type="button" loading={save.isPending} onClick={() => save.mutate()}>{t('roles.savePerms')}</Button>
            </div>
          ) : editable && saved ? (
            <span className="chip-tag" style={{ color: 'var(--success)', background: 'var(--success-soft)' }}>{t('roles.saved')}</span>
          ) : null}
        </div>
        {saveErr ? <div className="banner warn" style={{ marginBottom: 10 }}><span>{saveErr}</span></div> : null}
        <PermissionEditor catalogue={catalogue} value={edited} onToggle={toggle} disabled={!editable} />
      </div>
    </>
  )
}
