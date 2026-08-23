import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuditLog } from '@/entities/audit-log.entity'
import { Business } from '@/entities/business.entity'
import { NotificationsModule } from '@/modules/notifications/notifications.module'
import { AUDIT_QUEUE } from './constants/audit.constants'
import { AuditController } from './audit.controller'
import { AuditProcessor } from './audit.processor'
import { AuditService } from './audit.service'
import { TeamActivityNotifier } from './team-activity.notifier'

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog, Business]),
    BullModule.registerQueue({ name: AUDIT_QUEUE }),
    NotificationsModule,
  ],
  controllers: [AuditController],
  providers: [AuditService, AuditProcessor, TeamActivityNotifier],
  exports: [AuditService],
})
export class AuditModule {}
