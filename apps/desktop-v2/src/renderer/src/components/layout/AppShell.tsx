import { useEffect, type ReactNode } from 'react'
import { PALETTE_META, useThemeStore } from '@/stores/theme.store'
import { isWindows, syncTitleBarOverlay } from '@/lib/titlebar'

const NAV_ITEMS = ['Dashboard', 'Sell', 'Products', 'Inventory', 'Sales', 'Reports', 'Settings']

function ThemeControls() {
  const mode = useThemeStore((s) => s.mode)
  const resolvedDark = useThemeStore((s) => s.resolvedDark)
  const setMode = useThemeStore((s) => s.setMode)
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
            aria-label={`Palette ${p.name}`}
            onClick={() => setPalette(p.id)}
            className={`h-5 w-5 rounded-full border-2 transition-all ${
              palette === p.id ? 'scale-110 border-ring' : 'border-border'
            }`}
            style={{ backgroundColor: p.swatch }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => setMode(resolvedDark ? 'light' : 'dark')}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-body-sm text-foreground transition-colors hover:bg-muted"
      >
        {resolvedDark ? 'Light' : 'Dark'} mode
        {mode === 'system' ? ' (system)' : ''}
      </button>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const mode = useThemeStore((s) => s.mode)
  const palette = useThemeStore((s) => s.palette)
  const chrome = useThemeStore((s) => s.chrome)
  const resolvedDark = useThemeStore((s) => s.resolvedDark)

  // Repaint the native window controls whenever the header colours change.
  useEffect(() => {
    const id = requestAnimationFrame(syncTitleBarOverlay)
    return () => cancelAnimationFrame(id)
  }, [mode, palette, chrome, resolvedDark])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
        <div className="app-drag flex h-16 items-center gap-3 border-b border-border px-5">
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
          Offline-first · Vite + React
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={`app-drag flex h-16 shrink-0 items-center justify-between border-b border-border bg-card pl-6 ${
            isWindows ? 'pr-[138px]' : 'pr-6'
          }`}
        >
          <h1 className="text-heading-md text-foreground">Walking skeleton</h1>
          <div className="app-no-drag">
            <ThemeControls />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
