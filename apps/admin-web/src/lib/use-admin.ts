'use client'

import { useSession } from 'next-auth/react'

/** Current admin profile + a permission predicate (SUPER_ADMIN passes everything). */
export function useAdmin() {
  const { data, status } = useSession()
  const admin = data?.admin
  const can = (permission: string) =>
    !!admin && (admin.isSuperAdmin || admin.permissions.includes(permission))
  return { admin, can, status }
}
