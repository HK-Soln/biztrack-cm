import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { NOTIFICATION_EVENTS, type NotificationEvent } from '@biztrack/types'

/** Dev-only: dispatch a test notification carrying a deeplink, to check the external-link
 * handoff (WhatsApp/email → web app → installed native app). */
export class TestDeeplinkDto {
  @ApiPropertyOptional({
    example: '/contacts',
    description: 'In-app route the notification links to. Default /contacts.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  deeplink?: string

  @ApiPropertyOptional({
    description:
      'Configurable event to dispatch under (governs which channels fire). Default DAILY_SUMMARY.',
  })
  @IsOptional()
  @IsIn(NOTIFICATION_EVENTS)
  event?: NotificationEvent
}
