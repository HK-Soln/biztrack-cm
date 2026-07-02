import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, PhoneInput, isValidPhone } from '@biztrack/ui/biztrack'
import { ActionMenu } from '@/components/ActionMenu'
import { RoleSelect } from '@/components/roles/RoleSelect'
import { dataClient } from '@/lib/data-client'
import { useLangStore, useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import { errorMessage } from '@/lib/error'
import { isValidEmail } from '@/lib/schemas'
import { canWebShare, copyText, mailtoUrl, openExternal, webShare, whatsappUrl } from '@/lib/share'
import { useSessionStore } from '@/stores/session.store'
import type { PendingInviteItem, RoleItem, SendInviteResponse, TeamMember } from '@shared/ipc'

function initials(name?: string | null, fallback = '—'): string {
  if (!name) return fallback
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || fallback
}

const Check = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}><path d="m5 12 4 4L19 6" /></svg>)
const InviteIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>)

function fmtDate(iso: string | null, lang: string): string {
  return iso ? new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—'
}

// One normalised row for the unified team list. A member and a pending token-invite
// are two different backend records, but the UI treats them as one thing: someone on
// (or joining) the team, with a status. Members and invites never overlap — an invited
// existing user is a PENDING membership (no token), an invited non-user is a token invite.
type TeamStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING' | 'EXPIRED'
interface TeamEntry {
  key: string
  kind: 'member' | 'invite'
  title: string
  sub: string
  roleId: string
  roleName: string
  status: TeamStatus
  joinedAt: string | null
  searchText: string
  member?: TeamMember
  invite?: PendingInviteItem
}

