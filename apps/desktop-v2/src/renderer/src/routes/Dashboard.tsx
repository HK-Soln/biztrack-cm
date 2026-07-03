import { useEffect } from 'react'
import { dataClient } from '@/lib/data-client'
import { useSessionStore } from '@/stores/session.store'
import { roleKeyFor } from '@/components/home/home-kit'
import { OwnerHome } from '@/components/home/OwnerHome'
import { ManagerHome } from '@/components/home/ManagerHome'
import { AccountantHome } from '@/components/home/AccountantHome'
import { CashierHome } from '@/components/home/CashierHome'
import { GeneralHome } from '@/components/home/GeneralHome'

// The Home route dispatches to a role-tailored dashboard. Every variant reads
// real data through the DataClient (offline SQLite or cloud API), so the same
// screen works in both builds. Mobile/tablet layouts (built next) reuse the
// same data hooks + widgets from components/home.
export function Dashboard() {
  const role = useSessionStore((s) => s.status.user?.role)

  // Kick a sync when the workspace opens so freshly-onboarded data lands
  // promptly (the engine also runs on its own interval).
  useEffect(() => {
    void dataClient.sync.trigger()
  }, [])

  switch (roleKeyFor(role)) {
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
