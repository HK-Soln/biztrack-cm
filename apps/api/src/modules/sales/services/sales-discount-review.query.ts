import type { EntityManager } from 'typeorm'
import type { RoleDiscountPolicyVersion } from '@biztrack/domain'
import type { SaleSyncPayload } from '@biztrack/types'
import { BusinessMember } from '@/entities/business-member.entity'
import { Role } from '@/entities/role.entity'
import { roleLimitsAsAt, roleLimitsVersion } from '@/modules/roles/role-limit-versions'

// Loads what `reviewSyncedDiscount` (@biztrack/domain, ruling R2) needs to re-check the
// discount on a sale synced from a till. No rule lives here.

export interface SyncedDiscountContext {
  /** What the till recorded on the discount rows; null when it sent none. */
  till: { unauthorized: boolean; authorizedBy: string | null } | null
  cashierPolicy: RoleDiscountPolicyVersion | null
  tillPolicy: RoleDiscountPolicyVersion | null
  approverPolicy: RoleDiscountPolicyVersion | null
}

async function memberRoleId(
  manager: EntityManager,
  businessId: string,
  userId: string,
): Promise<string | null> {
  const member = await manager
    .getRepository(BusinessMember)
    .findOne({ where: { businessId, userId }, select: { id: true, roleId: true } })
  return member?.roleId ?? null
}

export async function loadSyncedDiscountContext(
  manager: EntityManager,
  businessId: string,
  payload: SaleSyncPayload,
  cashierId: string,
  soldAt: Date,
): Promise<SyncedDiscountContext> {
  const rows = payload.discounts ?? []
  const till = rows.length
    ? {
        unauthorized: rows.some((row) => !!row.unauthorized),
        authorizedBy: rows.find((row) => !!row.authorizedBy)?.authorizedBy ?? null,
      }
    : null
  const none = { till, cashierPolicy: null, tillPolicy: null, approverPolicy: null }
  if (!till) return none

  // The role the till applied, when it says so and the role is this business's; otherwise
  // the role the cashier holds now.
  const sent = payload.discountPolicy ?? null
  const sentRole = sent?.roleId
    ? await manager
        .getRepository(Role)
        .findOne({ where: { id: sent.roleId, businessId }, select: { id: true } })
    : null
  const roleId = sentRole?.id ?? (await memberRoleId(manager, businessId, cashierId))
  if (!roleId) return none

  const cashierPolicy = await roleLimitsAsAt(manager, businessId, roleId, soldAt)
  if (!cashierPolicy) return none

  // The limits the till had: the version it names, or, when it names none, the version
  // before the one in force (a till that never heard of the change).
  const tillVersion =
    sentRole && sent?.limitsVersion != null ? sent.limitsVersion : cashierPolicy.version - 1
  const tillPolicy =
    tillVersion >= 1 && tillVersion !== cashierPolicy.version
      ? await roleLimitsVersion(manager, businessId, roleId, tillVersion)
      : null

  const approverRoleId = till.authorizedBy
    ? await memberRoleId(manager, businessId, till.authorizedBy)
    : null
  const approverPolicy = approverRoleId
    ? await roleLimitsAsAt(manager, businessId, approverRoleId, soldAt)
    : null

  return { till, cashierPolicy, tillPolicy, approverPolicy }
}