export function Team() {
  const t = useT()
  const qc = useQueryClient()
  const lang = useLangStore((s) => s.lang)
  const currentUserId = useSessionStore((s) => s.status.user?.id ?? null)

  const membersQ = useQuery({ queryKey: ['team', 'members'], queryFn: () => dataClient.team.listMembers() })
  const invitesQ = useQuery({ queryKey: ['team', 'invites'], queryFn: () => dataClient.team.listInvites() })
  const rolesQ = useQuery({ queryKey: ['roles', 'list'], queryFn: () => dataClient.roles.list({ limit: 100 }) })

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [changeFor, setChangeFor] = useState<TeamMember | null>(null)
  const [removeFor, setRemoveFor] = useState<TeamMember | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast((c) => (c === m ? null : c)), 2400) }

  const roles = rolesQ.data?.roles ?? []
  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['team'] })
  }

  const resend = useMutation({
    mutationFn: (id: string) => dataClient.team.resendInvite(id),
    onSuccess: (res) => { flash(t('team.inviteResent')); invalidate(); if (res.inviteUrl) setShareUrl(res.inviteUrl) },
    onError: (e) => setError(errorMessage(e, t('team.actionError'))),
  })
  const cancel = useMutation({
    mutationFn: (id: string) => dataClient.team.cancelInvite(id),
    onSuccess: () => { flash(t('team.inviteCancelled')); invalidate() },
    onError: (e) => setError(errorMessage(e, t('team.actionError'))),
  })
  const remove = useMutation({
    mutationFn: (userId: string) => dataClient.team.removeMember(userId),
    onSuccess: () => { setRemoveFor(null); flash(t('team.memberRemoved')); invalidate() },
    onError: (e) => { setRemoveFor(null); setError(errorMessage(e, t('team.actionError'))) },
  })
  const setActive = useMutation({
    mutationFn: (v: { userId: string; active: boolean }) => dataClient.team.setMemberActive(v.userId, v.active),
    onSuccess: (_r, v) => { flash(v.active ? t('team.reactivated') : t('team.deactivated')); invalidate() },
    onError: (e) => setError(errorMessage(e, t('team.actionError'))),
  })

  const members = membersQ.data?.members ?? []
  const invites = invitesQ.data?.invites ?? []

  // Merge members + invites into one normalised, searchable list. Members first
  // (owner/active/pending-member), then the token invites — matching the design.
  const entries = useMemo<TeamEntry[]>(() => {
    const m: TeamEntry[] = members.map((mem) => ({
      key: `m:${mem.memberId}`,
      kind: 'member',
      title: mem.name || mem.email || mem.phone || '—',
      sub: mem.email || mem.phone || '—',
      roleId: mem.roleId,
      roleName: mem.roleName,
      status: mem.status === 'ACTIVE' ? 'ACTIVE' : mem.status === 'SUSPENDED' ? 'SUSPENDED' : 'PENDING',
      joinedAt: mem.joinedAt,
      searchText: `${mem.name ?? ''} ${mem.email ?? ''} ${mem.phone ?? ''}`.toLowerCase(),
      member: mem,
    }))
    const i: TeamEntry[] = invites.map((inv) => ({
      key: `i:${inv.id}`,
      kind: 'invite',
      title: inv.email || inv.phone || t('team.invited'),
      sub: t('team.invitedOn').replace('{date}', fmtDate(inv.createdAt, lang)),
      roleId: inv.roleId,
      roleName: inv.roleName,
      status: inv.status === 'expired' ? 'EXPIRED' : 'PENDING',
      joinedAt: null,
      searchText: `${inv.email ?? ''} ${inv.phone ?? ''}`.toLowerCase(),
      invite: inv,
    }))
    return [...m, ...i]
  }, [members, invites, lang, t])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter((e) => {
      if (roleFilter && e.roleId !== roleFilter) return false
      if (!q) return true
      return e.searchText.includes(q)
    })
  }, [entries, search, roleFilter])

  const pendingCount = entries.filter((e) => e.status === 'PENDING' || e.status === 'EXPIRED').length
  const activeCount = members.filter((m) => m.status === 'ACTIVE').length

  if (membersQ.isError) {
    return (
      <div className="frame">
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 12 }}>{t('team.loadError')}</div>
          <Button variant="soft" type="button" onClick={() => void membersQ.refetch()}>{t('team.retry')}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="frame">
      <div className="page-head">
        <div><h1>{t('team.title')}</h1><p>{t('team.subtitle')}</p></div>
        <Button variant="primary" type="button" onClick={() => setInviteOpen(true)}><InviteIcon />{t('team.invite')}</Button>
      </div>

      <div className="minihead">
        <div className="m"><div className="k">{t('team.kpiMembers')}</div><div className="v">{members.length}</div><div className="h">{t('team.kpiActive').replace('{n}', String(activeCount))}</div></div>
        <div className="m"><div className="k">{t('team.kpiRoles')}</div><div className="v">{rolesQ.data?.total ?? roles.length}</div><div className="h">{t('team.kpiRolesHint')}</div></div>
        <div className="m"><div className="k">{t('team.kpiPending')}{pendingCount ? <span className="badge b-warn">{pendingCount}</span> : null}</div><div className="v">{pendingCount}</div><div className="h">{t('team.kpiPendingHint')}</div></div>
      </div>

      <div className="toolbar">
        <div className="field grow">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="9" cy="9" r="6" /><path d="m14 14 3 3" /></svg>
          <Input className="ic" placeholder={t('team.searchPh')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div style={{ width: 210, flexShrink: 0 }}>
          <RoleSelect value={roleFilter || null} label={roleById.get(roleFilter)?.name} onChange={(id) => setRoleFilter(id ?? '')} clearLabel={t('team.allRoles')} placeholder={t('team.allRoles')} />
        </div>
      </div>

      {error ? <div className="banner warn" style={{ marginBottom: 12 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg><span>{error}</span></div> : null}

      <div className="panel">
        <div className="panel-head"><h3>{t('team.members')}</h3><div className="spacer" /><span className="chip-tag">{visible.length}</span></div>
        <table className="ltbl">
          <thead>
            <tr><th>{t('team.colMember')}</th><th>{t('team.colRole')}</th><th>{t('team.colStatus')}</th><th>{t('team.colJoined')}</th><th className="right">{t('team.colActions')}</th></tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <TeamRow
                key={e.key} entry={e} role={roleById.get(e.roleId)} t={t} lang={lang}
                isSelf={e.member?.userId === currentUserId}
                onChangeRole={() => e.member && setChangeFor(e.member)}
                onRemove={() => e.member && setRemoveFor(e.member)}
                onToggleActive={(active) => e.member && setActive.mutate({ userId: e.member.userId, active })}
                onResend={() => e.invite && resend.mutate(e.invite.id)}
                onCancel={() => e.invite && cancel.mutate(e.invite.id)}
              />
            ))}
            {visible.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '28px 0' }}>{t('team.empty')}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {inviteOpen ? (
        <InviteModal
          roles={roles} t={t}
          onClose={() => setInviteOpen(false)}
          onSent={(res) => {
            setInviteOpen(false)
            invalidate()
            if (res.status === 'pending_invite' && res.inviteUrl) { flash(t('team.inviteCreated')); setShareUrl(res.inviteUrl) }
            else flash(t('team.inviteSent'))
          }}
          onError={(m) => setError(m)}
        />
      ) : null}
      {changeFor ? <ChangeRoleModal member={changeFor} onClose={() => setChangeFor(null)} onSaved={() => { setChangeFor(null); flash(t('team.roleChanged')); invalidate() }} onError={(m) => setError(m)} t={t} /> : null}
      {removeFor ? (
        <ConfirmModal
          title={t('team.removeTitle')} body={t('team.removeBody').replace('{name}', removeFor.name ?? removeFor.email ?? '')}
          confirmLabel={t('team.removeConfirm')} pending={remove.isPending}
          onCancel={() => setRemoveFor(null)} onConfirm={() => remove.mutate(removeFor.userId)} t={t}
        />
      ) : null}
      {shareUrl ? <InviteLinkDialog url={shareUrl} t={t} onClose={() => setShareUrl(null)} onCopied={() => flash(t('team.linkCopied'))} /> : null}

      {toast ? (
        <div style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 60, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', fontSize: 13, fontWeight: 600 }}>
          <span style={{ color: 'var(--success)', display: 'inline-flex' }}><Check /></span>{toast}
        </div>
      ) : null}
    </div>
  )
}

