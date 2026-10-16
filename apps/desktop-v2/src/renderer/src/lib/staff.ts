import { staffMay, type StaffAction } from '@biztrack/domain'
import { useSessionStore } from '@/stores/session.store'

/**
 * Whether the signed-in member may take `action` (@biztrack/domain staffMay, ruling R21),
 * to decide which buttons to show. The till's main process and the server hold the rule.
 */
export function useStaffMay(action: StaffAction): boolean {
  const role = useSessionStore((s) => s.status.user?.role)
  return staffMay(role, action)
}
