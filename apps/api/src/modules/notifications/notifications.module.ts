import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Notification } from '@/entities/notification.entity'
import { PendingInvite } from '@/entities/pending-invite.entity'
import { NotificationSetting } from '@/entities/notification-setting.entity'
import { NotificationRecipient } from '@/entities/notification-recipient.entity'
import { BusinessMember } from '@/entities/business-member.entity'
import { Business } from '@/entities/business.entity'
import { User } from '@/entities/user.entity'
import { NotificationSettingsService } from './services/notification-settings.service'
import { NotificationDispatcher } from './services/notification-dispatcher.service'
import { NotificationSettingsController } from './controllers/notification-settings.controller'
import { NOTIFICATIONS_QUEUE } from './constants/notifications.constants'
import { WahaHttpClient } from './providers/waha-http.client'
import { EmailProvider } from './providers/email.provider'
import { SmsProvider } from './providers/sms.provider'
import { WhatsAppProvider } from './providers/whatsapp.provider'
import { NotificationsService } from './services/notifications.service'
import { NotificationsProcessor } from './processors/notifications.processor'
import { NotificationsWebhookController } from './controllers/notifications-webhook.controller'
import { NotificationsController } from './controllers/notifications.controller'
import { ResendWebhookGuard } from './guards/resend-webhook.guard'
import { WahaWebhookGuard } from './guards/waha-webhook.guard'
import { RedisModule } from '@/common/redis/redis.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      PendingInvite,
      NotificationSetting,
      NotificationRecipient,
      BusinessMember,
      Business,
      User,
    ]),
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
    RedisModule,
  ],
  controllers: [
    NotificationsWebhookController,
    NotificationsController,
    NotificationSettingsController,
  ],
  providers: [
    WahaHttpClient,
    EmailProvider,
    SmsProvider,
    WhatsAppProvider,
    NotificationsService,
    NotificationSettingsService,
    NotificationDispatcher,
    NotificationsProcessor,
    ResendWebhookGuard,
    WahaWebhookGuard,
  ],
  exports: [
    NotificationsService,
    NotificationSettingsService,
    NotificationDispatcher,
    WhatsAppProvider,
    EmailProvider,
  ],
})
export class NotificationsModule {}
