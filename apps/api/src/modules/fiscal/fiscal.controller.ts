import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { BusinessMemberRole, type JwtPayload } from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { AppForbiddenException } from '@/common/exceptions/app-exceptions'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { FiscalYearsService } from './fiscal-years.service'
import { FiscalPeriodsService } from './fiscal-periods.service'

/**
 * BIZ-5.2/5.3 — fiscal calendar + period close. Reading the calendar is open to any member;
 * closing / locking a period is an OWNER action (a significant, mostly-irreversible operation).
 */
@ApiTags('Fiscal')
@ApiBearerAuth()
@Controller('fiscal')
@UseGuards(Phase2Guard)
export class FiscalController {
  constructor(
    private readonly fiscalYears: FiscalYearsService,
    private readonly fiscalPeriods: FiscalPeriodsService,
  ) {}

  private assertOwner(user: JwtPayload): void {
    if (user.role !== BusinessMemberRole.OWNER) {
      throw new AppForbiddenException('Only the business owner can do this.', 'FORBIDDEN')
    }
  }

  @Get('calendar')
  @ApiOperation({ summary: 'List fiscal years and their accounting periods' })
  async calendar(@CurrentUser() user: JwtPayload) {
    const businessId = user.businessId as string
    // Self-heal: a business created before the fiscal calendar shipped (or whose setup hook was
    // missed) has no periods yet. Generate them on first view (idempotent), then list.
    await this.fiscalYears.ensureUpcoming(businessId).catch(() => undefined)
    return this.fiscalYears.listCalendar(businessId)
  }

  @Get('adjustments')
  @ApiOperation({ summary: 'List prior-period adjustments (late arrivals redated forward)' })
  adjustments(@CurrentUser() user: JwtPayload) {
    return this.fiscalPeriods.listAdjustments(user.businessId as string)
  }

  @Post('periods/:id/close')
  @ApiOperation({ summary: 'Close an accounting period (owner only)' })
  close(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    this.assertOwner(user)
    return this.fiscalPeriods.closePeriod(user.businessId as string, id, user.sub)
  }

  @Post('periods/:id/lock')
  @ApiOperation({ summary: 'Lock a closed accounting period (owner only, terminal)' })
  lock(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    this.assertOwner(user)
    return this.fiscalPeriods.lockPeriod(user.businessId as string, id)
  }
}