function RolePill({ role, roleName }: { role?: RoleItem; roleName: string }) {
  const colour = role?.colour || 'var(--brand-int)'
  return <span className="st" style={{ color: colour, background: 'var(--brand-soft)' }}>{roleName}</span>
}

function StatusPill({ status, t }: { status: TeamStatus; t: (k: MessageKey) => string }) {
  if (status === 'ACTIVE') return <span className="st st-ok"><span className="d" />{t('team.active')}</span>
  if (status === 'SUSPENDED') return <span className="st st-low" style={{ color: 'var(--danger)' }}><span className="d" />{t('team.suspended')}</span>
  if (status === 'EXPIRED') return <span className="st st-neutral"><span className="d" />{t('team.expired')}</span>
  return <span className="st st-low"><span className="d" />{t('team.pending')}</span>
}

function TeamRow({ entry, role, isSelf, t, lang, onChangeRole, onRemove, onToggleActive, onResend, onCancel }: {
  entry: TeamEntry; role?: RoleItem; isSelf: boolean; t: (k: MessageKey) => string; lang: string
  onChangeRole: () => void; onRemove: () => void; onToggleActive: (active: boolean) => void
  onResend: () => void; onCancel: () => void
}) {
  const isMember = entry.kind === 'member'
  const isOwner = entry.member?.role === 'OWNER'

  const items: { label: string; onClick: () => void; danger?: boolean }[] = []
  if (isMember) {
    if (!isOwner) items.push({ label: t('team.changeRole'), onClick: onChangeRole })
    if (!isOwner && !isSelf) {
      if (entry.status === 'SUSPENDED') items.push({ label: t('team.reactivate'), onClick: () => onToggleActive(true) })
      else if (entry.status === 'ACTIVE') items.push({ label: t('team.deactivate'), onClick: () => onToggleActive(false) })
      items.push({ label: t('team.remove'), onClick: onRemove, danger: true })
    }
  } else {
    // Resend regenerates + returns the link, which we then surface for sharing.
    items.push({ label: t('team.resendShare'), onClick: onResend })
    items.push({ label: t('team.cancelInvite'), onClick: onCancel, danger: true })
  }

  return (
    <tr>
      <td>
        <div className="cell">
          <div className="th" style={isMember ? { background: 'var(--brand-soft)', color: 'var(--brand-int)' } : { borderStyle: 'dashed' }}>
            {isMember ? initials(entry.title) : initials(entry.invite?.email || entry.invite?.phone, '@')}
          </div>
          <div>
            <div className="nm">{entry.title}{isSelf ? <span className="chip-tag" style={{ fontSize: 9.5, marginLeft: 6 }}>{t('team.you')}</span> : null}</div>
            <div className="sub">{entry.sub}</div>
          </div>
        </div>
      </td>
      <td><RolePill role={role} roleName={entry.roleName} /></td>
      <td><StatusPill status={entry.status} t={t} /></td>
      <td className="sub" style={{ color: 'var(--text-2)' }}>{isMember ? fmtDate(entry.joinedAt, lang) : '—'}</td>
      <td className="right">{items.length ? <ActionMenu items={items} /> : <span className="sub" style={{ color: 'var(--text-muted)' }}>—</span>}</td>
    </tr>
  )
}

