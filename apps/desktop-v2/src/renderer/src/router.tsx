import { createHashRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AuthShell } from '@/components/layout/AuthShell'
import { RequireAuth, RequireGuest, RequireOwner } from '@/components/RouteGuards'
import { RouteError } from '@/components/RouteError'
import { Dashboard } from '@/routes/Dashboard'
import { Placeholder } from '@/routes/Placeholder'
import { SignIn } from '@/routes/SignIn'
import { SignUp } from '@/routes/SignUp'
import { Invite } from '@/routes/Invite'
import { Invitations } from '@/routes/Invitations'
import { Sso } from '@/routes/Sso'
import { SelectBusiness } from '@/routes/SelectBusiness'
import { SetupBusiness } from '@/routes/SetupBusiness'
import { SelectPlan } from '@/routes/SelectPlan'
import { Categories } from '@/routes/Categories'
import { CategoryForm } from '@/routes/CategoryForm'
import { Attributes } from '@/routes/Attributes'
import { Units } from '@/routes/Units'
import { Brands } from '@/routes/Brands'
import { Products } from '@/routes/Products'
import { ProductForm } from '@/routes/ProductForm'
import { Inventory } from '@/routes/Inventory'
import { ReceiveStock } from '@/routes/ReceiveStock'
import { ProductDetail } from '@/routes/ProductDetail'
import { Contacts } from '@/routes/Contacts'
import { ContactDetail } from '@/routes/ContactDetail'
import { ContactForm } from '@/routes/ContactForm'
import { Rfqs } from '@/routes/Rfqs'
import { RfqForm } from '@/routes/RfqForm'
import { RfqDetail } from '@/routes/RfqDetail'
import { ConvertRfq } from '@/routes/ConvertRfq'
import { PurchaseOrders } from '@/routes/PurchaseOrders'
import { PoForm } from '@/routes/PoForm'
import { PoDetail } from '@/routes/PoDetail'
import { ReceivePo } from '@/routes/ReceivePo'
import { Sell } from '@/routes/Sell'
import { Sales } from '@/routes/Sales'
import { Expenses } from '@/routes/Expenses'
import { Deposits } from '@/routes/Deposits'
import { OnlineOrders } from '@/routes/OnlineOrders'
import { OnlineStore } from '@/routes/OnlineStore'
import { Settings } from '@/routes/Settings'
import { UserSettings } from '@/routes/UserSettings'
import { Team } from '@/routes/Team'
import { Roles } from '@/routes/Roles'
import { ReportViewer } from '@/routes/ReportViewer'
import { RoleForm } from '@/routes/RoleForm'

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
      { path: '/invite', element: <Invite /> },
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
      { path: '/invitations', element: <Invitations /> },
      { path: '/sell', element: <Sell /> },
      { path: '/products', element: <Products /> },
      { path: '/products/new', element: <ProductForm /> },
      { path: '/products/categories', element: <Categories /> },
      { path: '/products/categories/new', element: <CategoryForm /> },
      { path: '/products/categories/:id', element: <CategoryForm /> },
      { path: '/products/brands', element: <Brands /> },
      { path: '/products/attributes', element: <Attributes /> },
      { path: '/products/units', element: <Units /> },
      { path: '/products/:id', element: <ProductDetail /> },
      { path: '/products/:id/edit', element: <ProductForm /> },
      { path: '/inventory', element: <Inventory /> },
      { path: '/inventory/restock', element: <ReceiveStock /> },
      { path: '/sales', element: <Sales /> },
      { path: '/online/orders', element: <OnlineOrders /> },
      { path: '/online/store', element: <OnlineStore /> },
      { path: '/contacts', element: <Contacts /> },
      { path: '/contacts/new', element: <ContactForm /> },
      { path: '/contacts/:id', element: <ContactDetail /> },
      { path: '/contacts/:id/edit', element: <ContactForm /> },
      { path: '/purchasing/rfqs', element: <Rfqs /> },
      { path: '/purchasing/rfqs/new', element: <RfqForm /> },
      { path: '/purchasing/rfqs/:id', element: <RfqDetail /> },
      { path: '/purchasing/rfqs/:id/convert/:supplierId', element: <ConvertRfq /> },
      { path: '/purchasing/orders', element: <PurchaseOrders /> },
      { path: '/purchasing/orders/new', element: <PoForm /> },
      { path: '/purchasing/orders/:id', element: <PoDetail /> },
      { path: '/purchasing/orders/:id/receive', element: <ReceivePo /> },
      { path: '/expenses', element: <Expenses /> },
      { path: '/deposits', element: <Deposits /> },
      { path: '/reports', element: <ReportViewer /> },
      { path: '/reports/:reportId', element: <ReportViewer /> },
      { path: '/team', element: <Team /> },
      { path: '/roles', element: <RequireOwner><Roles /></RequireOwner> },
      { path: '/roles/new', element: <RequireOwner><RoleForm /></RequireOwner> },
      { path: '/roles/:id/edit', element: <RequireOwner><RoleForm /></RequireOwner> },
      { path: '/settings', element: <Settings /> },
      { path: '/profile', element: <UserSettings /> },
      { path: '/more', element: <Placeholder titleKey="nav.more" /> },
    ],
  },
    ],
  },
])
