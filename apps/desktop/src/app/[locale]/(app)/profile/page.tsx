'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { KeyRound, RefreshCw, Shield, UserCircle2, WifiOff } from 'lucide-react'
import type { SyncSettings } from '@biztrack/types'
import { Button, Input } from '@biztrack/ui'
import { toast } from 'sonner'
import { useRouter, usePathname } from '@/i18n/navigation'
import { updateCurrentUser } from '@/services/auth.api'
import { upsertLocalUserProfile } from '@/services/local-user-profiles.local'
import { getApiErrorMessage } from '@/services/api-response'
import { cn } from '@/lib/utils'
import { ipc } from '@/services/ipc.bridge'
import { useSyncSnapshot } from '@/hooks/useSyncSnapshot'
import { useAuthStore } from '@/stores/auth.store'

const VALID_TABS = ['profile', 'security', 'mfa', 'sync'] as const
type Tab = (typeof VALID_TABS)[number]

export default function ProfilePage() {
  const t = useTranslations('app.profile')
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const user = useAuthStore((state) => state.user)
  const applyUser = useAuthStore((state) => state.applyUser)

  const rawTab = searchParams.get('tab')
  const activeTab: Tab = VALID_TABS.includes(rawTab as Tab) ? (rawTab as Tab) : 'profile'
  const setActiveTab = (tab: Tab) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`${pathname}?${params.toString()}`)
  }

  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    ipc.network.isOnline().then(setIsOnline)
    ipc.network.onStatusChange(setIsOnline)
  }, [])

  const [name, setName] = useState(user?.name ?? '')
  const [language, setLanguage] = useState(user?.language ?? 'fr')

  useEffect(() => {
    setName(user?.name ?? '')
    setLanguage(user?.language ?? 'fr')
    // Only re-sync when the user identity changes, not on every field edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const [saving, setSaving] = useState(false)

  const handleSaveProfile = useCallback(async () => {
    setSaving(true)
    try {
      const updated = await updateCurrentUser({
        name: name.trim() || undefined,
        language: language || undefined,
      })
      await upsertLocalUserProfile(updated)
      applyUser({
        id: updated.id,
        email: updated.email ?? null,
        phone: updated.phone ?? null,
        name: updated.name,
        avatarUrl: updated.avatarUrl ?? null,
        language: updated.language,
      })
      toast.success(t('save_success'))
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('save_error')))
    } finally {
      setSaving(false)
    }
  }, [name, language, applyUser, t])

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: t('tabs.profile'), icon: <UserCircle2 className="h-4 w-4" strokeWidth={1.75} /> },
    { id: 'security', label: t('tabs.security'), icon: <Shield className="h-4 w-4" strokeWidth={1.75} /> },
    { id: 'mfa', label: t('tabs.mfa'), icon: <KeyRound className="h-4 w-4" strokeWidth={1.75} /> },
    { id: 'sync', label: t('tabs.sync'), icon: <RefreshCw className="h-4 w-4" strokeWidth={1.75} /> },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="flex gap-6">
        {/* Vertical tab list */}
        <nav className="w-44 shrink-0">
          <ul className="space-y-0.5">
            {tabs.map((tab) => (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                    activeTab === tab.id
                      ? 'bg-accent font-medium text-accent-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Tab content */}
        <div className="min-w-0 flex-1">
          {activeTab === 'profile' && (
            <ProfileTab
              t={t}
              user={user}
              name={name}
              language={language}
              isOnline={isOnline}
              saving={saving}
              onNameChange={setName}
              onLanguageChange={setLanguage}
              onSave={() => void handleSaveProfile()}
            />
          )}
          {activeTab === 'security' && <SecurityTab t={t} />}
          {activeTab === 'mfa' && <MFATab t={t} />}
          {activeTab === 'sync' && <SyncTab />}
        </div>
      </div>
    </div>
  )
}

function ProfileTab({
  t,
  user,
  name,
  language,
  isOnline,
  saving,
  onNameChange,
  onLanguageChange,
  onSave,
}: {
  t: ReturnType<typeof useTranslations<'app.profile'>>
  user: { name: string | null; email: string | null; phone: string | null } | null
  name: string
  language: string
  isOnline: boolean
  saving: boolean
  onNameChange: (v: string) => void
  onLanguageChange: (v: string) => void
  onSave: () => void
}) {
  return (
    <div className="space-y-5">
      {!isOnline ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/20">
          <WifiOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={2} />
          <p className="text-sm text-amber-700 dark:text-amber-400">{t('offline_warning')}</p>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('info_section')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('info_subtitle')}</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('field_name')}
            </label>
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t('field_name_placeholder')}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('field_email')}
            </label>
            <Input
              value={user?.email ?? ''}
              readOnly
              disabled
              className="cursor-not-allowed opacity-60"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('field_phone')}
            </label>
            <Input
              value={user?.phone ?? ''}
              readOnly
              disabled
              className="cursor-not-allowed opacity-60"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('field_language')}
            </label>
            <select
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="en">{t('language_en')}</option>
              <option value="fr">{t('language_fr')}</option>
            </select>
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">{t('readonly_notice')}</p>

        <div className="mt-5 flex justify-end">
          <Button
            variant="primary"
            onClick={onSave}
            disabled={saving || !name.trim() || !isOnline}
          >
            {saving ? t('saving') : t('save_action')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SecurityTab({ t }: { t: ReturnType<typeof useTranslations<'app.profile'>> }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('change_password_title')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('change_password_description')}</p>
        <div className="mt-4 rounded-lg border border-border bg-secondary/40 px-4 py-3">
          <p className="text-sm text-muted-foreground">{t('change_password_coming_soon')}</p>
        </div>
      </div>
    </div>
  )
}

