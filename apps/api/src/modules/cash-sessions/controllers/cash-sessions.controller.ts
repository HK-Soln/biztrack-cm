import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { JwtPayload, PaginatedResult } from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import type { CashSession } from '@/entities/cash-session.entity'
import {
  ListCashSessionsQueryDto,
  OpenCashSessionDto,
  TransitionCashSessionDto,
} from '../dto/cash-session.dto'
import { CashSessionsService } from '../services/cash-sessions.service'

/**
 * Cash sessions REST surface (BIZ-2.1) — the cloud app's parity path for the desktop's
 * local till writes. Open / list / current / transition; the denomination-count close
 * lands in BIZ-2.4. Gated by Phase2Guard (an authenticated business user runs a till).
 */
@ApiTags('Cash Sessions')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('cash-sessions')
export class CashSessionsController {
  constructor(private readonly cashSessions: CashSessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Open a cash session (start a till shift)' })
  open(@CurrentUser() user: JwtPayload, @Body() dto: OpenCashSessionDto): Promise<CashSession> {
    return this.cashSessions.openSession(user.businessId as string, user, dto)
  }

  @Get()
  @ApiOperation({ summary: 'List cash sessions' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListCashSessionsQueryDto,
  ): Promise<PaginatedResult<CashSession>> {
    return this.cashSessions.list(user.businessId as string, query)
  }

  @Get('current')
  @ApiOperation({ summary: "This device's live cash session (or null)" })
  current(@CurrentUser() user: JwtPayload): Promise<CashSession | null> {
    return this.cashSessions.getCurrent(user.businessId as string, user.deviceId ?? 'unknown')
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a cash session' })
  get(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<CashSession> {
    return this.cashSessions.findById(id, user.businessId as string)
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Transition a cash session through its lifecycle' })
  transition(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: TransitionCashSessionDto,
  ): Promise<CashSession> {
    return this.cashSessions.transition(user.businessId as string, id, dto)
  }
}
