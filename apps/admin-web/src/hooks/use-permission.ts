'use client'

import { useSession } from 'next-auth/react'

export function usePermission(required: string): boolean {
  const { data: session } = useSession()
  if (!session?.admin) return false
  if (session.admin.isSuperAdmin) return true
  return session.admin.permissions.includes(required)
}

export function useAnyPermission(required: string[]): boolean {
  const { data: session } = useSession()
  if (!session?.admin) return false
  if (session.admin.isSuperAdmin) return true
  return required.some((p) => session.admin.permissions.includes(p))
}
