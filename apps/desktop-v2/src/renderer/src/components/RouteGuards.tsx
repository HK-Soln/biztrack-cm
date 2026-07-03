import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useSessionStore } from '@/stores/session.store'
import { isDashboardStep, routeForNextStep } from '@/lib/auth-routing'

function Splash() {
  return <div style={{ height: '100vh', background: 'var(--canvas)' }} />
}

/**
 * App routes — only reachable when the session's nextStep is "dashboard" (signed in
 * AND onboarding complete). Otherwise send the user to whatever screen the backend
 * says is next (sign-in, select-business, setup-business, …).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, hydrated } = useSessionStore()
  if (!hydrated) return <Splash />
  if (isDashboardStep(status.nextStep)) return <>{children}</>
  return <Navigate to={routeForNextStep(status.nextStep)} replace />
}

/**
 * Auth + onboarding routes — for any session that is NOT yet dashboard-ready
 * (signed out, phase1, or mid-onboarding). A ready session is bounced to the app.
 */
export function RequireGuest({ children }: { children: ReactNode }) {
  const { status, hydrated } = useSessionStore()
  if (!hydrated) return <Splash />
  if (isDashboardStep(status.nextStep)) return <Navigate to="/" replace />
  return <>{children}</>
}

/**
 * Owner-only routes (role & permission management). Non-owners are bounced to the
 * dashboard — these routes are also hidden from the nav; this is the hard backstop.
 */
export function RequireOwner({ children }: { children: ReactNode }) {
  const { status, hydrated } = useSessionStore()
  if (!hydrated) return <Splash />
  if ((status.user?.role ?? '').toUpperCase() !== 'OWNER') return <Navigate to="/" replace />
  return <>{children}</>
}
