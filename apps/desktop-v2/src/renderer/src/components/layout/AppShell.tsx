import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icon, NAV, TABS, isGroup, type NavEntry, type NavLeaf } from '@/lib/nav'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { useThemeStore } from '@/stores/theme.store'
import { useLangStore, useT } from '@/i18n'
import { isWindows, syncTitleBarOverlay } from '@/lib/titlebar'

function NavLeafLink({ to, label, icon, badge }: NavLeaf) {
  const t = useT()
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
      {icon ? Icon[icon] : <span style={{ width: 16 }} />}
      <span className="lab">{t(label)}</span>
      {badge ? <span className="badge-a">{t(badge)}</span> : null}
    </NavLink>
  )
}

function NavGroup({ entry }: { entry: Extract<NavEntry, { children: unknown }> }) {
  const t = useT()
  const { pathname } = useLocation()
  const hasActiveChild = entry.children.some((c) => pathname === c.to || pathname.startsWith(c.to + '/'))
  const [open, setOpen] = useState(hasActiveChild)
  useEffect(() => {
    if (hasActiveChild) setOpen(true)
  }, [hasActiveChild])
  return (
    <div className={`nav-grp${open ? ' open' : ''}`}>
      <button type="button" className="nav-item" onClick={() => setOpen((o) => !o)}>
        {Icon[entry.icon]}
        <span className="lab">{t(entry.label)}</span>
        <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
      <div className="nav-children">
        {entry.children.map((c) => (
          <NavLeafLink key={c.to} {...c} />
        ))}
      </div>
    </div>
  )
}

function Sidebar({ rail }: { rail?: boolean }) {
  const t = useT()
  return (
    <aside className={`sidebar${rail ? ' rail' : ''}`}>
      <div className="brandmark app-drag">
        <div className="logo">
          B<span className="pip" />
        </div>
        <div>
          <div className="bt">BizTrack CM</div>
          <div className="bs">Point of Sale</div>
        </div>
      </div>
      {!rail ? (
        <div className="search">
          <span className="si">{Icon.search}</span>
          <input placeholder={t('nav.searchPlaceholder')} />
          <kbd>Ctrl K</kbd>
        </div>
      ) : null}
      <div className="nav-sec">{t('nav.workspace')}</div>
      <nav className="nav">
        {NAV.map((entry, i) =>
          isGroup(entry) ? (
            <NavGroup key={`g${i}`} entry={entry} />
          ) : (
            <NavLeafLink key={entry.to} {...entry} />
          ),
        )}
      </nav>
      <div className="sb-foot">
        <button type="button" className="sb-user">
          <span className="sb-av">HA</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="nm" style={{ display: 'block' }}>
              Henson Amah
            </span>
            <span className="rl" style={{ display: 'block' }}>
              Owner · Boutique Mballa
            </span>
          </span>
        </button>
      </div>
    </aside>
  )
}

function ModeToggle() {
  const t = useT()
  const resolvedDark = useThemeStore((s) => s.resolvedDark)
  const setMode = useThemeStore((s) => s.setMode)
  return (
    <button
      type="button"
      className="tb-btn app-no-drag"
      title={t('top.toggleTheme')}
      onClick={() => setMode(resolvedDark ? 'light' : 'dark')}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5 6.5 6.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
      </svg>
    </button>
  )
}

function LanguageToggle() {
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)
  return (
    <button
      type="button"
      className="tb-btn app-no-drag"
      title="Language"
      onClick={() => setLang(lang === 'en' ? 'fr' : 'en')}
    >
      {lang.toUpperCase()}
    </button>
  )
}

function TopBar() {
  const t = useT()
  return (
    <header className="topbar app-drag" style={isWindows ? { paddingRight: 138 } : undefined}>
      <button type="button" className="biz app-no-drag">
        <span className="biz-tile">BM</span>
        <span>
          <span className="nm">Boutique Mballa</span>
          <span className="sub">{t('top.lastSync')}</span>
        </span>
      </button>
      <span className="tb-chip">{t('top.businessPlan')}</span>
      <div className="tb-right">
        <span className="tb-sync">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M16 3v4h-4M4 17v-4h4" />
            <path d="M15 8A6 6 0 0 0 5 5L4 7M5 12a6 6 0 0 0 10 3l1-2" />
          </svg>
          {t('top.synced')}
        </span>
        <LanguageToggle />
        <ModeToggle />
      </div>
    </header>
  )
}

function MobileTopBar() {
  const t = useT()
  return (
    <header className="m-topbar app-drag">
      <div className="logo">
        B<span className="pip" />
      </div>
      <div className="m-tt">
        <div className="m-title">Boutique Mballa</div>
        <div className="m-sub">BizTrack CM · {t('top.synced')}</div>
      </div>
      <LanguageToggle />
      <button type="button" className="m-act app-no-drag">
        {Icon.bell}
      </button>
    </header>
  )
}

function TabBar() {
  const tr = useT()
  return (
    <nav className="tabbar">
      {TABS.map((item) =>
        item.center ? (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `tab sell${isActive ? ' active' : ''}`}>
            <span className="ti">{Icon[item.icon!]}</span>
          </NavLink>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `tab${isActive ? ' active' : ''}`}
          >
            {Icon[item.icon!]}
            <span className="tl">{tr(item.label)}</span>
          </NavLink>
        ),
      )}
    </nav>
  )
}

export function AppShell() {
  const bp = useBreakpoint()
  const mode = useThemeStore((s) => s.mode)
  const palette = useThemeStore((s) => s.palette)
  const chrome = useThemeStore((s) => s.chrome)
  const resolvedDark = useThemeStore((s) => s.resolvedDark)

  useEffect(() => {
    const id = requestAnimationFrame(syncTitleBarOverlay)
    return () => cancelAnimationFrame(id)
  }, [mode, palette, chrome, resolvedDark])

  if (bp === 'mobile') {
    return (
      <div className="m-shell">
        <MobileTopBar />
        <div className="m-content">
          <Outlet />
        </div>
        <TabBar />
      </div>
    )
  }

  return (
    <div className="layout">
      <Sidebar rail={bp === 'tablet'} />
      <div className="maincol">
        <TopBar />
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
