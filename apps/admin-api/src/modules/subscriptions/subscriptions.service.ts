import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RedisService } from '@/common/redis/redis.service'
import { businessPermissionsCacheKey } from '@/common/permissions/cache-keys'
import { AppNotFoundException } from '@/common/exceptions/app.exception'
import { Business } from '@/entities/read/business.entity'
import { SubscriptionEvent } from '@/entities/read/subscription-event.entity'
import { SubscriptionFiltersDto } from './dto/subscription-filters.dto'
import { UpdateSubscriptionDto } from './dto/update-subscription.dto'

const PLAN_ORDER: Record<string, number> = { FREE: 0, SOLO: 1, BUSINESS: 2, PRO: 3 }

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
    @InjectRepository(SubscriptionEvent) private readonly eventRepo: Repository<SubscriptionEvent>,
    private readonly redis: RedisService,
  ) {}

  async list(filters: SubscriptionFiltersDto) {
    const page = Math.max(filters.page ?? 1, 1)
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100)

    const qb = this.businessRepo.createQueryBuilder('b').where('b.deleted_at IS NULL')
    if (filters.status) qb.andWhere('b.subscription_status = :status', { status: filters.status })
    if (filters.plan) qb.andWhere('b.plan = :plan', { plan: filters.plan })
    if (filters.expiringWithin) {
      const days = filters.expiringWithin === '7d' ? 7 : 14
      const until = new Date(Date.now() + days * 24 * 3600_000)
      qb.andWhere('b.trial_ends_at IS NOT NULL AND b.trial_ends_at <= :until', { until })
    }
    qb.orderBy('b.trial_ends_at', 'ASC', 'NULLS LAST')
      .skip((page - 1) * limit)
      .take(limit)

    const [rows, total] = await qb.getManyAndCount()
    return {
      data: rows.map((b) => this.toSummary(b)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  async trials() {
    const rows = await this.businessRepo
      .createQueryBuilder('b')
      .where('b.deleted_at IS NULL')
      .andWhere("b.subscription_status = 'TRIAL'")
      .orderBy('b.trial_ends_at', 'ASC', 'NULLS LAST')
      .getMany()
    const now = Date.now()
    return rows.map((b) => ({
      ...this.toSummary(b),
      endingWithin7Days: !!b.trialEndsAt && b.trialEndsAt.getTime() - now <= 7 * 24 * 3600_000,
    }))
  }

  async update(businessId: string, dto: UpdateSubscriptionDto) {
    const business = await this.businessRepo.findOne({ where: { id: businessId } })
    if (!business || business.deletedAt)
      throw new AppNotFoundException('Business not found.', 'BUSINESS_NOT_FOUND')

    const fromPlan = business.plan
    const patch: Partial<Business> = {}
    if (dto.plan !== undefined) patch.plan = dto.plan
    if (dto.subscriptionStatus !== undefined) patch.subscriptionStatus = dto.subscriptionStatus
    if (dto.trialEndsAt !== undefined) patch.trialEndsAt = new Date(dto.trialEndsAt)

    await this.businessRepo.update(businessId, patch)

    // Record a subscription_events row where a defined event type fits the change.
    const event = this.deriveEvent(fromPlan, dto)
    if (event) {
      await this.eventRepo.save(
        this.eventRepo.create({
          businessId,
          event,
          fromPlan: dto.plan ? fromPlan : null,
          toPlan: dto.plan ?? null,
          metadata: { source: 'admin', reason: dto.reason },
        }),
      )
    }

    // Entitlements may change → drop the client permissions cache.
    await this.redis.del(businessPermissionsCacheKey(businessId)).catch(() => undefined)

    const updated = await this.businessRepo.findOne({ where: { id: businessId } })
    return this.toSummary(updated!)
  }

  private deriveEvent(fromPlan: string, dto: UpdateSubscriptionDto): string | null {
    if (dto.subscriptionStatus === 'CANCELLED') return 'CANCELLED'
    if (dto.subscriptionStatus === 'ACTIVE' && !dto.plan) return 'REACTIVATED'
    if (dto.plan && dto.plan !== fromPlan) {
      return (PLAN_ORDER[dto.plan] ?? 0) > (PLAN_ORDER[fromPlan] ?? 0)
        ? 'PLAN_UPGRADED'
        : 'PLAN_DOWNGRADED'
    }
    return null
  }

  private toSummary(b: Business) {
    return {
      businessId: b.id,
      name: b.name,
      plan: b.plan,
      subscriptionStatus: b.subscriptionStatus,
      billingCycle: b.billingCycle,
      trialEndsAt: b.trialEndsAt ?? null,
      currentPeriodEnd: b.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: b.cancelAtPeriodEnd,
    }
  }
}
