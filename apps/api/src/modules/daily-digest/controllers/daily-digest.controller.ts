import { Controller, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { JwtPayload } from '@biztrack/types'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { DailyDigestService, type DailyDigestFigures } from '../services/daily-digest.service'

/** Owner-only preview trigger for the daily summary (BIZ-4.1/4.2). Sends today's digest
 * immediately (bypassing quiet hours) so the owner can see how it renders on each
 * channel — it's the real message, honouring the matrix + recipients. */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications/daily-digest')
@UseGuards(Phase2Guard)
export class DailyDigestController {
  constructor(private readonly digest: DailyDigestService) {}

  @Post('test')
  @ApiOperation({ summary: 'Send today’s daily summary now (owner-only preview)' })
  sendTest(@CurrentUser() user: JwtPayload): Promise<DailyDigestFigures> {
    return this.digest.sendTestDigest(user.businessId as string, user.sub)
  }
}
