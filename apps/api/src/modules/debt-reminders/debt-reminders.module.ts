import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RedisModule } from '@/common/redis/redis.module'
import { SyncFreshnessModule } from '@/common/sync-freshness/sync-freshness.module'
import { Business } from '@/entities/business.entity'
import { Debt } from '@/entities/debt.entity'
import { NotificationsModule } from '@/modules/notifications/notifications.module'
import { DebtsModule } from '@/modules/debts/debts.module'
import { DEBT_REMINDER_QUEUE } from './constants/debt-reminders.constants'
import { DebtReminderService } from './services/debt-reminder.service'
import { DebtReminderScheduler } from './schedulers/debt-reminder.scheduler'
import { DebtReminderProcessor } from './processors/debt-reminder.processor'

/**
 * Owner debt-due reminders (BIZ-4.3 / P3). A daily scan dispatches a DEBT_DUE reminder to
 * each business with receivables past their effective due date (D9), naming the biggest
 * debtors so the owner can follow up. Reuses the ageing computation (DebtsModule) and the
 * notification control plane.
 */
@Module({
  imports: [
    NotificationsModule,
    DebtsModule,
    SyncFreshnessModule,
    RedisModule,
    BullModule.registerQueue({ name: DEBT_REMINDER_QUEUE }),
    TypeOrmModule.forFeature([Business, Debt]),
  ],
  providers: [DebtReminderService, DebtReminderScheduler, DebtReminderProcessor],
  exports: [DebtReminderService],
})
export class DebtRemindersModule {}
