import {
  LayoutDashboard,
  Building2,
  Users,
  TrendingUp,
  CreditCard,
  Banknote,
  HeadphonesIcon,
  Settings,
  UserCog,
  ScrollText,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PERMISSIONS, hasPermission, type Permission } from '@/lib/permissions/shared'

export interface RouteConfig {
  path: string
  label: string
  permission: Permission
  icon: LucideIcon
}

// Single source of truth for the admin nav catalogue.
// Sidebar, breadcrumbs, and the dashboard landing redirect all read from here.
export const ROUTES: RouteConfig[] = [
  { path: '/overview', label: 'Overview', permission: PERMISSIONS.METRICS_VIEW, icon: LayoutDashboard },
  { path: '/businesses', label: 'Businesses', permission: PERMISSIONS.BUSINESSES_VIEW, icon: Building2 },
  { path: '/users', label: 'Users', permission: PERMISSIONS.USERS_VIEW, icon: Users },
  { path: '/revenue', label: 'Revenue', permission: PERMISSIONS.REVENUE_VIEW, icon: TrendingUp },
  { path: '/subscriptions', label: 'Subscriptions', permission: PERMISSIONS.SUBSCRIPTIONS_VIEW, icon: CreditCard },
  { path: '/payments', label: 'Payments', permission: PERMISSIONS.PAYMENTS_VIEW, icon: Banknote },
  { path: '/support', label: 'Support', permission: PERMISSIONS.SUPPORT_VIEW, icon: HeadphonesIcon },
  { path: '/plans', label: 'Plans', permission: PERMISSIONS.PLANS_VIEW, icon: Settings },
  { path: '/team', label: 'Team', permission: PERMISSIONS.ADMIN_USERS_VIEW, icon: UserCog },
  { path: '/audit', label: 'Audit Log', permission: PERMISSIONS.AUDIT_LOGS_VIEW, icon: ScrollText },
]

export function findRouteByPath(path: string): RouteConfig | undefined {
  return ROUTES.find((r) => r.path === path)
}

export function getVisibleRoutes(
  permissions: string[],
  isSuperAdmin: boolean,
): RouteConfig[] {
  return ROUTES.filter((r) => hasPermission(permissions, isSuperAdmin, r.permission))
}

export function pickFirstPermittedRoute(
  permissions: string[],
  isSuperAdmin: boolean,
): RouteConfig | undefined {
  return getVisibleRoutes(permissions, isSuperAdmin)[0]
}
