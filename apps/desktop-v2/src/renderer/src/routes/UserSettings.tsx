import { Fragment, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import { AppearanceSection } from '@/components/settings/AppearanceSection'
import { UserProfileSection } from '@/components/settings/UserProfileSection'
import { UserSecuritySection } from '@/components/settings/UserSecuritySection'

// User settings — personal, per-user (separate from business /settings). Profile +
// Security are prototypes (no auth wiring yet); Appearance is fully functional.

type SectionKey = 'profile' | 'security' | 'appearance'
const SECTION_KEYS: SectionKey[] = ['profile', 'security', 'appearance']

const ICO: Record<string, ReactNode> = {
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>,
  palette: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="13.5" cy="6.5" r="1.5" /><circle cx="17" cy="11" r="1.5" /><circle cx="8" cy="7.5" r="1.5" /><circle cx="6.5" cy="12" r="1.5" /><path d="M12 22a10 10 0 0 1 0-20c5 0 8 3 8 7 0 3-3 4-5 4h-2a2 2 0 0 0 0 4 2 2 0 0 1-1 5Z" /></svg>,
  lock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
}

const NAV_GROUPS: Array<{ label: MessageKey; items: Array<{ key: SectionKey; label: MessageKey; icon: ReactNode }> }> = [
  {
    label: 'user.grpAccount',
    items: [
      { key: 'profile', label: 'user.profile', icon: ICO.user },
      { key: 'security', label: 'user.security', icon: ICO.lock },
    ],
  },
  { label: 'user.grpPreferences', items: [{ key: 'appearance', label: 'user.appearance', icon: ICO.palette }] },
]

export function UserSettings() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const initial = params.get('section')
  const [section, setSection] = useState<SectionKey>(
    initial && (SECTION_KEYS as string[]).includes(initial) ? (initial as SectionKey) : 'profile',
  )

  function selectSection(key: SectionKey) {
    setSection(key)
    setParams(key === 'profile' ? {} : { section: key }, { replace: true })
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
          {section === 'profile' ? <UserProfileSection /> : section === 'security' ? <UserSecuritySection /> : <AppearanceSection />}
        </div>
      </div>
    </div>
  )
}
