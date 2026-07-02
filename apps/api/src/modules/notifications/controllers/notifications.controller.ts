import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type {
  JwtPayload,
  ListNotificationsResponse,
  MarkAllNotificationsReadResponse,
  MarkNotificationReadResponse,
  UnreadCountResponse,
} from '@biztrack/types'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { NotificationsService } from '../services/notifications.service'

/** Per-user in-app notification feed (bell/banner). Any authenticated user can read
 * and mark their own notifications — these are personal, not business-scoped. */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my in-app notifications (paginated)' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<ListNotificationsResponse> {
    return this.notifications.listInApp(user.sub, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count my unread in-app notifications' })
  unreadCount(@CurrentUser() user: JwtPayload): Promise<UnreadCountResponse> {
    return this.notifications.unreadCount(user.sub)
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all my in-app notifications read' })
  markAllRead(@CurrentUser() user: JwtPayload): Promise<MarkAllNotificationsReadResponse> {
    return this.notifications.markAllRead(user.sub)
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one in-app notification read' })
  markRead(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<MarkNotificationReadResponse> {
    return this.notifications.markRead(user.sub, id)
  }
}
