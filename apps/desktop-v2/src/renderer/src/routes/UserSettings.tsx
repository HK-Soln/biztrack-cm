import { Fragment, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import { AppearanceSection } from '@/components/settings/AppearanceSection'

// User settings — personal, per-user preferences (separate from the business-level
// /settings page). Appearance is fully functional (theme store); Security (password
// + 2FA) is a coming-soon stub for now.

type SectionKey = 'appearance' | 'security'
const SECTION_KEYS: SectionKey[] = ['appearance', 'security']

const ICO: Record<string, ReactNode> = {
  palette: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="13.5" cy="6.5" r="1.5" /><circle cx="17" cy="11" r="1.5" /><circle cx="8" cy="7.5" r="1.5" /><circle cx="6.5" cy="12" r="1.5" /><path d="M12 22a10 10 0 0 1 0-20c5 0 8 3 8 7 0 3-3 4-5 4h-2a2 2 0 0 0 0 4 2 2 0 0 1-1 5Z" /></svg>,
  lock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
}

const NAV_GROUPS: Array<{ label: MessageKey; items: Array<{ key: SectionKey; label: MessageKey; icon: ReactNode }> }> = [
  { label: 'user.grpPreferences', items: [{ key: 'appearance', label: 'user.appearance', icon: ICO.palette }] },
  { label: 'user.grpSecurity', items: [{ key: 'security', label: 'user.security', icon: ICO.lock }] },
]

export function UserSettings() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const initial = params.get('section')
  const [section, setSection] = useState<SectionKey>(
    initial && (SECTION_KEYS as string[]).includes(initial) ? (initial as SectionKey) : 'appearance',
  )

  function selectSection(key: SectionKey) {
    setSection(key)
    setParams(key === 'appearance' ? {} : { section: key }, { replace: true })
  }

  return (
    <div className="frame">
      <div className="page-head">
        <div><h1>{t('user.title')}</h1><p>{t('user.subtitle')}</p></div>
      </div>

      <div className="settings">
        <nav className="set-nav">
          {NAV_GROUPS.map((g) => (
            <Fragment key={g.label}>
              <div className="grp-l">{t(g.label)}</div>
              {g.items.map((it) => (
                <button key={it.key} type="button" className={section === it.key ? 'active' : undefined} onClick={() => selectSection(it.key)}>
                  {it.icon}<span>{t(it.label)}</span>
                </button>
              ))}
            </Fragment>
          ))}
        </nav>

        <div>
          {section === 'appearance' ? (
            <AppearanceSection />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="banner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg><span>{t('user.securitySoon')}</span></div>
              <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 6 }}>{t('user.security')}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{t('settings.soonDesc')}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
