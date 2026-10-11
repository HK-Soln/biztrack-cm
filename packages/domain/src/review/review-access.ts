// ---------------------------------------------------------------------------
// Who may see and resolve review flags. A flag can be about a refund above the amount
// paid or a serial sold twice, so it is for the people who supervise the tills, not for
// the cashier it may be about.
// ---------------------------------------------------------------------------

import type { ReviewFlagReviewer } from '@biztrack/types'

/**
 * The owner always; otherwise an active member whose assigned role may authorize, or, with
 * no role assigned, a built-in manager. The same people who may approve at a till.
 */
export function canReviewFlags(member: ReviewFlagReviewer | null | undefined): boolean {
  if (!member || !member.active) return false
  const role = member.memberRole.toUpperCase()
  if (role === 'OWNER') return true
  if (member.hasAssignedRole) return member.roleCanAuthorize
  return role === 'MANAGER'
}
