import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { NotificationType, type JwtPayload } from '@biztrack/types'
import { buildAppUrl } from '@biztrack/utils'
import type { AppConfig } from '@/config/configuration'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { AppForbiddenException } from '@/common/exceptions/app-exceptions'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { NotificationDispatcher } from '../services/notification-dispatcher.service'
import { TestDeeplinkDto } from '../dto/test-deeplink.dto'

/**
 * DEV-ONLY helper to test the notification deep-link handoff (N7). Dispatches a real
 * notification carrying a deeplink through the control plane, so the WhatsApp/email message
 * comes out with the full `APP_URL/?openapp=1#/route` link — and returns that URL too, so it
 * can also be tested straight in a browser (without WAHA/matrix/recipient config). Disabled
 * in production.
 */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications/test-deeplink')
@UseGuards(Phase2Guard)
export class NotificationsTestController {
  constructor(
    private readonly dispatcher: NotificationDispatcher,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Dev-only: dispatch a test notification carrying a deeplink' })
  async trigger(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TestDeeplinkDto,
  ): Promise<{ dispatched: true; deeplink: string; externalUrl: string | null }> {
    if (String(this.config.get('NODE_ENV', { infer: true })) === 'production') {
      throw new AppForbiddenException('Test endpoint disabled in production', 'FORBIDDEN')
    }
    const deeplink = dto.deeplink?.trim() || '/contacts'
    const event = dto.event ?? NotificationType.DAILY_SUMMARY

    await this.dispatcher.dispatch({
      businessId: user.businessId as string,
      event,
      title: 'BizTrack deep-link test',
      body: 'Tap the link to test opening the app on the right screen.',
      deeplink,
    })

    // The same link the external channels carry — copy it into a browser to test the handoff
    // directly, independent of WAHA/matrix/recipient setup.
    const webUrl = buildAppUrl(this.config.get('APP_URL', { infer: true }), deeplink)
    const externalUrl = webUrl ? webUrl.replace('#', '?openapp=1#') : null
    return { dispatched: true, deeplink, externalUrl }
  }
}
