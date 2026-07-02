import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type {
  AcceptInvitationResponse,
  BulkUpdateMemberRoleResponse,
  Business,
  BusinessMembershipSummary,
  JwtPayload,
  ListMyInvitationsResponse,
  ListTeamMembersResponse,
  RejectInvitationResponse,
  RemoveTeamMemberResponse,
  UpdateMemberRoleResponse,
} from '@biztrack/types'
import type { AuditContext } from '@biztrack/types'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { CurrentAuditContext } from '@/modules/audit/decorators/audit-context.decorator'
import { BusinessMembersRepository } from './repositories/business-members.repository'
import { BusinessService } from './business.service'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import {
  BusinessDto,
  BusinessMembershipSummaryDto,
  ListTeamMembersResponseDto,
  RemoveTeamMemberResponseDto,
  UpdateMemberRoleResponseDto,
} from './dto/business-response.dto'
import { UpdateBusinessDto } from './dto/update-business.dto'
import { UpdateMemberRoleDto } from './dto/update-member-role.dto'
import { BulkUpdateMemberRoleDto } from './dto/bulk-update-member-role.dto'
import { UpdateMemberStatusDto } from './dto/update-member-status.dto'
import { serializeDto, serializeDtos } from '@/common/http/serialization'

@ApiTags('Businesses')
@ApiBearerAuth()
@Controller('businesses')
export class BusinessesController {
  constructor(
    private membersRepo: BusinessMembersRepository,
    private businessService: BusinessService,
  ) {}

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List businesses for current user' })
  async mine(@CurrentUser() user: JwtPayload) {
    const memberships = await this.businessService.listMembershipsForUser(user.sub)
    const businesses = serializeDtos(memberships, (membership) =>
      BusinessMembershipSummaryDto.fromEntity(membership),
    )
    return businesses
  }

  @Post('setup')
  @UseGuards(Phase2Guard)
  @ApiOperation({ summary: 'Setup business details during onboarding' })
  setup(@CurrentUser() user: JwtPayload, @Body() dto: UpdateBusinessDto) {
    return this.businessService.update(user.businessId as string, user.sub, dto)
  }

  @Get('invitations')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List my pending business invitations (existing-user invites)' })
  listMyInvitations(@CurrentUser() user: JwtPayload): Promise<ListMyInvitationsResponse> {
    return this.businessService.listMyInvitations(user.sub)
  }

  @Post('invitations/:businessId/accept')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Accept a pending invitation (membership → active)' })
  acceptInvitation(
    @CurrentUser() user: JwtPayload,
    @Param('businessId') businessId: string,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<AcceptInvitationResponse> {
    return this.businessService.acceptInvitation(user.sub, businessId, auditContext)
  }

  @Post('invitations/:businessId/reject')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Decline a pending invitation (membership → removed)' })
  rejectInvitation(
    @CurrentUser() user: JwtPayload,
    @Param('businessId') businessId: string,
    @CurrentAuditContext() auditContext: AuditContext,
  ): Promise<RejectInvitationResponse> {
    return this.businessService.rejectInvitation(user.sub, businessId, auditContext)
  }

  @Get('members')
  @UseGuards(Phase2Guard)
  @ApiOperation({ summary: 'List team members for the current business' })
  async listMembers(@CurrentUser() user: JwtPayload): Promise<ListTeamMembersResponse> {
    return serializeDto(
      ListTeamMembersResponseDto.fromModel(
        await this.businessService.listTeamMembers(user.businessId as string),
      ),
    )
  }

  @Patch('members/:userId/role')
  @UseGuards(Phase2Guard)
  @ApiOperation({ summary: 'Update a team member role' })
  async updateMemberRole(
    @CurrentUser() user: JwtPayload,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<UpdateMemberRoleResponse> {
    return serializeDto(
      UpdateMemberRoleResponseDto.fromModel(
        await this.businessService.updateMemberRole(user.businessId as string, user, targetUserId, dto),
      ),
    )
  }

  @Patch('members/:userId/status')
  @UseGuards(Phase2Guard)
  @ApiOperation({ summary: 'Deactivate (suspend) or reactivate a team member' })
  async setMemberStatus(
    @CurrentUser() user: JwtPayload,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberStatusDto,
    @CurrentAuditContext() auditContext: AuditContext,
  ) {
    return this.businessService.setMemberActive(user.businessId as string, user.sub, targetUserId, dto.active, auditContext)
  }

  @Patch('members/bulk-role')
  @UseGuards(Phase2Guard)
  @ApiOperation({ summary: 'Assign a role to multiple members at once' })
  async bulkUpdateMemberRole(
    @CurrentUser() user: JwtPayload,
    @Body() dto: BulkUpdateMemberRoleDto,
  ): Promise<BulkUpdateMemberRoleResponse> {
    return this.businessService.bulkUpdateMemberRole(user.businessId as string, user, dto)
  }

  @Delete('members/:userId')
  @UseGuards(Phase2Guard)
  @ApiOperation({ summary: 'Remove a team member (owner only)' })
  async removeMember(
    @CurrentUser() user: JwtPayload,
    @Param('userId') targetUserId: string,
  ): Promise<RemoveTeamMemberResponse> {
    return serializeDto(
      RemoveTeamMemberResponseDto.fromModel(
        await this.businessService.removeMember(
          user.businessId as string,
          user.sub,
          targetUserId,
        ),
      ),
    )
  }

}
