import { cache } from 'react'
import { auth } from '@/lib/auth'

// Memoised per-request session read so multiple PermissionGates / pages
// don't each re-decode the JWT cookie.
export const getCachedSession = cache(async () => auth())

export async function getAdminPermissions() {
  const session = await getCachedSession()
  return {
    permissions: session?.admin?.permissions ?? [],
    scopes: session?.admin?.scopes ?? {},
    isSuperAdmin: session?.admin?.isSuperAdmin ?? false,
  }
}
