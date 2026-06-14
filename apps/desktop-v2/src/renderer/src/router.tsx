import { createHashRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AuthShell } from '@/components/layout/AuthShell'
import { RequireAuth, RequireGuest } from '@/components/RouteGuards'
import { Dashboard } from '@/routes/Dashboard'
import { Placeholder } from '@/routes/Placeholder'
import { SignIn } from '@/routes/SignIn'
import { SignUp } from '@/routes/SignUp'
import { Sso } from '@/routes/Sso'
import { AuthPlaceholder } from '@/routes/AuthPlaceholder'

// Two layout groups: AuthShell (RequireGuest) for non-authenticated routes,
// AppShell (RequireAuth) for the app.
export const router = createHashRouter([
  {
    element: (
      <RequireGuest>
        <AuthShell />
      </RequireGuest>
    ),
    children: [
      { path: '/signin', element: <SignIn /> },
      { path: '/signup', element: <SignUp /> },
      { path: '/sso', element: <Sso /> },
      { path: '/select-business', element: <AuthPlaceholder titleKey="onboarding.selectBusiness" /> },
      { path: '/setup-business', element: <AuthPlaceholder titleKey="onboarding.setupBusiness" /> },
      { path: '/select-plan', element: <AuthPlaceholder titleKey="onboarding.selectPlan" /> },
      { path: '/add-first-product', element: <AuthPlaceholder titleKey="onboarding.addFirstProduct" /> },
    ],
  },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/sell', element: <Placeholder titleKey="nav.sell" /> },
      { path: '/products', element: <Placeholder titleKey="nav.allProducts" /> },
      { path: '/products/categories', element: <Placeholder titleKey="nav.categories" /> },
      { path: '/products/brands', element: <Placeholder titleKey="nav.brands" /> },
      { path: '/products/attributes', element: <Placeholder titleKey="nav.attributes" /> },
      { path: '/products/units', element: <Placeholder titleKey="nav.units" /> },
      { path: '/inventory', element: <Placeholder titleKey="nav.inventory" /> },
      { path: '/sales', element: <Placeholder titleKey="nav.sales" /> },
      { path: '/contacts', element: <Placeholder titleKey="nav.allContacts" /> },
      { path: '/contacts/debtors', element: <Placeholder titleKey="nav.debtors" /> },
      { path: '/contacts/creditors', element: <Placeholder titleKey="nav.creditors" /> },
      { path: '/expenses', element: <Placeholder titleKey="nav.expenses" /> },
      { path: '/deposits', element: <Placeholder titleKey="nav.deposits" /> },
      { path: '/reports', element: <Placeholder titleKey="nav.reports" /> },
      { path: '/settings', element: <Placeholder titleKey="nav.settings" /> },
      { path: '/settings/appearance', element: <Placeholder titleKey="nav.appearance" /> },
      { path: '/settings/team', element: <Placeholder titleKey="nav.team" /> },
      { path: '/settings/roles', element: <Placeholder titleKey="nav.roles" /> },
      { path: '/more', element: <Placeholder titleKey="nav.more" /> },
    ],
  },
])
