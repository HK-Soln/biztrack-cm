import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { JwtPayload } from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { AuditService } from './audit.service'
import { QueryAuditLogDto } from './dto/query-audit-log.dto'

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Query the business activity log' })
  async query(@CurrentUser() user: JwtPayload, @Query() query: QueryAuditLogDto) {
    return this.auditService.query(user.businessId as string, query)
  }

  @Get(':entityType/:entityId')
  @ApiOperation({ summary: 'History for a single entity' })
  async entityHistory(
    @CurrentUser() user: JwtPayload,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query() query: QueryAuditLogDto,
  ) {
    return this.auditService.query(user.businessId as string, { ...query, entityType, entityId })
  }
}
