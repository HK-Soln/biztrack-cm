import { getCachedSession } from '@/lib/permissions/server'
import { hasPermission, type Permission } from '@/lib/permissions/shared'

interface PermissionGateProps {
  permission: Permission
  children: React.ReactNode
  fallback?: React.ReactNode
}

export async function PermissionGate({ permission, children, fallback }: PermissionGateProps) {
  const session = await getCachedSession()
  const can = hasPermission(
    session?.admin?.permissions ?? [],
    session?.admin?.isSuperAdmin ?? false,
    permission,
  )

  if (!can) return fallback ? <>{fallback}</> : null
  return <>{children}</>
}
