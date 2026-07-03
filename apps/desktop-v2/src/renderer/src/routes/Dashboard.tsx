import { useEffect } from 'react'
import { dataClient } from '@/lib/data-client'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { useSessionStore } from '@/stores/session.store'
import { roleKeyFor } from '@/components/home/home-kit'
import { OwnerHome } from '@/components/home/OwnerHome'
import { ManagerHome } from '@/components/home/ManagerHome'
import { AccountantHome } from '@/components/home/AccountantHome'
import { CashierHome } from '@/components/home/CashierHome'
import { GeneralHome } from '@/components/home/GeneralHome'
import { OwnerHomeMobile } from '@/components/home/mobile/OwnerHomeMobile'
import { ManagerHomeMobile } from '@/components/home/mobile/ManagerHomeMobile'
import { AccountantHomeMobile } from '@/components/home/mobile/AccountantHomeMobile'
import { CashierHomeMobile } from '@/components/home/mobile/CashierHomeMobile'
import { GeneralHomeMobile } from '@/components/home/mobile/GeneralHomeMobile'

// The Home route dispatches to a role-tailored dashboard. Every variant reads
// real data through the DataClient (offline SQLite or cloud API), so the same
// screen works in both builds. At the mobile breakpoint the phone-specific
// layouts render; tablet/desktop share the existing wide dashboards (their grids
// already reflow) inside the responsive shell.
export function Dashboard() {
  const role = useSessionStore((s) => s.status.user?.role)
  const bp = useBreakpoint()

  // Kick a sync when the workspace opens so freshly-onboarded data lands
  // promptly (the engine also runs on its own interval).
  useEffect(() => {
    void dataClient.sync.trigger()
  }, [])

  const key = roleKeyFor(role)

  if (bp === 'mobile') {
    switch (key) {
      case 'owner':
        return <OwnerHomeMobile />
      case 'manager':
        return <ManagerHomeMobile />
      case 'accountant':
        return <AccountantHomeMobile />
      case 'cashier':
        return <CashierHomeMobile />
      default:
        return <GeneralHomeMobile />
    }
  }

  switch (key) {
    case 'owner':
      return <OwnerHome />
    case 'manager':
      return <ManagerHome />
    case 'accountant':
      return <AccountantHome />
    case 'cashier':
      return <CashierHome />
    default:
      return <GeneralHome />
  }
}
