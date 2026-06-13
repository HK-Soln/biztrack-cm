'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PALETTE_META,
  useThemeStore,
  type ThemeChrome,
} from '@/stores/theme.store'

type ModeValue = 'light' | 'dark' | 'system'

export default function AppearanceSettingsPage() {
  const t = useTranslations('app.settings.appearance')
  const { theme, setTheme } = useTheme()
  const palette = useThemeStore((state) => state.palette)
  const setPalette = useThemeStore((state) => state.setPalette)
  const chrome = useThemeStore((state) => state.chrome)
  const setChrome = useThemeStore((state) => state.setChrome)

  // next-themes / the theme store both resolve on the client only.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const mode = (theme as ModeValue | undefined) ?? 'system'

  const modeOptions: { value: ModeValue; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: t('mode_light'), icon: Sun },
    { value: 'dark', label: t('mode_dark'), icon: Moon },
    { value: 'system', label: t('mode_system'), icon: Monitor },
  ]

  const chromeOptions: { value: ThemeChrome; label: string; help: string }[] = [
    { value: 'neutral', label: t('chrome_neutral'), help: t('chrome_neutral_help') },
    { value: 'brand', label: t('chrome_brand'), help: t('chrome_brand_help') },
  ]

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-heading-lg font-semibold text-foreground">{t('title')}</h1>
        <p className="mt-1 max-w-xl text-body-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {/* Theme palette */}
      <section className="mb-9">
        <div className="mb-3">
          <h2 className="text-heading-sm font-semibold text-foreground">{t('theme_label')}</h2>
          <p className="text-body-sm text-muted-foreground">{t('theme_help')}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PALETTE_META.map((item) => {
            const active = mounted && palette === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPalette(item.id)}
                aria-pressed={active}
                className={cn(
                  'group rounded-xl border bg-card p-3 text-left transition-all',
                  active
                    ? 'border-primary ring-2 ring-ring/30'
                    : 'border-border hover:border-primary/40 hover:bg-secondary/60',
                )}
              >
                <div className="mb-2.5 flex gap-1.5">
                  {item.swatches.map((swatch, index) => (
                    <span
                      key={index}
                      className="h-6 w-6 rounded-md ring-1 ring-black/5"
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-label-lg font-semibold text-foreground">{item.name}</span>
                  {item.id === 'a' ? (
                    <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                      {t('default_badge')}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {item.description}
                </p>
              </button>
            )
          })}
        </div>
      </section>

      {/* Light / dark / system */}
      <section className="mb-9">
        <div className="mb-3">
          <h2 className="text-heading-sm font-semibold text-foreground">{t('mode_label')}</h2>
          <p className="text-body-sm text-muted-foreground">{t('mode_help')}</p>
        </div>
        <div className="inline-flex rounded-xl border border-border bg-secondary/50 p-1">
          {modeOptions.map((option) => {
            const Icon = option.icon
            const active = mounted && mode === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-label-lg font-medium transition-colors',
                  active
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
                {option.label}
              </button>
            )
          })}
        </div>
      </section>

      {/* Navigation chrome */}
      <section>
        <div className="mb-3">
          <h2 className="text-heading-sm font-semibold text-foreground">{t('chrome_label')}</h2>
          <p className="text-body-sm text-muted-foreground">{t('chrome_help')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {chromeOptions.map((option) => {
            const active = mounted && chrome === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setChrome(option.value)}
                aria-pressed={active}
                className={cn(
                  'flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-all',
                  active
                    ? 'border-primary ring-2 ring-ring/30'
                    : 'border-border hover:border-primary/40 hover:bg-secondary/60',
                )}
              >
                <ChromeGlyph variant={option.value} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-label-lg font-semibold text-foreground">{option.label}</span>
                    {active ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{option.help}</p>
                </div>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

/** Tiny abstract sketch of a sidebar + content for the chrome options. */
function ChromeGlyph({ variant }: { variant: ThemeChrome }) {
  return (
    <div className="flex h-11 w-16 shrink-0 overflow-hidden rounded-md border border-border">
      <div className={cn('w-1/3', variant === 'brand' ? 'bg-primary' : 'bg-secondary')} />
      <div className="flex-1 bg-card" />
    </div>
  )
}
