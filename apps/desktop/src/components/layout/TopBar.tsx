'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { Link, usePathname } from '@/i18n/navigation'
import { type Locale, routing } from '@/i18n/routing'
import { useSyncSnapshot } from '@/hooks/useSyncSnapshot'
import { cn } from '@/lib/utils'
import { ipc, hasDesktopIpc } from '@/services/ipc.bridge'
import { type LocalBusiness, getLocalBusinesses } from '@/services/local-businesses.local'
import { selectBusiness, getAuthTokens } from '@/services/auth.api'
import { useAuthStore } from '@/stores/auth.store'
import { usePlanStore } from '@/stores/plan.store'

function getInitials(name: string | null): string {
  if (!name) return 'BT'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function TopBar() {
  const t = useTranslations('topbar')
  const locale = useLocale()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isLocaleMenuOpen, setIsLocaleMenuOpen] = useState(false)
  const [isBusinessMenuOpen, setIsBusinessMenuOpen] = useState(false)
  const [localBusinesses, setLocalBusinesses] = useState<LocalBusiness[]>([])
  const [isSwitching, setIsSwitching] = useState(false)
  const { snapshot, trigger } = useSyncSnapshot()
  const planState = usePlanStore((state) => state.current)
  const businessName = useAuthStore((state) => state.businessName)
  const businessId = useAuthStore((state) => state.businessId)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const setTokens = useAuthStore((state) => state.setTokens)
  const localeMenuRef = useRef<HTMLDivElement | null>(null)
  const businessMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!hasDesktopIpc() || !userId) return
    getLocalBusinesses(userId).then(setLocalBusinesses).catch(() => {})
  }, [userId])

  useEffect(() => {
    if (!isLocaleMenuOpen && !isBusinessMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      const insideLocaleMenu = localeMenuRef.current?.contains(target)
      const insideBusinessMenu = businessMenuRef.current?.contains(target)

      if (!insideLocaleMenu && !insideBusinessMenu) {
        setIsLocaleMenuOpen(false)
        setIsBusinessMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLocaleMenuOpen(false)
        setIsBusinessMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isLocaleMenuOpen, isBusinessMenuOpen])

  const handleSwitchBusiness = async (targetBusinessId: string) => {
    if (targetBusinessId === businessId || isSwitching) return
    setIsSwitching(true)
    setIsBusinessMenuOpen(false)
    try {
      const response = await selectBusiness({ businessId: targetBusinessId })
      const tokens = getAuthTokens(response)
      if (tokens) {
        await setTokens(tokens)
        router.push(`/${locale}/`)
      }
    } catch {
      // silently fail — user stays on current business
    } finally {
      setIsSwitching(false)
    }
  }

  const isDark = resolvedTheme === 'dark'
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark')
  const isDesktopRuntime = hasDesktopIpc()
  const platform = mounted ? ipc.app.platform : ''
  const isWin32 = platform === 'win32'
  const currentLocale: Locale = locale.startsWith('fr') ? 'fr' : 'en'
  const canSwitch = localBusinesses.length > 1 && snapshot.network.online && !isSwitching

  const lastSyncLabel = snapshot.lastSyncedAt
    ? new Intl.DateTimeFormat(currentLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(snapshot.lastSyncedAt),
      )
    : t('never')
  const activePlanLabel = planState ? t('plan_label', { plan: planState.effectivePlan }) : null
  const trialDaysRemaining =
    planState?.trialEndsAt && planState.status === 'TRIAL'
      ? Math.max(
          0,
          Math.ceil((new Date(planState.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
        )
      : 0
  const localeLabels: Record<Locale, string> = {
    en: t('languages.en'),
    fr: t('languages.fr'),
  }

  const headerClassName = cn(
    'relative z-40 isolate flex min-h-[68px] flex-wrap items-center gap-3 border-b border-[var(--top-border)] bg-[var(--top-bg)] px-4 py-3 text-[var(--top-fg)]',
    isDesktopRuntime && 'app-drag',
    isDesktopRuntime && isWin32 && 'pr-[138px]',
  )

  const brandTileClassName =
    'flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--top-logo-bg)] text-sm font-bold text-[var(--top-logo-fg)]'

  const brandSubtitleClassName = 'truncate text-xs text-[var(--top-muted)]'

  const passiveChipClassName =
    'inline-flex items-center gap-2 rounded-full border border-[var(--top-border)] bg-[var(--top-hover)] px-3 py-1.5 text-xs text-[var(--top-fg-strong)]'

  const chromeButtonClassName =
    'inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--top-border)] bg-[var(--top-hover)] px-3 text-sm font-medium text-[var(--top-fg-strong)] transition hover:bg-[var(--top-hover)] hover:brightness-110'

  const iconButtonClassName =
    'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--top-border)] bg-[var(--top-hover)] text-[var(--top-fg-strong)] transition hover:brightness-110'

  const syncButtonClassName = cn(
    'inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
    snapshot.status === 'synced'
      ? 'border-transparent bg-[rgb(var(--chart-2))]/15 text-[rgb(var(--chart-2))] hover:bg-[rgb(var(--chart-2))]/25'
      : snapshot.status === 'error'
        ? 'border-transparent bg-destructive/15 text-destructive hover:bg-destructive/25'
        : snapshot.status === 'paused'
          ? 'border-transparent bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 dark:text-amber-300'
          : 'border-[var(--top-border)] bg-[var(--top-hover)] text-[var(--top-fg-strong)] hover:brightness-110',
  )

  const syncButtonLabel =
    snapshot.status === 'syncing'
      ? t('syncing')
      : snapshot.status === 'synced'
        ? t('status.synced')
        : snapshot.status === 'error'
          ? t('status.error')
          : snapshot.status === 'paused'
            ? t('status.paused')
            : t('sync_now')


  return (
    <header className={headerClassName}>
      <div ref={businessMenuRef} className="app-no-drag relative flex min-w-0 max-w-[260px] shrink-0 items-center">
        {canSwitch ? (
          <button
            type="button"
            onClick={() => {
              setIsBusinessMenuOpen((prev) => !prev)
            }}
            aria-expanded={isBusinessMenuOpen}
            aria-haspopup="menu"
            className="flex items-center gap-3 rounded-xl px-2 py-1.5 -mx-2 -my-1.5 transition hover:bg-[var(--top-hover)]"
          >
            <div className={brandTileClassName}>{getInitials(businessName)}</div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-sm font-semibold">
                <span className="truncate">{(businessName ?? t('business_fallback')).slice(0, 23) + (((businessName ?? t('business_fallback')).length) > 23 ? '...' : '')}</span>
                <svg
                  viewBox="0 0 20 20"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={cn('shrink-0 transition-transform', isBusinessMenuOpen ? 'rotate-180' : '')}
                >
                  <path d="m5 7 5 5 5-5" />
                </svg>
              </div>
              <div className={brandSubtitleClassName}>
                {isDesktopRuntime ? t('last_sync', { time: lastSyncLabel }) : t('desktop_only_subtitle')}
              </div>
            </div>
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <div className={cn(brandTileClassName, isSwitching ? 'animate-pulse' : '')}>
              {getInitials(businessName)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{(businessName ?? t('business_fallback')).slice(0, 23) + (((businessName ?? t('business_fallback')).length) > 23 ? '...' : '')}</div>
              <div className={brandSubtitleClassName}>
                {isDesktopRuntime ? t('last_sync', { time: lastSyncLabel }) : t('desktop_only_subtitle')}
              </div>
            </div>
          </div>
        )}

        {isBusinessMenuOpen ? (
          <div className="absolute left-0 top-[calc(100%+0.75rem)] z-[80] min-w-[240px] rounded-2xl border border-border bg-card p-2 shadow-xl">
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t('switch_business_title')}
            </p>
            {localBusinesses.map((biz) => {
              const active = biz.id === businessId
              return (
                <button
                  key={biz.id}
                  type="button"
                  onClick={() => void handleSwitchBusiness(biz.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition',
                    active ? 'bg-accent text-primary' : 'text-foreground hover:bg-secondary',
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{biz.name}</div>
                    {biz.city ? (
                      <div className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        {biz.city}
                      </div>
                    ) : null}
                  </div>
                  {active ? (
                    <svg
                      viewBox="0 0 20 20"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="shrink-0"
                    >
                      <path d="m4.5 10 3.5 3.5 7-7" />
                    </svg>
                  ) : null}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      <div className="app-no-drag flex flex-wrap items-center gap-2 text-xs">
        
        {isDesktopRuntime && activePlanLabel ? (
          <span className={passiveChipClassName}>
            {activePlanLabel}
          </span>
        ) : null}
        {isDesktopRuntime && planState?.isStale ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            {t('plan_stale')}
          </span>
        ) : null}
        {isDesktopRuntime && trialDaysRemaining > 0 && !planState?.offlineExpiredFallback ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--top-border)] bg-[var(--top-hover)] px-3 py-1.5 text-xs font-medium text-[var(--top-fg-strong)]">
            {t('trial_days_left', { count: trialDaysRemaining })}
          </span>
        ) : null}
      </div>

      <div className="app-no-drag ml-auto mr-4 flex flex-wrap items-center gap-2">
        {isDesktopRuntime ? (
          <button
            type="button"
            onClick={() => void trigger()}
            disabled={snapshot.status === 'syncing'}
            className={syncButtonClassName}
          >
            <svg
              viewBox="0 0 20 20"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={cn(snapshot.status === 'syncing' ? 'animate-spin' : '')}
            >
              <path d="M16 3v4h-4" />
              <path d="M4 17v-4h4" />
              <path d="M15 8A6 6 0 0 0 5 5l-1 2" />
              <path d="M5 12a6 6 0 0 0 10 3l1-2" />
            </svg>
            <span>{syncButtonLabel}</span>
          </button>
        ) : null}

        {mounted ? (
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? t('theme_to_light') : t('theme_to_dark')}
            className={iconButtonClassName}
          >
            {isDark ? (
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <line x1="12" y1="2" x2="12" y2="5" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" />
                <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
                <line x1="2" y1="12" x2="5" y2="12" />
                <line x1="19" y1="12" x2="22" y2="12" />
                <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
                <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
              </svg>
            )}
          </button>
        ) : null}

        <div ref={localeMenuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setIsLocaleMenuOpen((current) => !current)
              setIsBusinessMenuOpen(false)
            }}
            aria-expanded={isLocaleMenuOpen}
            aria-haspopup="menu"
            className={chromeButtonClassName}
          >
            <svg
              viewBox="0 0 20 20"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="10" cy="10" r="6.5" />
              <path d="M3.5 10h13" />
              <path d="M10 3.5a10.5 10.5 0 0 1 0 13" />
              <path d="M10 3.5a10.5 10.5 0 0 0 0 13" />
            </svg>
            <span className="text-xs font-semibold uppercase">{currentLocale}</span>
            <svg
              viewBox="0 0 20 20"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={cn('transition-transform', isLocaleMenuOpen ? 'rotate-180' : '')}
            >
              <path d="m5 7 5 5 5-5" />
            </svg>
          </button>

          {isLocaleMenuOpen ? (
            <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[80] min-w-[210px] rounded-2xl border border-border bg-card p-2 shadow-xl">
              {routing.locales.map((language) => {
                const active = currentLocale === language

                return (
                  <Link
                    locale={language}
                    href={searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname}
                    key={language}
                    onClick={() => setIsLocaleMenuOpen(false)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition',
                      active ? 'bg-accent text-primary' : 'text-foreground hover:bg-secondary',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold">{localeLabels[language]}</div>
                      <div className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        {language}
                      </div>
                    </div>
                    {active ? (
                      <svg
                        viewBox="0 0 20 20"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m4.5 10 3.5 3.5 7-7" />
                      </svg>
                    ) : null}
                  </Link>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
