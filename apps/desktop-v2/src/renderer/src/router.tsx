import { createHashRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AuthShell } from '@/components/layout/AuthShell'
import { RequireAuth, RequireGuest } from '@/components/RouteGuards'
import { RouteError } from '@/components/RouteError'
import { Dashboard } from '@/routes/Dashboard'
import { Placeholder } from '@/routes/Placeholder'
import { SignIn } from '@/routes/SignIn'
import { SignUp } from '@/routes/SignUp'
import { Sso } from '@/routes/Sso'
import { SelectBusiness } from '@/routes/SelectBusiness'
import { SetupBusiness } from '@/routes/SetupBusiness'
import { SelectPlan } from '@/routes/SelectPlan'
import { Categories } from '@/routes/Categories'
import { CategoryForm } from '@/routes/CategoryForm'
import { Attributes } from '@/routes/Attributes'

// Two layout groups: AuthShell (RequireGuest) for non-authenticated routes,
// AppShell (RequireAuth) for the app.
export const router = createHashRouter([
  {
    // Root error boundary: catches unmatched routes (404) + any error thrown in a
    // descendant route, replacing React Router's dev-only default screen.
    errorElement: <RouteError />,
    children: [
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
      { path: '/select-business', element: <SelectBusiness /> },
      { path: '/setup-business', element: <SetupBusiness /> },
      { path: '/select-plan', element: <SelectPlan /> },
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
      { path: '/products/categories', element: <Categories /> },
      { path: '/products/categories/new', element: <CategoryForm /> },
      { path: '/products/categories/:id', element: <CategoryForm /> },
      { path: '/products/brands', element: <Placeholder titleKey="nav.brands" /> },
      { path: '/products/attributes', element: <Attributes /> },
      { path: '/products/units', element: <Placeholder titleKey="nav.units" /> },
      { path: '/inventory', element: <Placeholder titleKey="nav.inventory" /> },
      { path: '/sales', element: <Placeholder titleKey="nav.sales" /> },
      { path: '/online/orders', element: <Placeholder titleKey="nav.onlineOrders" /> },
      { path: '/online/store', element: <Placeholder titleKey="nav.onlineStore" /> },
      { path: '/contacts', element: <Placeholder titleKey="nav.allContacts" /> },
      { path: '/contacts/debtors', element: <Placeholder titleKey="nav.debtors" /> },
      { path: '/contacts/creditors', element: <Placeholder titleKey="nav.creditors" /> },
      { path: '/expenses', element: <Placeholder titleKey="nav.expenses" /> },
      { path: '/deposits', element: <Placeholder titleKey="nav.deposits" /> },
      { path: '/reports', element: <Placeholder titleKey="nav.reports" /> },
      { path: '/settings', element: <Placeholder titleKey="nav.settings" /> },
      { path: '/settings/appearance', element: <Placeholder titleKey="nav.appearance" /> },
      { path: '/settings/subscription', element: <Placeholder titleKey="nav.subscription" /> },
      { path: '/settings/team', element: <Placeholder titleKey="nav.team" /> },
      { path: '/settings/roles', element: <Placeholder titleKey="nav.roles" /> },
      { path: '/profile', element: <Placeholder titleKey="nav.profile" /> },
      { path: '/more', element: <Placeholder titleKey="nav.more" /> },
    ],
  },
    ],
  },
])
