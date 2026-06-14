'use client'

import type { ReactNode } from 'react'
import { useTheme } from 'next-themes'
import { PALETTE_META, useThemeStore, type ThemePalette } from '@/stores/theme.store'

const NAV_ITEMS = ['Dashboard', 'Sell', 'Products', 'Inventory', 'Sales', 'Reports', 'Settings']

function ThemeControls() {
  const { resolvedTheme, setTheme } = useTheme()
  const palette = useThemeStore((s) => s.palette)
  const setPalette = useThemeStore((s) => s.setPalette)

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        {PALETTE_META.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.name}
            onClick={() => setPalette(p.id as ThemePalette)}
            className={`h-5 w-5 rounded-full border-2 transition-all ${
              palette === p.id ? 'border-ring scale-110' : 'border-border'
            }`}
            style={{ backgroundColor: p.swatches[0] }}
            aria-label={`Palette ${p.name}`}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-body-sm text-foreground transition-colors hover:bg-muted"
      >
        {resolvedTheme === 'dark' ? 'Light' : 'Dark'} mode
      </button>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex h-16 items-center gap-3 border-b border-border px-5">
          <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-primary text-primary-foreground">
            <span className="font-serif text-[17px] leading-none">B</span>
          </div>
          <div className="min-w-0">
            <div className="truncate text-heading-sm text-foreground">BizTrack CM</div>
            <div className="text-label-sm uppercase tracking-[0.14em] text-muted-foreground">
              Desktop v2
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item, i) => (
            <div
              key={item}
              className={`rounded-lg px-3 py-2 text-body-md transition-colors ${
                i === 0
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {item}
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-3 text-label-sm text-muted-foreground">
          Offline-first · SSR
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6">
          <h1 className="text-heading-md text-foreground">Walking skeleton</h1>
          <ThemeControls />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
