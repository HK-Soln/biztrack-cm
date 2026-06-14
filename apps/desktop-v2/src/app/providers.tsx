'use client'

import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { ThemeProvider, useTheme } from 'next-themes'
import { QueryClientProvider } from '@tanstack/react-query'
import { getQueryClient } from '@/lib/query'
import { useThemeStore } from '@/stores/theme.store'

// Syncs the palette/chrome store with the attributes the no-flash script set, and
// (when running inside Electron) pushes the resolved light/dark theme to the main
// process so the native titlebar tracks the app theme. Guarded for plain-browser dev.
function ThemeBridge() {
  const hydrateTheme = useThemeStore((state) => state.hydrate)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    hydrateTheme()
  }, [hydrateTheme])

  useEffect(() => {
    if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') return
    const electronAPI = (globalThis as { electronAPI?: { theme?: { setTheme?: (t: string) => void } } })
      .electronAPI
    electronAPI?.theme?.setTheme?.(resolvedTheme)
  }, [resolvedTheme])

  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <ThemeBridge />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  )
}
