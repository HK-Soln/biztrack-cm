import { staffMay, type StaffAction } from '@biztrack/domain'

/** The signed-in member's role (OWNER, MANAGER, CASHIER, ...), or null when signed out. */
export type RoleSource = () => string | null

/**
 * Refuses the action unless the signed-in member's role allows it, by @biztrack/domain's
 * staffMay (ruling R21), as the server's endpoints do. The screens hide the buttons too, but
 * the main process is what holds the rule on the till.
 */
export function requireStaff(getRole: RoleSource, action: StaffAction): void {
  if (!staffMay(getRole(), action)) {
    throw new Error('Only owners and managers can do this.')
  }
}