// Share menu for a freshly created / resent invite link. navigator.share on the web;
// WhatsApp / Email / Copy everywhere (Electron routes window.open to the OS default app).
function InviteLinkDialog({ url, t, onClose, onCopied }: {
  url: string; t: (k: MessageKey) => string; onClose: () => void; onCopied: () => void
}) {
  const businessName = useSessionStore((s) => s.status.businessName) || t('team.ourTeam')
  const shareText = t('team.shareText').replace('{business}', businessName)
  const copy = async () => { if (await copyText(url)) onCopied() }
  const doWhatsapp = () => openExternal(whatsappUrl(`${shareText} ${url}`))
  const doEmail = () => openExternal(mailtoUrl(t('team.shareSubject').replace('{business}', businessName), `${shareText}\n\n${url}`))
  const doNative = () => void webShare({ title: t('team.inviteLinkTitle'), text: shareText, url })
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 460 }}>
        <div className="modal-head"><h2>{t('team.inviteLinkTitle')}</h2></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('team.inviteLinkBody')}</div>
          <div className="ff">
            <label className="lbl2">{t('team.inviteLink')}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} style={{ fontFamily: 'monospace', fontSize: 12 }} />
              <Button variant="soft" type="button" onClick={copy} style={{ flexShrink: 0 }}>{t('team.copyLink')}</Button>
            </div>
          </div>
          <div>
            <div className="lbl2" style={{ marginBottom: 8 }}>{t('team.shareVia')}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="soft" type="button" onClick={doWhatsapp}>{t('team.whatsapp')}</Button>
              <Button variant="soft" type="button" onClick={doEmail}>{t('team.emailShare')}</Button>
              {canWebShare() ? <Button variant="soft" type="button" onClick={doNative}>{t('team.shareMore')}</Button> : null}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <Button variant="primary" type="button" onClick={onClose}>{t('team.done')}</Button>
        </div>
      </div>
    </div>
  )
}

