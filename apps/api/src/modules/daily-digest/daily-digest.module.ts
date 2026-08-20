import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RedisModule } from '@/common/redis/redis.module'
import { SyncFreshnessModule } from '@/common/sync-freshness/sync-freshness.module'
import { Business } from '@/entities/business.entity'
import { DailySaleSummary } from '@/entities/daily-sale-summary.entity'
import { NotificationSetting } from '@/entities/notification-setting.entity'
import { NotificationsModule } from '@/modules/notifications/notifications.module'
import { SalesModule } from '@/modules/sales/sales.module'
import { CashSessionsModule } from '@/modules/cash-sessions/cash-sessions.module'
import { InventoryModule } from '@/modules/inventory/inventory.module'
import { DebtsModule } from '@/modules/debts/debts.module'
import { DAILY_DIGEST_QUEUE } from './constants/daily-digest.constants'
import { DailyDigestController } from './controllers/daily-digest.controller'
import { DailyDigestService } from './services/daily-digest.service'
import { DailyDigestScheduler } from './schedulers/daily-digest.scheduler'
import { DailyDigestProcessor } from './processors/daily-digest.processor'

/**
 * Owner daily-summary digest (P2). Sent per-business at that weekday's closing time +
 * configured offset, evaluated in the business timezone. Reuses the canonical report
 * services (sales/cash/inventory/debts) so the recap matches the on-screen reports, and
 * dispatches through the notification control plane (DAILY_SUMMARY event).
 */
@Module({
  imports: [
    NotificationsModule,
    SalesModule,
    CashSessionsModule,
    InventoryModule,
    DebtsModule,
    SyncFreshnessModule,
    RedisModule,
    BullModule.registerQueue({ name: DAILY_DIGEST_QUEUE }),
    TypeOrmModule.forFeature([Business, NotificationSetting, DailySaleSummary]),
  ],
  controllers: [DailyDigestController],
  providers: [DailyDigestService, DailyDigestScheduler, DailyDigestProcessor],
  exports: [DailyDigestService],
})
export class DailyDigestModule {}
