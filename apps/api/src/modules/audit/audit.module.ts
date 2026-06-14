import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuditLog } from '@/entities/audit-log.entity'
import { AUDIT_QUEUE } from './constants/audit.constants'
import { AuditController } from './audit.controller'
import { AuditProcessor } from './audit.processor'
import { AuditService } from './audit.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    BullModule.registerQueue({ name: AUDIT_QUEUE }),
  ],
  controllers: [AuditController],
  providers: [AuditService, AuditProcessor],
  exports: [AuditService],
})
export class AuditModule {}