function InviteModal({ roles, onClose, onSent, onError, t }: {
  roles: RoleItem[]; onClose: () => void; onSent: (res: SendInviteResponse) => void; onError: (m: string) => void; t: (k: MessageKey) => string
}) {
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '')
  const [roleLabel, setRoleLabel] = useState(roles[0]?.name ?? '')
  const [channel, setChannel] = useState<'email' | 'phone'>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const send = useMutation({
    mutationFn: () => dataClient.team.sendInvite({ roleId, email: channel === 'email' ? email.trim() : undefined, phone: channel === 'phone' ? phone : undefined }),
    onSuccess: onSent,
    onError: (e) => onError(errorMessage(e, t('team.actionError'))),
  })
  const valid = !!roleId && (channel === 'email' ? isValidEmail(email.trim()) : isValidPhone(phone))
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 440 }}>
        <div className="modal-head"><h2>{t('team.inviteTitle')}</h2></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div className="ff">
            <label className="lbl2">{t('team.role')}</label>
            <RoleSelect value={roleId || null} label={roleLabel} onChange={(id, lbl) => { setRoleId(id ?? ''); setRoleLabel(lbl ?? '') }} />
          </div>
          <div className="ff">
            <label className="lbl2">{t('team.sendVia')}</label>
            <span className="seg-pick">
              <button type="button" aria-pressed={channel === 'email'} onClick={() => setChannel('email')}>{t('team.email')}</button>
              <button type="button" aria-pressed={channel === 'phone'} onClick={() => setChannel('phone')}>{t('team.phone')}</button>
            </span>
          </div>
          {channel === 'email' ? (
            <div className="ff"><label className="lbl2">{t('team.email')}</label><Input type="email" value={email} placeholder="staff@business.cm" onChange={(e) => setEmail(e.target.value)} /></div>
          ) : (
            <div className="ff"><label className="lbl2">{t('team.phone')}</label><PhoneInput value={phone || undefined} defaultCountry="CM" placeholder="6 78 22 14 02" onChange={(v) => setPhone(v ?? '')} /></div>
          )}
        </div>
        <div className="modal-foot">
          <Button variant="soft" type="button" onClick={onClose}>{t('team.cancel')}</Button>
          <Button variant="primary" type="button" loading={send.isPending} disabled={!valid} onClick={() => send.mutate()}>{t('team.sendInvite')}</Button>
        </div>
      </div>
    </div>
  )
}

function ChangeRoleModal({ member, onClose, onSaved, onError, t }: {
  member: TeamMember; onClose: () => void; onSaved: () => void; onError: (m: string) => void; t: (k: MessageKey) => string
}) {
  const [roleId, setRoleId] = useState(member.roleId)
  const [roleLabel, setRoleLabel] = useState(member.roleName)
  const save = useMutation({
    mutationFn: () => dataClient.team.updateMemberRole(member.userId, roleId),
    onSuccess: onSaved,
    onError: (e) => onError(errorMessage(e, t('team.actionError'))),
  })
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 400 }}>
        <div className="modal-head"><h2>{t('team.changeRoleTitle')}</h2></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('team.changeRoleBody').replace('{name}', member.name ?? member.email ?? '')}</div>
          <div className="ff">
            <label className="lbl2">{t('team.role')}</label>
            <RoleSelect value={roleId} label={roleLabel} onChange={(id, lbl) => { setRoleId(id ?? member.roleId); setRoleLabel(lbl ?? member.roleName) }} />
          </div>
        </div>
        <div className="modal-foot">
          <Button variant="soft" type="button" onClick={onClose}>{t('team.cancel')}</Button>
          <Button variant="primary" type="button" loading={save.isPending} disabled={roleId === member.roleId} onClick={() => save.mutate()}>{t('team.save')}</Button>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ title, body, confirmLabel, pending, onCancel, onConfirm, t }: {
  title: string; body: string; confirmLabel: string; pending: boolean; onCancel: () => void; onConfirm: () => void; t: (k: MessageKey) => string
}) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 400 }}>
        <div className="modal-head"><h2>{title}</h2></div>
        <div className="modal-body" style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{body}</div>
        <div className="modal-foot">
          <Button variant="soft" type="button" onClick={onCancel}>{t('team.cancel')}</Button>
          <Button variant="primary" type="button" loading={pending} onClick={onConfirm} style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}
