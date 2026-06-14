import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useSessionStore } from '@/stores/session.store'

function Splash() {
  return <div style={{ height: '100vh', background: 'var(--canvas)' }} />
}

/** App routes — require a full (phase2) authenticated session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, hydrated } = useSessionStore()
  if (!hydrated) return <Splash />
  if (status.authenticated) return <>{children}</>
  return <Navigate to="/signin" replace />
}

/** Auth routes — only for users who are NOT fully authenticated. */
export function RequireGuest({ children }: { children: ReactNode }) {
  const { status, hydrated } = useSessionStore()
  if (!hydrated) return <Splash />
  if (status.authenticated) return <Navigate to="/" replace />
  return <>{children}</>
}