function MFATab({ t }: { t: ReturnType<typeof useTranslations<'app.profile'>> }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t('mfa_title')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('mfa_subtitle')}</p>
            <p className="mt-3 text-sm text-muted-foreground">{t('mfa_description')}</p>
          </div>
          <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {t('mfa_coming_soon')}
          </span>
        </div>
      </div>
    </div>
  )
}

const syncQualityOptions: SyncSettings['minQuality'][] = ['fair', 'strong', 'very_strong']

function SyncTab() {
  const t = useTranslations('app.profile')
  const tTopbar = useTranslations('topbar')
  const { snapshot, updateSettings } = useSyncSnapshot()

  const qualityLabels: Record<SyncSettings['minQuality'], string> = {
    weak: tTopbar('quality.weak'),
    fair: tTopbar('quality.fair'),
    strong: tTopbar('quality.strong'),
    very_strong: tTopbar('quality.very_strong'),
  }
  const realtimeModeLabel = tTopbar(`realtime.mode.${snapshot.realtime.mode}`)
  const realtimeStatusLabel = tTopbar(`realtime.status.${snapshot.realtime.status}`)
  const minQualityLabel = qualityLabels[snapshot.settings.minQuality]
  const lastSyncLabel = snapshot.lastSyncedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(snapshot.lastSyncedAt),
      )
    : null

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('sync.section_status')}</h2>
        <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          <p>{lastSyncLabel ? t('sync.last_sync', { time: lastSyncLabel }) : t('sync.never_synced')}</p>
          <p>
            {t('sync.realtime_label', { mode: realtimeModeLabel, status: realtimeStatusLabel })}
          </p>
        </div>

        {snapshot.status === 'error' && snapshot.lastError ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
            <p className="font-semibold">{t('sync.error_label')}</p>
            <p className="mt-1">{snapshot.lastError}</p>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('sync.section_settings')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('sync.device_notice')}</p>

        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-background px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{t('sync.auto_sync_label')}</p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {snapshot.settings.autoSyncEnabled
                    ? t('sync.auto_sync_help_on')
                    : t('sync.auto_sync_help_off')}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  void updateSettings({ autoSyncEnabled: !snapshot.settings.autoSyncEnabled })
                }
                className={cn(
                  'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  snapshot.settings.autoSyncEnabled
                    ? 'bg-foreground text-background hover:opacity-90'
                    : 'bg-amber-600 text-white hover:bg-amber-700',
                )}
              >
                {snapshot.settings.autoSyncEnabled
                  ? t('sync.auto_sync_disable')
                  : t('sync.auto_sync_enable')}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                {t('sync.min_quality_label')}
              </span>
              <select
                value={snapshot.settings.minQuality}
                onChange={(e) =>
                  void updateSettings({ minQuality: e.target.value as SyncSettings['minQuality'] })
                }
                disabled={!snapshot.settings.autoSyncEnabled}
                className="mt-1 block h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {syncQualityOptions.map((q) => (
                  <option key={q} value={q}>
                    {qualityLabels[q]}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted-foreground">
              {snapshot.settings.autoSyncEnabled
                ? t('sync.min_quality_help', { quality: minQualityLabel })
                : t('sync.min_quality_disabled')}
            </p>
          </div>

          {!snapshot.settings.autoSyncEnabled ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              {t('sync.warning_disabled')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
