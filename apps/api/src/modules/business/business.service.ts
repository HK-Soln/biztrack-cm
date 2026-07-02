import { Inject, Injectable } from '@nestjs/common'
import { Not } from 'typeorm'
import type {
  AcceptInvitationResponse,
  BulkUpdateMemberRoleRequest,
  BulkUpdateMemberRoleResponse,
  CreateBusinessRequest,
  JwtPayload,
  ListMyInvitationsResponse,
  ListTeamMembersResponse,
  RejectInvitationResponse,
  RemoveTeamMemberResponse,
  UpdateBusinessRequest,
  UpdateMemberRoleRequest,
  UpdateMemberRoleResponse,
  UpdateMemberStatusResponse,
} from '@biztrack/types'
import type { AuditContext } from '@biztrack/types'
import { RedisService } from '@/common/redis/redis.service'
import { AuditService } from '@/modules/audit/audit.service'
import { RealtimeService } from '@/modules/realtime/services/realtime.service'
import { memberStatusCacheKey } from '@/common/membership/membership-cache'
import { BusinessesRepository } from './repositories/businesses.repository'
import { BusinessMembersRepository } from './repositories/business-members.repository'
import { generateSlug } from '@biztrack/utils'
import type { Logger, LogMetadata } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppForbiddenException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { BusinessMemberRole, BusinessMemberStatus, BusinessStatus } from '@biztrack/types'
import { RolesService } from '@/modules/roles/roles.service'
import { AttributeGroupsService } from '@/modules/products/services/attribute-groups.service'

@Injectable()
export class BusinessService {
  constructor(
    private businessRepo: BusinessesRepository,
    private membersRepo: BusinessMembersRepository,
    private rolesService: RolesService,
    private attributeGroupsService: AttributeGroupsService,
    private i18n: I18nService<I18nTranslations>,
    private redis: RedisService,
    private auditService: AuditService,
    private realtime: RealtimeService,
    @Inject(LOGGER) private logger: Logger,
  ) {
    this.logger.setContext('BusinessService')
  }

  async create(ownerId: string, dto: CreateBusinessRequest) {
    this.logger.debug('Create business', 'BusinessService', { ownerId, name: dto.name })

    try {
      const baseSlug = generateSlug(dto.name)
      const slug = await this.generateUniqueSlug(baseSlug)

      const business = this.businessRepo.create({
        ...dto,
        slug,
        ownerId,
        businessStatus: BusinessStatus.ONBOARDING,
      })
      await this.businessRepo.save(business)

      // Seed the 4 default roles for this new business
      await this.rolesService.seedDefaultRoles(business.id, ownerId)
      // Seed the default attribute groups (Color, Size, Storage, …). Idempotent
      // and error-swallowing, so it never blocks business creation.
      await this.attributeGroupsService.seedDefaults(business.id)
      const ownerRole = await this.rolesService.findOwnerRole(business.id)

      const member = this.membersRepo.create({
        businessId: business.id,
        userId: ownerId,
        role: BusinessMemberRole.OWNER,
        roleId: ownerRole?.id ?? null,
        status: BusinessMemberStatus.ACTIVE,
      })
      await this.membersRepo.save(member)

      this.logger.log('Business created', 'BusinessService', { businessId: business.id, ownerId })
      return business
    } catch (error) {
      return this.handleServiceError('create', error, { ownerId, name: dto.name })
    }
  }

