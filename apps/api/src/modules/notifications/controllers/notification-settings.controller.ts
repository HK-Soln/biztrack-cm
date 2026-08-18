import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { JwtPayload, NotificationSettings } from '@biztrack/types'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { NotificationSettingsService } from '../services/notification-settings.service'
import {
  AddNotificationRecipientDto,
  UpdateNotificationMatrixDto,
  UpdateQuietHoursDto,
  UpdateRecipientSubscriptionsDto,
} from '../dto/notification-settings.dto'

/** Owner-only notification preferences (the Settings → Notifications control plane).
 * Business-scoped (phase2). Every producer routes through the dispatcher, which reads
 * what these endpoints configure. */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications/settings')
@UseGuards(Phase2Guard)
export class NotificationSettingsController {
  constructor(private readonly service: NotificationSettingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get the business notification settings (matrix + quiet hours + recipients)',
  })
  get(@CurrentUser() user: JwtPayload): Promise<NotificationSettings> {
    return this.service.getSettings(user.businessId as string, user.sub)
  }

  @Put('matrix')
  @ApiOperation({ summary: 'Upsert event×channel matrix cells' })
  updateMatrix(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateNotificationMatrixDto,
  ): Promise<NotificationSettings> {
    return this.service.updateMatrix(user.businessId as string, user.sub, dto)
  }

  @Put('quiet-hours')
  @ApiOperation({ summary: 'Set quiet hours' })
  updateQuietHours(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateQuietHoursDto,
  ): Promise<NotificationSettings> {
    return this.service.updateQuietHours(user.businessId as string, user.sub, dto)
  }

  @Post('recipients')
  @ApiOperation({ summary: 'Add a bare (email/phone) recipient' })
  addRecipient(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AddNotificationRecipientDto,
  ): Promise<NotificationSettings> {
    return this.service.addRecipient(user.businessId as string, user.sub, dto)
  }

  @Put('recipients/:id/subscriptions')
  @ApiOperation({ summary: 'Set which events a recipient receives' })
  updateRecipientSubscriptions(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRecipientSubscriptionsDto,
  ): Promise<NotificationSettings> {
    return this.service.updateRecipientSubscriptions(user.businessId as string, user.sub, id, dto)
  }

  @Delete('recipients/:id')
  @ApiOperation({ summary: 'Remove a bare recipient' })
  removeRecipient(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<NotificationSettings> {
    return this.service.removeRecipient(user.businessId as string, user.sub, id)
  }
}
