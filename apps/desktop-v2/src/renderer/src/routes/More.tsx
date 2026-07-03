import { Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import { useSessionStore } from '@/stores/session.store'
import { Icon, TABS, filterNav, isGroup, type NavLeaf } from '@/lib/nav'

// Mobile "More" hub (bottom-tab). Lists every nav destination that isn't already a
// bottom tab — derived from the shared NAV so new routes appear here automatically.
const ROLE_LABEL: Record<string, MessageKey> = {
  OWNER: 'selectBiz.role.owner',
  MANAGER: 'selectBiz.role.manager',
  CASHIER: 'selectBiz.role.cashier',
  ACCOUNTANT: 'selectBiz.role.accountant',
}

function initials(name?: string | null): string {
  if (!name) return '—'
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '—'
}

export function More() {
  const t = useT()
  const navigate = useNavigate()
  const user = useSessionStore((s) => s.status.user)
  const businessName = useSessionStore((s) => s.status.businessName)
  const logout = useSessionStore((s) => s.logout)

  const isOwner = (user?.role ?? '').toUpperCase() === 'OWNER'
  const roleLabel = user?.role ? t(ROLE_LABEL[user.role.toUpperCase()] ?? 'selectBiz.role.member') : (businessName ?? '')

  // Everything reachable from the bottom tab bar is excluded (incl. /more itself).
  const bottom = new Set(TABS.map((x) => x.to))
  const sections: Array<{ label: MessageKey | null; items: NavLeaf[] }> = []
  let loose: NavLeaf[] = []
  const flush = () => { if (loose.length) { sections.push({ label: null, items: loose }); loose = [] } }
  for (const entry of filterNav(isOwner)) {
    if (isGroup(entry)) {
      flush()
      const items = entry.children.filter((c) => !bottom.has(c.to))
      if (items.length) sections.push({ label: entry.label, items })
    } else if (!bottom.has(entry.to)) {
      loose.push(entry)
    }
  }
  flush()

  const row = (it: NavLeaf) => (
    <button key={it.to} type="button" className="mrow" onClick={() => navigate(it.to)}>
      <div className="th">{it.icon ? Icon[it.icon] : null}</div>
      <div className="mt"><div className="nm">{t(it.label)}</div></div>
      <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m9 6 6 6-6 6" /></svg>
    </button>
  )

  return (
    <>
      <header className="m-hero">
        <div className="row">
          <div className="av">{initials(user?.name)}</div>
          <div className="gt">
            <div className="h">{roleLabel}</div>
            <div className="n">{user?.name || businessName || 'BizTrack CM'}</div>
          </div>
          <button type="button" className="ico" onClick={() => navigate('/settings')} aria-label={t('nav.settings')}>{Icon.settings}</button>
        </div>
      </header>

      {sections.map((sec, i) => (
        <Fragment key={sec.label ?? `loose-${i}`}>
          {sec.label ? <div className="m-sec">{t(sec.label)}</div> : null}
          <div className="mlist" style={{ marginBottom: 18 }}>{sec.items.map(row)}</div>
        </Fragment>
      ))}

      <button type="button" className="mbtn" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => void logout()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
        {t('more.signOut')}
      </button>
    </>
  )
}
