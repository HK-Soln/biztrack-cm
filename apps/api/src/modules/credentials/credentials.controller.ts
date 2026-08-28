import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  BusinessMemberRole,
  type AuditContext,
  type IssueCardResponse,
  type JwtPayload,
  type MemberAuthCredential,
} from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { AppForbiddenException } from '@/common/exceptions/app-exceptions'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { CurrentAuditContext } from '@/modules/audit/decorators/audit-context.decorator'
import { CredentialsService } from './credentials.service'
import { IssueCardDto } from './dto/issue-card.dto'

/**
 * BIZ-3.3 — member authorization credentials (scannable cards). Issuing/revoking is an OWNER
 * action (a separate authority from `can_authorize`, which only says who may APPROVE a sale). The
 * owner never sees a stored secret; issue returns the token once for printing.
 */
@ApiTags('credentials')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('credentials')
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  private assertOwner(user: JwtPayload): void {
    if (user.role !== BusinessMemberRole.OWNER) {
      throw new AppForbiddenException('Only the business owner can manage cards.', 'FORBIDDEN')
    }
  }

  @Get()
  @ApiOperation({ summary: 'List the business credentials (owner-only)' })
  list(@CurrentUser() user: JwtPayload): Promise<MemberAuthCredential[]> {
    this.assertOwner(user)
    return this.credentials.listForBusiness(user.businessId as string)
  }

  @Post('cards')
  @ApiOperation({ summary: 'Issue a scannable card for a member (owner-only)' })
  issueCard(
    @CurrentUser() user: JwtPayload,
    @Body() dto: IssueCardDto,
    @CurrentAuditContext() context: AuditContext,
  ): Promise<IssueCardResponse> {
    this.assertOwner(user)
    return this.credentials.issueCard(user.businessId as string, user.sub, dto, context)
  }

  @Post(':id/revoke')
  @ApiOperation({ summary: 'Revoke a card (owner-only)' })
  revoke(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @CurrentAuditContext() context: AuditContext,
  ): Promise<MemberAuthCredential> {
    this.assertOwner(user)
    return this.credentials.revokeCard(user.businessId as string, id, context)
  }
}
