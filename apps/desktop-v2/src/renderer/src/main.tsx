import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import '@biztrack/ui/styles.css'
import { router } from './router'
import { queryClient } from '@/lib/query'
import { useThemeStore } from '@/stores/theme.store'
import { useLangStore } from '@/i18n'

// Sync the theme store with the attributes the no-flash script set in index.html.
useThemeStore.getState().init()
// Reflect the persisted language on <html lang>.
document.documentElement.setAttribute('lang', useLangStore.getState().lang)

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
)
