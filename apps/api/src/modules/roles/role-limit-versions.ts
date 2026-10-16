import { LessThanOrEqual, type EntityManager } from 'typeorm'
import { sameDiscountPolicy, type RoleDiscountPolicyVersion } from '@biztrack/domain'
import { RoleLimitVersion } from '@/entities/role-limit-version.entity'
import { Role } from '@/entities/role.entity'

// The history of each role's discount policy (ruling R2). Reads and writes only: whether a
// change is a new version (`sameDiscountPolicy`) and what a version means for a sale
// (`reviewSyncedDiscount`) are decided in @biztrack/domain.

const toPolicy = (row: RoleLimitVersion): RoleDiscountPolicyVersion => ({
  version: row.version,
  maxDiscountPercent: row.maxDiscountPercent ?? null,
  maxCartDiscountPercent: row.maxCartDiscountPercent ?? null,
  maxDiscountAmountXaf: row.maxDiscountAmountXaf ?? null,
  allowBelowCost: !!row.allowBelowCost,
})

/** Store a new role's first version. Call in the transaction that creates the role. */
export async function recordFirstRoleLimitVersion(
  manager: EntityManager,
  role: Role,
  effectiveFrom: Date = new Date(),
): Promise<void> {
  await manager.getRepository(RoleLimitVersion).save(
    manager.getRepository(RoleLimitVersion).create({
      businessId: role.businessId,
      roleId: role.id,
      version: role.limitsVersion ?? 1,
      maxDiscountPercent: role.maxDiscountPercent ?? null,
      maxCartDiscountPercent: role.maxCartDiscountPercent ?? null,
      maxDiscountAmountXaf: role.maxDiscountAmountXaf ?? null,
      allowBelowCost: !!role.allowBelowCost,
      effectiveFrom,
    }),
  )
}

/**
 * After a role was edited: when its discount policy really changed, start the next version
 * and store it. Call in the transaction that edited the role, with the role as it was
 * before. Returns the version now in force.
 */
export async function recordRoleLimitChange(
  manager: EntityManager,
  before: Role,
  effectiveFrom: Date = new Date(),
): Promise<number> {
  const roles = manager.getRepository(Role)
  const after = await roles.findOneOrFail({ where: { id: before.id } })
  if (sameDiscountPolicy(before, after)) return after.limitsVersion ?? 1
  const version = (after.limitsVersion ?? 1) + 1
  await roles.update(after.id, { limitsVersion: version })
  after.limitsVersion = version
  await recordFirstRoleLimitVersion(manager, after, effectiveFrom)
  return version
}

/** A role's policy in force at a moment; null when the history does not reach back that far. */
export async function roleLimitsAsAt(
  manager: EntityManager,
  businessId: string,
  roleId: string,
  at: Date,
): Promise<RoleDiscountPolicyVersion | null> {
  const row = await manager.getRepository(RoleLimitVersion).findOne({
    where: { businessId, roleId, effectiveFrom: LessThanOrEqual(at) },
    order: { effectiveFrom: 'DESC', version: 'DESC' },
  })
  return row ? toPolicy(row) : null
}

/** One numbered version of a role's policy; null when there is no such version. */
export async function roleLimitsVersion(
  manager: EntityManager,
  businessId: string,
  roleId: string,
  version: number,
): Promise<RoleDiscountPolicyVersion | null> {
  const row = await manager
    .getRepository(RoleLimitVersion)
    .findOne({ where: { businessId, roleId, version } })
  return row ? toPolicy(row) : null
}
