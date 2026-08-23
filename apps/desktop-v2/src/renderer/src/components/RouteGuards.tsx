import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { Resource } from '@biztrack/types'
import { useSessionStore } from '@/stores/session.store'
import { useHasResource } from '@/lib/entitlements'
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
  // Must be a genuine signed-in session (phase-2 + business) AND onboarding-complete.
  // nextStep alone is not enough: a stale/expired session can carry nextStep:"dashboard"
  // while authenticated is false — that must go to sign-in, not render an empty app.
  if (status.authenticated && isDashboardStep(status.nextStep)) return <>{children}</>
  const target = routeForNextStep(status.nextStep)
  // Never bounce a non-ready session back to the dashboard route (would loop into this
  // guard). If the step resolves to "/", fall back to sign-in.
  return <Navigate to={target === '/' ? '/signin' : target} replace />
}

/**
 * Auth + onboarding routes — for any session that is NOT yet dashboard-ready
 * (signed out, phase1, or mid-onboarding). A ready session is bounced to the app.
 */
export function RequireGuest({ children }: { children: ReactNode }) {
  const { status, hydrated } = useSessionStore()
  if (!hydrated) return <Splash />
  if (status.authenticated && isDashboardStep(status.nextStep)) return <Navigate to="/" replace />
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

/**
 * Plan-gated routes (BIZ-5.5). Bounced to the dashboard when the plan lacks the module's resource —
 * the hard backstop behind the hidden nav. Permissive when entitlements are unknown (offline / not
 * yet fetched): the server still rejects the writes, so this never falsely locks a legitimate user.
 */
export function RequireResource({
  resource,
  children,
}: {
  resource: Resource
  children: ReactNode
}) {
  const hydrated = useSessionStore((s) => s.hydrated)
  const allowed = useHasResource(resource)
  if (!hydrated) return <Splash />
  if (!allowed) return <Navigate to="/" replace />
  return <>{children}</>
}
