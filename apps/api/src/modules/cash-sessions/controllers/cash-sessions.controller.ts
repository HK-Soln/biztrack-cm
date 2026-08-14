import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { CashSessionExpectedCash, JwtPayload, PaginatedResult } from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import type { CashSession } from '@/entities/cash-session.entity'
import type { CashMovement } from '@/entities/cash-movement.entity'
import {
  CloseCashSessionDto,
  ListCashSessionsQueryDto,
  OpenCashSessionDto,
  RecordCashMovementDto,
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

  @Get(':id/expected-cash')
  @ApiOperation({ summary: 'Expected drawer cash + breakdown for a session' })
  expectedCash(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<CashSessionExpectedCash> {
    return this.cashSessions.expectedCash(user.businessId as string, id)
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

  @Post(':id/close')
  @ApiOperation({ summary: 'Close a shift with a blind denomination count' })
  close(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CloseCashSessionDto,
  ): Promise<CashSession> {
    return this.cashSessions.closeSession(user.businessId as string, id, dto)
  }

  @Post(':id/movements')
  @ApiOperation({ summary: 'Record a cash movement against a shift' })
  recordMovement(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RecordCashMovementDto,
  ): Promise<CashMovement> {
    return this.cashSessions.recordMovement(user.businessId as string, user, id, dto)
  }

  @Get(':id/movements')
  @ApiOperation({ summary: 'List cash movements for a shift' })
  listMovements(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<CashMovement[]> {
    return this.cashSessions.listMovements(user.businessId as string, id)
  }
}
