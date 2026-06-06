'use client'

import { useAuthStore } from '@/stores/auth.store'
import type { BusinessInfo } from '@/components/reports/shared'

export function useBusiness(): BusinessInfo {
  const businessName    = useAuthStore(s => s.businessName)
  const businessPhone   = useAuthStore(s => s.businessPhone)
  const businessEmail   = useAuthStore(s => s.businessEmail)
  const businessAddress = useAuthStore(s => s.businessAddress)
  const businessCity    = useAuthStore(s => s.businessCity)

  const address = [businessAddress, businessCity].filter(Boolean).join(', ')

  return {
    name:      businessName    ?? '',
    phone:     businessPhone   ?? businessEmail ?? '',
    address:   address         || '',
    legalForm: 'SARL',
    rccm:      '',
    niu:       '',
    taxRegime: 'Simplifié (RS)',
  }
}
