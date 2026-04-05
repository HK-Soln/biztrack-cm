import { Injectable } from '@nestjs/common'
import { SubscriptionPlan, Resource, type AuthPermissions, type SpecialPermission } from '@biztrack/types'
import { RedisService } from '@/common/redis/redis.service'
import { BusinessesRepository } from '@/modules/business/repositories/businesses.repository'
import { PlanConfigsRepository } from './repositories/plan-configs.repository'
import { BusinessOverridesRepository } from './repositories/business-overrides.repository'
import { IsNull, MoreThan } from 'typeorm'

@Injectable()
export class PermissionsService {
  private readonly CACHE_TTL = 300

  constructor(
    private businessesRepo: BusinessesRepository,
    private planConfigsRepo: PlanConfigsRepository,
    private overridesRepo: BusinessOverridesRepository,
    private redis: RedisService,
  ) { }

  async getEffectivePermissions(businessId: string): Promise<Resource[]> {
    const cacheKey = `permissions:${businessId}`
    const cached = await this.redis.get(cacheKey)
    if (cached) return JSON.parse(cached)

    const business = await this.businessesRepo.findOne({
      where: { id: businessId },
      select: { plan: true } as any,
    })
    if (!business) return []

    const planConfig = await this.planConfigsRepo.findOne({
      where: { plan: business.plan as SubscriptionPlan },
    })

    const overrides = await this.overridesRepo.find({
      where: [
        { businessId, expiresAt: IsNull() },
        { businessId, expiresAt: MoreThan(new Date()) },
      ] as any,
    })

    const permissions = new Set<string>(planConfig?.resources ?? [])
    for (const override of overrides) {
      if (override.granted) {
        permissions.add(override.resource)
      } else {
        permissions.delete(override.resource)
      }
    }

    const result = Array.from(permissions) as Resource[]
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result))
    return result
  }

  async buildAuthPermissions(businessId: string): Promise<AuthPermissions> {
    const business = await this.businessesRepo.findOne({
      where: { id: businessId },
      select: { plan: true } as any,
    })

    const effectivePermissions = await this.getEffectivePermissions(businessId)

    const overrides = await this.overridesRepo.find({
      where: [
        { businessId, expiresAt: IsNull() },
        { businessId, expiresAt: MoreThan(new Date()) },
      ] as any,
    })

    const specialPermissions: SpecialPermission[] = overrides.map((o) => ({
      resource: o.resource as Resource,
      grantedAt: o.grantedAt.getTime(),
      expiresAt: o.expiresAt?.getTime() ?? null,
      grantedBy: o.grantedBy,
      reason: o.reason,
      isRevocation: !o.granted,
    }))

    const now = Date.now()
    const thirtyDays = 30 * 24 * 60 * 60 * 1000

    return {
      plan: business?.plan ?? SubscriptionPlan.FREE,
      effectivePermissions,
      specialPermissions,
      permissionsIssuedAt: now,
      permissionsExpiresAt: now + thirtyDays,
    }
  }

  async invalidateCache(businessId: string): Promise<void> {
    await this.redis.del(`permissions:${businessId}`)
  }

  async getMinimumPlanFor(resource: Resource): Promise<SubscriptionPlan> {
    const configs = await this.planConfigsRepo.find({ order: { plan: 'ASC' as any } })
    const planOrder = [SubscriptionPlan.FREE, SubscriptionPlan.SOLO, SubscriptionPlan.BUSINESS, SubscriptionPlan.PRO]
    for (const plan of planOrder) {
      const config = configs.find((c) => c.plan === plan)
      if (config?.resources?.includes(resource)) return plan
    }
    return SubscriptionPlan.PRO
  }
}
