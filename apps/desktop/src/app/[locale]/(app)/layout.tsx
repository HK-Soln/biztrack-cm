import type { ReactNode } from 'react'
import { AuthGate } from '@/components/auth/AuthGate'
import { PlanRouteGuard } from '@/components/auth/PlanRouteGuard'
import { AppShell } from '@/components/layout/AppShell'
import { TitleBarOverlaySync } from '@/components/layout/TitleBarOverlaySync'
import { routing } from '@/i18n/routing'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export const dynamicParams = false

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <TitleBarOverlaySync variant="app" />
      <AppShell>
        <PlanRouteGuard>{children}</PlanRouteGuard>
      </AppShell>
    </AuthGate>
  )
}
