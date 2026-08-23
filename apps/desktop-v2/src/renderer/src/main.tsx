import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@biztrack/ui/biztrack'
import '@biztrack/ui/styles.css'
import { router } from './router'
import { ManagerStepUpModal } from './components/ManagerStepUpModal'
import { queryClient } from '@/lib/query'
import { useThemeStore } from '@/stores/theme.store'
import { useLangStore } from '@/i18n'
import { useSessionStore } from '@/stores/session.store'
import { tryNativeHandoff } from '@/lib/native-handoff'

// Browser build only: if opened from a notification link, try to hand off to the installed
// desktop app for this route (falls back to the browser). No-op in Electron / without marker.
tryNativeHandoff()
// Sync the theme store with the attributes the no-flash script set in index.html.
useThemeStore.getState().init()
// Reflect the persisted language on <html lang>.
document.documentElement.setAttribute('lang', useLangStore.getState().lang)
// Hydrate the auth session from the main process (BFF) before the guards resolve.
void useSessionStore.getState().refresh()

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ManagerStepUpModal />
      <Toaster />
    </QueryClientProvider>
  </React.StrictMode>,
)
