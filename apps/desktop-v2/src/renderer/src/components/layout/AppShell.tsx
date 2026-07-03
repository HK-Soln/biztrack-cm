import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Icon, TABS, filterNav, isGroup, type NavEntry, type NavLeaf } from '@/lib/nav'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { useSyncStatus } from '@/lib/useSyncStatus'
import { dataClient, isElectron } from '@/lib/data-client'
import { useThemeStore } from '@/stores/theme.store'
import { useLangStore, useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import { useSessionStore } from '@/stores/session.store'
import { isWindows, syncTitleBarOverlay } from '@/lib/titlebar'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { NotificationToasts } from '@/components/notifications/NotificationToasts'
import { useNotificationsStore } from '@/stores/notifications.store'

const ROLE_LABEL: Record<string, MessageKey> = {
  OWNER: 'selectBiz.role.owner',
  MANAGER: 'selectBiz.role.manager',
  CASHIER: 'selectBiz.role.cashier',
  ACCOUNTANT: 'selectBiz.role.accountant',
}

function initials(name?: string | null): string {
  if (!name) return '—'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

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

function NavGroup({ entry, rail }: { entry: Extract<NavEntry, { children: unknown }>; rail?: boolean }) {
  const t = useT()
  const { pathname } = useLocation()
  const hasActiveChild = entry.children.some((c) => pathname === c.to || pathname.startsWith(c.to + '/'))
  const [open, setOpen] = useState(hasActiveChild)
  // Icon-rail flyout: children are hidden in the rail, so a click opens a fixed popover
  // (fixed so it escapes the .nav overflow clip) listing the child links with labels.
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (hasActiveChild && !rail) setOpen(true)
  }, [hasActiveChild, rail])

  useEffect(() => {
    if (!pos) return
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node
      if (btnRef.current?.contains(n) || popRef.current?.contains(n)) return
      setPos(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null) }
    const onScroll = () => setPos(null)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onScroll)
    }
  }, [pos])

  if (rail) {
    return (
      <div className="nav-grp">
        <button
          ref={btnRef}
          type="button"
          className={`nav-item${hasActiveChild ? ' active' : ''}`}
          title={t(entry.label)}
          aria-label={t(entry.label)}
          onClick={() => {
            if (pos) { setPos(null); return }
            const r = btnRef.current?.getBoundingClientRect()
            if (r) setPos({ top: r.top, left: r.right + 6 })
          }}
        >
          {Icon[entry.icon]}
          <span className="lab">{t(entry.label)}</span>
        </button>
        {pos ? (
          <div ref={popRef} className="nav-flyout" role="menu" style={{ top: pos.top, left: pos.left }}>
            <div className="nav-flyout-h">{t(entry.label)}</div>
            {entry.children.map((c) => (
              <NavLink
                key={c.to}
                to={c.to}
                end={c.to === '/'}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                onClick={() => setPos(null)}
              >
                {c.icon ? Icon[c.icon] : <span style={{ width: 16 }} />}
                <span className="lab">{t(c.label)}</span>
                {c.badge ? <span className="badge-a">{t(c.badge)}</span> : null}
              </NavLink>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

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

function Sidebar({
  rail,
  collapsible,
  collapsed,
  onToggle,
}: {
  rail?: boolean
  collapsible?: boolean
  collapsed?: boolean
  onToggle?: () => void
}) {
  const t = useT()
  const isOwner = (useSessionStore((s) => s.status.user?.role) ?? '').toUpperCase() === 'OWNER'
  return (
    <aside className={`sidebar${rail ? ' rail' : ''}`}>
      {collapsible ? (
        <button
          type="button"
          className="sb-collapse app-no-drag"
          onClick={onToggle}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <path d="m14 6-6 6 6 6" />
          </svg>
        </button>
      ) : null}
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
        {filterNav(isOwner).map((entry, i) =>
          isGroup(entry) ? (
            <NavGroup key={`g${i}`} entry={entry} rail={rail} />
          ) : (
            <NavLeafLink key={entry.to} {...entry} />
          ),
        )}
      </nav>
      <UserMenu />
    </aside>
  )
}

function UserMenu() {
  const t = useT()
  const logout = useSessionStore((s) => s.logout)
  const user = useSessionStore((s) => s.status.user)
  const businessName = useSessionStore((s) => s.status.businessName)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const roleLabel = user?.role ? t(ROLE_LABEL[user.role.toUpperCase()] ?? 'selectBiz.role.member') : null
  const secondary = roleLabel ? `${roleLabel} · ${businessName ?? ''}` : (businessName ?? '')
  const contact = user?.email || user?.phone || ''

  return (
    <div className="sb-foot" ref={ref}>
      {open ? (
        <div className="sb-menu" role="menu">
          <div className="sb-menu-head">
            <span className="sb-av">{initials(user?.name)}</span>
            <span className="meta">
              <span className="nm">{user?.name || '—'}</span>
              {contact ? <span className="ct">{contact}</span> : null}
            </span>
          </div>
          {businessName ? <div className="sb-menu-biz">{businessName}</div> : null}
          <NavLink to="/profile" className="sb-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
            {t('usermenu.profile')}
          </NavLink>
          <button type="button" className="sb-menu-item danger" role="menuitem" onClick={() => void logout()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5M21 12H9" />
            </svg>
            {t('usermenu.signOut')}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className={`sb-user${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="sb-av">{initials(user?.name)}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="nm" style={{ display: 'block' }}>
            {user?.name || '—'}
          </span>
          <span className="rl" style={{ display: 'block' }}>
            {secondary}
          </span>
        </span>
        <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>
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

// Re-render every `intervalMs` so relative timestamps + day countdowns stay fresh.
function useNowTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

function relativeSync(iso: string | null, now: number, t: (k: MessageKey) => string): string {
  if (!iso) return t('top.neverSynced')
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (sec < 45) return t('top.justNow')
  const min = Math.round(sec / 60)
  if (min < 60) return t('top.minAgo').replace('{n}', String(min))
  const hr = Math.round(min / 60)
  if (hr < 24) return t('top.hrAgo').replace('{n}', String(hr))
  return t('top.dayAgo').replace('{n}', String(Math.round(hr / 24)))
}

function TopBar() {
  const t = useT()
  const businessName = useSessionStore((s) => s.status.businessName)
  const sync = useSyncStatus()
  const now = useNowTick(30_000)
  const lastSync =
    sync.state === 'syncing'
      ? `${t('sync.syncing')}…`
      : `${t('top.lastSyncLabel')} ${relativeSync(sync.lastSyncedAt, now, t)}`
  return (
    <header className="topbar app-drag" style={isWindows && isElectron ? { paddingRight: 138 } : undefined}>
      <button type="button" className="biz app-no-drag">
        <span className="biz-tile">{initials(businessName)}</span>
        <span>
          <span className="nm">{businessName || 'BizTrack CM'}</span>
          <span className="sub">{isElectron && lastSync}</span>
        </span>
      </button>
      <PlanChip now={now} />
      <div className="tb-right">
        {
          isElectron  && <SyncIndicator />
        }
        <NotificationBell />
        <LanguageToggle />
        <ModeToggle />
      </div>
    </header>
  )
}

function PlanChip({ now }: { now: number }) {
  const t = useT()
  const q = useQuery({
    queryKey: ['plans', 'subscription'],
    queryFn: () => dataClient.plans.subscription(),
    enabled: isElectron,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  const sub = q.data
  if (!sub) return null

  const expiryIso = sub.cancelAtPeriodEnd
    ? sub.currentPeriodEnd
    : sub.status === 'TRIAL'
      ? sub.trialEndsAt
      : sub.currentPeriodEnd
  const daysLeft = expiryIso ? Math.ceil((new Date(expiryIso).getTime() - now) / 86_400_000) : null
  const showExp = daysLeft != null && daysLeft <= 30

  return (
    <span className="tb-chip">
      {sub.plan} {t('top.plan')}
      {showExp ? (
        <span className={`tb-exp${daysLeft <= 7 ? ' danger' : ''}`}>
          {daysLeft <= 0 ? t('top.expired') : t('top.expiresInDays').replace('{n}', String(daysLeft))}
        </span>
      ) : null}
    </span>
  )
}

function SyncIndicator() {
  const t = useT()
  const s = useSyncStatus()
  // After a successful manual sync, throttle the button for 60s — but re-enable early
  // if a new outbox event arrives (pending count rises), whichever comes first.
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const prevPending = useRef(s.pendingCount)

  useEffect(() => {
    if (cooldownUntil == null) return
    const id = window.setTimeout(() => setCooldownUntil(null), Math.max(0, cooldownUntil - Date.now()))
    return () => window.clearTimeout(id)
  }, [cooldownUntil])

  useEffect(() => {
    if (cooldownUntil != null && s.pendingCount > prevPending.current) setCooldownUntil(null)
    prevPending.current = s.pendingCount
  }, [s.pendingCount, cooldownUntil])

  if (s.deadCount > 0) {
    return (
      <button
        type="button"
        className="tb-sync app-no-drag"
        style={{ color: 'var(--danger)', background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
        title={t('sync.retry')}
        onClick={() => void dataClient.sync.retry()}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
        {t('sync.needsAttention').replace('{n}', String(s.deadCount))}
      </button>
    )
  }

  const syncing = s.state === 'syncing'
  const cooling = cooldownUntil != null
  const disabled = syncing || cooling
  const label = syncing ? t('sync.syncing') : s.state === 'error' ? t('sync.error') : t('top.synced')

  async function onSync(full = false) {
    if (disabled) return
    try {
      // Shift/Alt-click = full resync (reset the pull cursor + re-pull everything from
      // the server). Recovers from a wiped/diverged local DB; the normal click is the
      // incremental push+pull.
      await (full ? dataClient.sync.fullSync() : dataClient.sync.trigger())
      setCooldownUntil(Date.now() + 60_000)
    } catch {
      /* leave the button enabled so they can retry */
    }
  }

  return (
    <button
      type="button"
      className="tb-sync app-no-drag"
      style={{ background: 'none', border: 0, font: 'inherit', cursor: disabled ? 'default' : 'pointer', ...(s.state === 'error' ? { color: 'var(--danger)' } : {}) }}
      title={cooling ? t('sync.justSynced') : t('sync.syncNow')}
      disabled={disabled}
      onClick={(e) => void onSync(e.shiftKey || e.altKey)}
    >
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className={syncing ? 'spin' : undefined}>
        <path d="M16 3v4h-4M4 17v-4h4" />
        <path d="M15 8A6 6 0 0 0 5 5L4 7M5 12a6 6 0 0 0 10 3l1-2" />
      </svg>
      {label}
    </button>
  )
}

function MobileTopBar() {
  const t = useT()
  const businessName = useSessionStore((s) => s.status.businessName)
  return (
    <header className="m-topbar app-drag">
      <div className="logo">
        B<span className="pip" />
      </div>
      <div className="m-tt">
        <div className="m-title">{businessName || 'BizTrack CM'}</div>
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

const SIDEBAR_COLLAPSED_KEY = 'biztrack.sidebar.collapsed'

export function AppShell() {
  const bp = useBreakpoint()
  const { pathname } = useLocation()
  const mode = useThemeStore((s) => s.mode)
  const palette = useThemeStore((s) => s.palette)
  const chrome = useThemeStore((s) => s.chrome)
  const resolvedDark = useThemeStore((s) => s.resolvedDark)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  useEffect(() => {
    const id = requestAnimationFrame(syncTitleBarOverlay)
    return () => cancelAnimationFrame(id)
  }, [mode, palette, chrome, resolvedDark])

  // Realtime in-app notifications: (re)connect the socket for this user, load the
  // feed, and subscribe to live pushes (toast + bell). AppShell only mounts when
  // authenticated, so this is the right place to open the connection.
  useEffect(() => {
    void dataClient.notifications.connect()
    void useNotificationsStore.getState().load()
    const off = dataClient.notifications.onEvent((payload) => {
      useNotificationsStore.getState().receive(payload.notification, payload.unreadCount)
    })
    return off
  }, [])

  if (bp === 'mobile') {
    // Some routes render their own full-bleed header (home's m-hero, Sell's m-head),
    // so they own the top of the screen — suppress the generic mobile top bar there.
    const OWN_HEADER = new Set([
      '/',
      '/sell',
      '/products',
      '/products/categories',
      '/products/units',
      '/products/brands',
      '/products/attributes',
      '/inventory',
      '/sales',
      '/contacts',
      '/online/orders',
      '/expenses',
      '/deposits',
      '/team',
      '/roles',
      '/settings',
      '/more',
    ])
    // Reports owns its header on both the library index and the /reports/:id viewer.
    const ownsHeader = OWN_HEADER.has(pathname) || pathname.startsWith('/reports')
    return (
      <div className="m-shell">
        {ownsHeader ? null : <MobileTopBar />}
        <div className="m-content">
          <Outlet />
        </div>
        <TabBar />
        <NotificationToasts />
      </div>
    )
  }

  return (
    <div className="layout">
      <Sidebar
        rail={bp === 'tablet' || collapsed}
        collapsible={bp === 'desktop'}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <div className="maincol">
        <TopBar />
        <div className="content">
          <Outlet />
        </div>
      </div>
      <NotificationToasts />
    </div>
  )
}
