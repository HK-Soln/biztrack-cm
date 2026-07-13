import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { Resource } from '@biztrack/types'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { RedisService } from '@/common/redis/redis.service'
import { businessPermissionsCacheKey } from '@/common/permissions/cache-keys'
import { AppForbiddenException, AppNotFoundException } from '@/common/exceptions/app.exception'
import type { PermissionScope } from '@/common/auth/admin-jwt-payload'
import { Business } from '@/entities/read/business.entity'
import { ClientUser } from '@/entities/read/client-user.entity'
import { BusinessMember } from '@/entities/read/business-member.entity'
import { BusinessOverride } from '@/entities/read/business-override.entity'
import { SubscriptionEvent } from '@/entities/read/subscription-event.entity'
import { SyncBatch } from '@/entities/read/sync-batch.entity'
import { BusinessFiltersDto } from './dto/business-filters.dto'
import { CreateOverrideDto } from './dto/create-override.dto'

const RESOURCE_VALUES = new Set<string>(Object.values(Resource))

@Injectable()
export class BusinessesService {
  constructor(
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
    @InjectRepository(ClientUser) private readonly userRepo: Repository<ClientUser>,
    @InjectRepository(BusinessMember) private readonly memberRepo: Repository<BusinessMember>,
    @InjectRepository(BusinessOverride) private readonly overrideRepo: Repository<BusinessOverride>,
    @InjectRepository(SubscriptionEvent) private readonly eventRepo: Repository<SubscriptionEvent>,
    @InjectRepository(SyncBatch) private readonly syncRepo: Repository<SyncBatch>,
    private readonly redis: RedisService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async findAll(filters: BusinessFiltersDto, scope: PermissionScope | null) {
    const page = Math.max(filters.page ?? 1, 1)
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100)

    const qb = this.businessRepo.createQueryBuilder('b').where('b.deleted_at IS NULL')

    // Permission scope is applied first and cannot be filtered away by the caller.
    if (scope?.city) qb.andWhere('b.city = :scopeCity', { scopeCity: scope.city })
    if (scope?.plan) qb.andWhere('b.plan = :scopePlan', { scopePlan: scope.plan })

    if (filters.status) qb.andWhere('b.subscription_status = :status', { status: filters.status })
    if (filters.plan) qb.andWhere('b.plan = :plan', { plan: filters.plan })
    if (filters.city) qb.andWhere('b.city ILIKE :city', { city: `%${filters.city}%` })
    if (filters.search) {
      // Owner phone/email searched via a subquery (no join) so getManyAndCount + take
      // pagination stays on a single table.
      qb.andWhere(
        '(b.name ILIKE :q OR b.owner_id IN (SELECT u.id FROM users u WHERE u.phone ILIKE :q OR u.email ILIKE :q))',
        { q: `%${filters.search}%` },
      )
    }

    qb.orderBy('b.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)

    const [rows, total] = await qb.getManyAndCount()
    const counts = await this.memberCounts(rows.map((b) => b.id))
    const owners = await this.loadOwners(rows.map((b) => b.ownerId))

    return {
      data: rows.map((b) => this.toSummary(b, counts.get(b.id) ?? 0, owners.get(b.ownerId))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  async findOne(id: string, scope: PermissionScope | null) {
    const business = await this.businessRepo.findOne({ where: { id }, relations: ['owner'] })
    if (!business || business.deletedAt)
      throw new AppNotFoundException('Business not found.', 'BUSINESS_NOT_FOUND')
    this.assertInScope(business, scope)

    const [members, overrides, events, recentSync, memberCount] = await Promise.all([
      this.memberRepo.find({ where: { businessId: id }, relations: ['user'] }),
      this.overrideRepo.find({ where: { businessId: id }, order: { grantedAt: 'DESC' } }),
      this.eventRepo.find({ where: { businessId: id }, order: { createdAt: 'DESC' }, take: 20 }),
      this.syncRepo.find({ where: { businessId: id }, order: { createdAt: 'DESC' }, take: 10 }),
      this.memberRepo.count({ where: { businessId: id } }),
    ])

    return {
      ...this.toSummary(business, memberCount),
      country: business.country,
      phone: business.phone ?? null,
      email: business.email ?? null,
      billingCycle: business.billingCycle,
      trialStartedAt: business.trialStartedAt ?? null,
      currentPeriodStart: business.currentPeriodStart ?? null,
      currentPeriodEnd: business.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: business.cancelAtPeriodEnd,
      owner: business.owner
        ? {
            id: business.owner.id,
            name: business.owner.name,
            phone: business.owner.phone,
            email: business.owner.email ?? null,
          }
        : null,
      members: members.map((m) => ({
        userId: m.userId,
        name: m.user?.name ?? null,
        role: m.role,
        status: m.status,
      })),
      overrides: overrides.map((o) => ({
        id: o.id,
        resource: o.resource,
        granted: o.granted,
        reason: o.reason,
        grantedBy: o.grantedBy,
        grantedAt: o.grantedAt,
        expiresAt: o.expiresAt ?? null,
      })),
      subscriptionHistory: events.map((e) => ({
        event: e.event,
        fromPlan: e.fromPlan ?? null,
        toPlan: e.toPlan ?? null,
        at: e.createdAt,
      })),
      recentSync: recentSync.map((s) => ({
        deviceId: s.deviceId,
        status: s.status,
        failedCount: s.failedCount,
        conflictCount: s.conflictCount,
        lastError: s.lastError ?? null,
        at: s.createdAt,
      })),
    }
  }

  async setStatus(
    id: string,
    status: 'ACTIVE' | 'SUSPENDED',
    _reason: string,
    scope: PermissionScope | null,
  ) {
    const business = await this.businessRepo.findOne({ where: { id } })
    if (!business || business.deletedAt)
      throw new AppNotFoundException('Business not found.', 'BUSINESS_NOT_FOUND')
    this.assertInScope(business, scope)

    await this.businessRepo.update(id, { subscriptionStatus: status })
    await this.invalidate(id)

    // NOTE: notifying the owner by SMS requires the client API's notification pipeline,
    // which the admin API does not share. Left as a follow-up; the action is audit-logged.
    this.logger.log('Business status changed (owner SMS not wired)', 'BusinessesService', {
      id,
      status,
    })

    return this.findOne(id, scope)
  }

  async grantOverride(
    id: string,
    dto: CreateOverrideDto,
    adminId: string,
    scope: PermissionScope | null,
  ) {
    const business = await this.businessRepo.findOne({ where: { id } })
    if (!business || business.deletedAt)
      throw new AppNotFoundException('Business not found.', 'BUSINESS_NOT_FOUND')
    this.assertInScope(business, scope)

    if (!RESOURCE_VALUES.has(dto.resource)) {
      throw new AppForbiddenException(`Unknown resource: "${dto.resource}".`, 'UNKNOWN_RESOURCE', {
        resource: dto.resource,
      })
    }

    const saved = await this.overrideRepo.save(
      this.overrideRepo.create({
        businessId: id,
        resource: dto.resource,
        granted: dto.granted ?? true,
        grantedBy: adminId,
        reason: dto.reason,
        grantedAt: new Date(),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      }),
    )
    await this.invalidate(id)
    return {
      id: saved.id,
      resource: saved.resource,
      granted: saved.granted,
      reason: saved.reason,
      grantedBy: saved.grantedBy,
      grantedAt: saved.grantedAt,
      expiresAt: saved.expiresAt ?? null,
    }
  }

  async revokeOverride(id: string, overrideId: string, scope: PermissionScope | null) {
    const business = await this.businessRepo.findOne({ where: { id } })
    if (!business || business.deletedAt)
      throw new AppNotFoundException('Business not found.', 'BUSINESS_NOT_FOUND')
    this.assertInScope(business, scope)

    const override = await this.overrideRepo.findOne({ where: { id: overrideId, businessId: id } })
    if (!override) throw new AppNotFoundException('Override not found.', 'OVERRIDE_NOT_FOUND')

    await this.overrideRepo.delete(overrideId)
    await this.invalidate(id)
    return { status: 'revoked' as const }
  }

  // ---- internals -----------------------------------------------------------

  private async invalidate(businessId: string) {
    await this.redis.del(businessPermissionsCacheKey(businessId)).catch(() => undefined)
  }

  private assertInScope(business: Business, scope: PermissionScope | null) {
    if (scope?.city && business.city !== scope.city) {
      throw new AppNotFoundException('Business not found.', 'BUSINESS_NOT_FOUND')
    }
    if (scope?.plan && business.plan !== scope.plan) {
      throw new AppNotFoundException('Business not found.', 'BUSINESS_NOT_FOUND')
    }
  }

  private async loadOwners(ownerIds: string[]): Promise<Map<string, ClientUser>> {
    const ids = [...new Set(ownerIds)].filter(Boolean)
    if (ids.length === 0) return new Map()
    const owners = await this.userRepo.find({ where: { id: In(ids) } })
    return new Map(owners.map((o) => [o.id, o]))
  }

  private async memberCounts(businessIds: string[]): Promise<Map<string, number>> {
    if (businessIds.length === 0) return new Map()
    const rows = await this.memberRepo
      .createQueryBuilder('m')
      .select('m.business_id', 'businessId')
      .addSelect('COUNT(*)', 'count')
      .where('m.business_id IN (:...ids)', { ids: businessIds })
      .groupBy('m.business_id')
      .getRawMany<{ businessId: string; count: string }>()
    return new Map(rows.map((r) => [r.businessId, Number(r.count)]))
  }

  private toSummary(b: Business, memberCount: number, owner?: ClientUser) {
    const ownerRef = owner ?? b.owner
    return {
      id: b.id,
      name: b.name,
      slug: b.slug,
      type: b.type,
      city: b.city ?? null,
      plan: b.plan,
      subscriptionStatus: b.subscriptionStatus,
      businessStatus: b.businessStatus,
      trialEndsAt: b.trialEndsAt ?? null,
      ownerName: ownerRef?.name ?? null,
      ownerPhone: ownerRef?.phone ?? null,
      memberCount,
      createdAt: b.createdAt,
    }
  }
}
