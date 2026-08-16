import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CashSession } from '@/entities/cash-session.entity'
import { CashCountLine } from '@/entities/cash-count-line.entity'
import { CashMovement } from '@/entities/cash-movement.entity'
import { AuditModule } from '@/modules/audit/audit.module'
import { CashSessionsController } from './controllers/cash-sessions.controller'
import { CashSessionsService } from './services/cash-sessions.service'
import { CashSessionsScheduler } from './cash-sessions.scheduler'

@Module({
  imports: [TypeOrmModule.forFeature([CashSession, CashCountLine, CashMovement]), AuditModule],
  controllers: [CashSessionsController],
  providers: [CashSessionsService, CashSessionsScheduler],
  exports: [CashSessionsService],
})
export class CashSessionsModule {}
