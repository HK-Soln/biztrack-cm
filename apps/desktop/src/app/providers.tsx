'use client'

import { ThemeProvider, useTheme } from 'next-themes'
import { useEffect } from 'react'
import { ipc } from '@/services/ipc.bridge'
import { useThemeStore } from '@/stores/theme.store'

function ThemeBridge() {
  const { setTheme, resolvedTheme } = useTheme()
  const hydrateTheme = useThemeStore((state) => state.hydrate)

  // Sync the palette/chrome store with the attributes the no-flash script set.
  useEffect(() => {
    hydrateTheme()
  }, [hydrateTheme])

  useEffect(() => {
    return ipc.theme?.onThemeChange?.((theme) => {
      if (theme === 'light' || theme === 'dark' || theme === 'system') {
        setTheme(theme)
      }
    })
  }, [setTheme])

  // Push the resolved app theme back to main so the native titlebar overlay
  // tracks the app theme rather than the OS system theme. The exact overlay
  // colour is set per-shell by <TitleBarOverlaySync />.
  useEffect(() => {
    if (resolvedTheme === 'light' || resolvedTheme === 'dark') {
      ipc.theme.setTheme(resolvedTheme)
    }
  }, [resolvedTheme])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ThemeBridge />
      {children}
    </ThemeProvider>
  )
}