  async findByOwner(ownerId: string) {
    this.logger.debug('Find business by owner', 'BusinessService', { ownerId })

    try {
      const business = await this.businessRepo.findOne({
        where: { ownerId },
        relations: ['members'],
      })
      if (!business) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.business_not_found'),
          'BUSINESS_NOT_FOUND',
        )
      }
      return business
    } catch (error) {
      return this.handleServiceError('findByOwner', error, { ownerId })
    }
  }

  async findById(id: string) {
    this.logger.debug('Find business by id', 'BusinessService', { id })

    try {
      const business = await this.businessRepo.findOne({ where: { id } })
      if (!business) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.business_not_found'),
          'BUSINESS_NOT_FOUND',
        )
      }
      return business
    } catch (error) {
      return this.handleServiceError('findById', error, { id })
    }
  }

  async update(id: string, ownerId: string, dto: UpdateBusinessRequest) {
    this.logger.debug('Update business', 'BusinessService', { id, ownerId })

    try {
      const business = await this.businessRepo.findOne({ where: { id } })
      if (!business) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.business_not_found'),
          'BUSINESS_NOT_FOUND',
        )
      }
      const member = await this.membersRepo.findOne({ where: { businessId: id, userId: ownerId } })
      if (!member || member.role !== BusinessMemberRole.OWNER) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.business_forbidden'),
          'BUSINESS_FORBIDDEN',
        )
      }

      const nextStatus =
        business.businessStatus === BusinessStatus.ONBOARDING
          ? BusinessStatus.PLAN_PENDING
          : business.businessStatus
      await this.businessRepo.update(id, { ...dto, businessStatus: nextStatus })
      return this.businessRepo.findOne({ where: { id } })
    } catch (error) {
      return this.handleServiceError('update', error, { id, ownerId })
    }
  }

  async listTeamMembers(businessId: string): Promise<ListTeamMembersResponse> {
    this.logger.debug('List team members', 'BusinessService', { businessId })

    try {
      const members = await this.membersRepo.find({
        where: { businessId, status: Not(BusinessMemberStatus.REMOVED) },
        relations: ['user', 'roleRecord'],
        order: { createdAt: 'ASC' },
      })

      return {
        members: members.map((m) => ({
          memberId: m.id,
          userId: m.userId,
          roleId: m.roleId ?? '',
          roleName: m.roleRecord?.name ?? m.role,
          role: m.role ?? null,
          status: m.status,
          name: m.user?.name ?? null,
          email: m.user?.email ?? null,
          phone: m.user?.phone ?? null,
          joinedAt: m.createdAt.toISOString(),
        })),
      }
    } catch (error) {
      return this.handleServiceError('listTeamMembers', error, { businessId })
    }
  }

  async removeMember(
    businessId: string,
    requestingUserId: string,
    targetUserId: string,
  ): Promise<RemoveTeamMemberResponse> {
    this.logger.debug('Remove team member', 'BusinessService', {
      businessId,
      requestingUserId,
      targetUserId,
    })

    try {
      const requester = await this.membersRepo.findOne({
        where: { businessId, userId: requestingUserId, status: BusinessMemberStatus.ACTIVE },
      })
      if (!requester || requester.role !== BusinessMemberRole.OWNER) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.forbidden'),
          'FORBIDDEN',
        )
      }

      if (requestingUserId === targetUserId) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.team_cannot_remove_self'),
          'TEAM_CANNOT_REMOVE_SELF',
        )
      }

      const target = await this.membersRepo.findOne({
        where: { businessId, userId: targetUserId },
      })
      if (!target) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.not_found'),
          'NOT_FOUND',
        )
      }

      await this.membersRepo.update(target.id, { status: BusinessMemberStatus.REMOVED })
      // Drop the cached membership status so the removed member loses access at once.
      await this.redis.del(memberStatusCacheKey(businessId, targetUserId))
      // Kick the removed member's live realtime sockets right away.
      this.realtime.revokeUser(targetUserId)

      return { removed: true }
    } catch (error) {
      return this.handleServiceError('removeMember', error, {
        businessId,
        requestingUserId,
        targetUserId,
      })
    }
  }

  /** Suspend (revoke access) or reactivate a member. Owner-only; can't target self or
   * the owner. Suspended members are denied at sign-in, select-business and token
   * refresh, so access drops by the next refresh (≤ access-token lifetime). */
  async setMemberActive(
    businessId: string,
    requestingUserId: string,
    targetUserId: string,
    active: boolean,
    context: AuditContext,
  ): Promise<UpdateMemberStatusResponse> {
    this.logger.debug('Set member active', 'BusinessService', { businessId, targetUserId, active })
    try {
      const requester = await this.membersRepo.findOne({
        where: { businessId, userId: requestingUserId, status: BusinessMemberStatus.ACTIVE },
      })
      if (!requester || requester.role !== BusinessMemberRole.OWNER) {
        throw new AppForbiddenException(await this.i18n.translate('errors.forbidden'), 'FORBIDDEN')
      }
      if (requestingUserId === targetUserId) {
        throw new AppForbiddenException(await this.i18n.translate('errors.forbidden'), 'TEAM_CANNOT_SUSPEND_SELF')
      }
      const target = await this.membersRepo.findOne({
        where: { businessId, userId: targetUserId },
        relations: ['user'],
      })
      if (!target || target.status === BusinessMemberStatus.REMOVED) {
        throw new AppNotFoundException(await this.i18n.translate('errors.not_found'), 'NOT_FOUND')
      }
      if (target.role === BusinessMemberRole.OWNER) {
        throw new AppForbiddenException(await this.i18n.translate('errors.forbidden'), 'TEAM_CANNOT_SUSPEND_OWNER')
      }
      const before = target.status
      const status = active ? BusinessMemberStatus.ACTIVE : BusinessMemberStatus.SUSPENDED
      await this.membersRepo.update(target.id, { status })

      // Invalidate the cached membership status so JwtStrategy re-reads it immediately.
      await this.redis.del(memberStatusCacheKey(businessId, targetUserId))
      // On deactivation, kick the member's live realtime sockets right away.
      if (!active) this.realtime.revokeUser(targetUserId)

      this.auditService.log(context, {
        action: 'UPDATE',
        entityType: 'business_member',
        entityId: target.id,
        entityLabel: target.user?.name ?? target.user?.email ?? targetUserId,
        changes: { before: { status: before }, after: { status } },
      })

      return { memberId: target.id, status }
    } catch (error) {
      return this.handleServiceError('setMemberActive', error, { businessId, requestingUserId, targetUserId })
    }
  }

  // -------------------------------------------------------------------------
  // Invitee side: an existing user accepting/declining a pending membership
  // (created when an admin invites someone who already has an account).
  // -------------------------------------------------------------------------

  /** List the current user's pending business invitations (memberships in PENDING). */
  async listMyInvitations(userId: string): Promise<ListMyInvitationsResponse> {
    const pending = await this.membersRepo.find({
      where: { userId, status: BusinessMemberStatus.PENDING },
      relations: ['business', 'roleRecord'],
      order: { createdAt: 'DESC' },
    })
    return {
      items: pending
        .filter((m) => m.business)
        .map((m) => ({
          businessId: m.businessId,
          businessName: m.business?.name ?? '',
          role: m.roleRecord?.name ?? m.role ?? null,
          invitedAt: (m.createdAt instanceof Date
            ? m.createdAt
            : new Date(m.createdAt as unknown as string)
          ).toISOString(),
        })),
    }
  }

  /** Accept a pending invitation → membership becomes ACTIVE. */
  async acceptInvitation(
    userId: string,
    businessId: string,
    context: AuditContext,
  ): Promise<AcceptInvitationResponse> {
    try {
      const membership = await this.membersRepo.findOne({
        where: { userId, businessId },
        relations: ['business'],
      })
      if (!membership || membership.status !== BusinessMemberStatus.PENDING) {
        throw new AppNotFoundException(await this.i18n.translate('errors.not_found'), 'INVITE_INVALID')
      }
      await this.membersRepo.update(membership.id, { status: BusinessMemberStatus.ACTIVE })
      await this.redis.del(memberStatusCacheKey(businessId, userId))
      this.auditService.log(context, {
        action: 'UPDATE',
        entityType: 'business_member',
        entityId: membership.id,
        entityLabel: membership.business?.name ?? businessId,
        changes: {
          before: { status: BusinessMemberStatus.PENDING },
          after: { status: BusinessMemberStatus.ACTIVE },
        },
      })
      return { businessId, accepted: true }
    } catch (error) {
      return this.handleServiceError('acceptInvitation', error, { userId, businessId })
    }
  }

  /** Decline a pending invitation → membership becomes REMOVED. */
  async rejectInvitation(
    userId: string,
    businessId: string,
    context: AuditContext,
  ): Promise<RejectInvitationResponse> {
    try {
      const membership = await this.membersRepo.findOne({
        where: { userId, businessId },
        relations: ['business'],
      })
      if (!membership || membership.status !== BusinessMemberStatus.PENDING) {
        throw new AppNotFoundException(await this.i18n.translate('errors.not_found'), 'INVITE_INVALID')
      }
      await this.membersRepo.update(membership.id, { status: BusinessMemberStatus.REMOVED })
      await this.redis.del(memberStatusCacheKey(businessId, userId))
      this.auditService.log(context, {
        action: 'UPDATE',
        entityType: 'business_member',
        entityId: membership.id,
        entityLabel: membership.business?.name ?? businessId,
        changes: {
          before: { status: BusinessMemberStatus.PENDING },
          after: { status: BusinessMemberStatus.REMOVED },
        },
      })
      return { businessId, rejected: true }
    } catch (error) {
      return this.handleServiceError('rejectInvitation', error, { userId, businessId })
    }
  }

  async updateMemberRole(
    businessId: string,
    actor: JwtPayload,
    targetUserId: string,
    dto: UpdateMemberRoleRequest,
  ): Promise<UpdateMemberRoleResponse> {
    this.logger.debug('Update member role', 'BusinessService', {
      businessId,
      actorId: actor.sub,
      targetUserId,
    })

    try {
      if (actor.sub === targetUserId) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.team_cannot_change_own_role'),
          'TEAM_CANNOT_CHANGE_OWN_ROLE',
        )
      }

      const target = await this.membersRepo.findOne({
        where: { businessId, userId: targetUserId, status: BusinessMemberStatus.ACTIVE },
        relations: ['roleRecord'],
      })
      if (!target) {
        throw new AppNotFoundException(await this.i18n.translate('errors.not_found'), 'NOT_FOUND')
      }

      // Cannot reassign the owner
      if (target.roleRecord?.isOwnerRole) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.forbidden'),
          'FORBIDDEN',
        )
      }

      const newRole = await this.rolesService.findByIdOrFail(dto.roleId, businessId)
      if (newRole.isOwnerRole) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.forbidden'),
          'FORBIDDEN',
        )
      }

      // Non-owners: must have roles:manage and pass containment on both current and new role
      if (!actor.isOwner) {
        const actorPerms = await this.rolesService.getActorPermissions(actor.roleId, businessId)
        if (!actorPerms.has('roles:manage')) {
          throw new AppForbiddenException(
            await this.i18n.translate('errors.forbidden'),
            'FORBIDDEN',
          )
        }
        // Cannot touch a member whose current role exceeds actor's permissions
        if (target.roleId) {
          await this.rolesService.assertRoleContained(target.roleId, actorPerms)
        }
        // Cannot assign a role that exceeds actor's permissions
        await this.rolesService.assertRoleContained(newRole.id, actorPerms)
      }

      const enumRole = RolesService.toMemberRoleEnum(newRole.name)
      await this.membersRepo.update(target.id, { role: enumRole, roleId: newRole.id })

      return { memberId: target.id, roleId: newRole.id, roleName: newRole.name, role: enumRole }
    } catch (error) {
      return this.handleServiceError('updateMemberRole', error, {
        businessId,
        actorId: actor.sub,
        targetUserId,
      })
    }
  }

  async bulkUpdateMemberRole(
    businessId: string,
    actor: JwtPayload,
    dto: BulkUpdateMemberRoleRequest,
  ): Promise<BulkUpdateMemberRoleResponse> {
    this.logger.debug('Bulk update member roles', 'BusinessService', {
      businessId,
      actorId: actor.sub,
      count: dto.userIds.length,
    })

    try {
      const newRole = await this.rolesService.findByIdOrFail(dto.roleId, businessId)
      if (newRole.isOwnerRole) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.forbidden'),
          'FORBIDDEN',
        )
      }

      let actorPerms: Set<string> | null = null
      if (!actor.isOwner) {
        actorPerms = await this.rolesService.getActorPermissions(actor.roleId, businessId)
        if (!actorPerms.has('roles:manage')) {
          throw new AppForbiddenException(
            await this.i18n.translate('errors.forbidden'),
            'FORBIDDEN',
          )
        }
        await this.rolesService.assertRoleContained(newRole.id, actorPerms)
      }

      const members = await this.membersRepo.find({
        where: { businessId, status: BusinessMemberStatus.ACTIVE },
        relations: ['roleRecord'],
      })

      const eligibleMembers = members.filter(
        (m) =>
          dto.userIds.includes(m.userId) &&
          m.userId !== actor.sub &&
          !m.roleRecord?.isOwnerRole,
      )

      if (!actor.isOwner && actorPerms) {
        for (const m of eligibleMembers) {
          if (m.roleId) {
            await this.rolesService.assertRoleContained(m.roleId, actorPerms)
          }
        }
      }

      const enumRole = RolesService.toMemberRoleEnum(newRole.name)
      await Promise.all(
        eligibleMembers.map((m) =>
          this.membersRepo.update(m.id, { role: enumRole, roleId: newRole.id }),
        ),
      )

      return { updated: eligibleMembers.length }
    } catch (error) {
      return this.handleServiceError('bulkUpdateMemberRole', error, {
        businessId,
        actorId: actor.sub,
      })
    }
  }

  async listMembershipsForUser(userId: string) {
    this.logger.debug('List memberships for user', 'BusinessService', { userId })

    try {
      return this.membersRepo.find({
        where: { userId },
        relations: ['business'],
        order: { createdAt: 'ASC' },
      })
    } catch (error) {
      return this.handleServiceError('listMembershipsForUser', error, { userId })
    }
  }

  private async generateUniqueSlug(base: string): Promise<string> {
    let slug = base
    let counter = 1
    while (await this.businessRepo.findOne({ where: { slug } })) {
      slug = `${base}-${counter++}`
    }
    return slug
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('BusinessService error', 'BusinessService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    this.logger.error('BusinessService unexpected error', 'BusinessService', {
      action,
      message,
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'BUSINESS_SERVICE_ERROR',
      { action },
    )
  }
}
