import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Input } from '@biztrack/ui/biztrack'
import { PermissionEditor } from '@/components/roles/PermissionEditor'
import { RoleSelect } from '@/components/roles/RoleSelect'
import { dataClient } from '@/lib/data-client'
import { useT } from '@/i18n'
import { errorMessage } from '@/lib/error'

const COLOURS = ['#16467A', '#2F7D4F', '#C0473F', '#B06A00', '#4A3F94', '#0F5C5C', '#33332F']

export function RoleForm() {
  const t = useT()
  const nav = useNavigate()
  const { id } = useParams<{ id: string }>()
  const editing = !!id

  const permsQ = useQuery({ queryKey: ['roles', 'permissions'], queryFn: () => dataClient.roles.permissions() })
  const roleQ = useQuery({ queryKey: ['roles', 'detail', id], queryFn: () => dataClient.roles.get(id as string), enabled: editing })

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [colour, setColour] = useState(COLOURS[0])
  const [perms, setPerms] = useState<Set<string>>(new Set())
  const [copyFrom, setCopyFrom] = useState('')
  const [copyLabel, setCopyLabel] = useState('')
  const [nameErr, setNameErr] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prefill on edit.
  useEffect(() => {
    if (editing && roleQ.data) {
      setName(roleQ.data.name)
      setDescription(roleQ.data.description ?? '')
      setColour(roleQ.data.colour || COLOURS[0])
      setPerms(new Set(roleQ.data.permissions))
    }
  }, [editing, roleQ.data])

  const catalogue = permsQ.data?.permissions ?? []
  const toggle = (key: string) => setPerms((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  const selectAll = () => setPerms(new Set(catalogue.map((p) => p.key)))
  const clearAll = () => setPerms(new Set())

  const onCopyFrom = async (roleId: string) => {
    setCopyFrom(roleId)
    if (!roleId) return
    try {
      const full = await dataClient.roles.get(roleId)
      setPerms(new Set(full.permissions))
    } catch (e) {
      setError(errorMessage(e, t('roles.actionError')))
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        await dataClient.roles.update(id as string, { name: name.trim(), description: description.trim() || undefined, colour })
        await dataClient.roles.setPermissions(id as string, [...perms])
      } else {
        await dataClient.roles.create({ name: name.trim(), description: description.trim() || undefined, colour, permissions: [...perms] })
      }
    },
    onSuccess: () => nav('/roles'),
    onError: (e) => setError(errorMessage(e, t('roles.saveError'))),
  })

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setNameErr(true); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    save.mutate()
  }

  const granted = perms.size
  const total = catalogue.length
  const loading = editing && roleQ.isLoading

  return (
    <div className="frame">
      <div className="detail-top">
        <button type="button" className="back-btn" onClick={() => nav('/roles')}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="m7 3-5 5 5 5" /><path d="M2 8h12" /></svg>
          {t('roles.backToRoles')}
        </button>
        <div className="acts2">
          <Button variant="soft" type="button" onClick={() => nav('/roles')}>{t('roles.cancel')}</Button>
          <Button variant="primary" type="button" loading={save.isPending} onClick={onSubmit}>{editing ? t('roles.saveRole') : t('roles.createRole')}</Button>
        </div>
      </div>

      <div className="page-head"><div><h1>{editing ? t('roles.editTitle') : t('roles.addTitle')}</h1><p>{t('roles.formSub')}</p></div></div>

      {error ? <div className="banner warn" style={{ marginBottom: 16 }}><span>{error}</span></div> : null}
      {loading ? <div className="card" style={{ color: 'var(--text-muted)', fontSize: 13 }}>…</div> : (
        <form className="formpage" onSubmit={onSubmit}>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="fsec-h"><span className="n">1</span>{t('roles.details')}</div>
            <div className="fform">
              <div className="ff-row">
                <div className={`ff${nameErr ? ' invalid' : ''}`}>
                  <label className="lbl2">{t('roles.name')} <span className="req">*</span></label>
                  <Input value={name} error={nameErr} placeholder={t('roles.namePh')} onChange={(e) => { setName(e.target.value); if (nameErr) setNameErr(false) }} />
                  {nameErr ? <div className="msg err"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg><span>{t('roles.nameRequired')}</span></div> : null}
                </div>
                {!editing ? (
                  <div className="ff">
                    <label className="lbl2">{t('roles.copyFrom')}</label>
                    <RoleSelect value={copyFrom || null} label={copyLabel} clearLabel={t('roles.startBlank')} placeholder={t('roles.startBlank')}
                      onChange={(id, lbl) => { setCopyLabel(lbl ?? ''); void onCopyFrom(id ?? '') }} />
                  </div>
                ) : null}
              </div>
              <div className="ff">
                <label className="lbl2">{t('roles.description')} <span className="opt">{t('roles.optional')}</span></label>
                <Input value={description} placeholder={t('roles.descPh')} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="ff">
                <label className="lbl2">{t('roles.colour')}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {COLOURS.map((c) => (
                    <button key={c} type="button" aria-label={c} onClick={() => setColour(c)}
                      style={{ width: 28, height: 28, borderRadius: 8, background: c, cursor: 'pointer', border: colour === c ? '2px solid var(--text)' : '2px solid transparent', outline: colour === c ? '2px solid var(--surface)' : 'none', outlineOffset: -4 }} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="fsec-h" style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span className="n">2</span>{t('roles.permissions')}</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <Button variant="ghost" type="button" onClick={selectAll} style={{ padding: '6px 11px', fontSize: 12 }}>{t('roles.selectAll')}</Button>
                <Button variant="ghost" type="button" onClick={clearAll} style={{ padding: '6px 11px', fontSize: 12 }}>{t('roles.clear')}</Button>
              </span>
            </div>
            <PermissionEditor catalogue={catalogue} value={perms} onToggle={toggle} />
            <div className="form-note" style={{ marginTop: 14 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
              <span>{t('roles.permCount').replace('{n}', String(granted)).replace('{total}', String(total))}</span>
            </div>
            <div className="fp-actions">
              <Button variant="soft" type="button" onClick={() => nav('/roles')}>{t('roles.cancel')}</Button>
              <Button variant="primary" type="submit" loading={save.isPending}>{editing ? t('roles.saveRole') : t('roles.createRole')}</Button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}
