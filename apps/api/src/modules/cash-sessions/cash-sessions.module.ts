import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CashSession } from '@/entities/cash-session.entity'
import { CashCountLine } from '@/entities/cash-count-line.entity'
import { CashMovement } from '@/entities/cash-movement.entity'
import { CashSessionsController } from './controllers/cash-sessions.controller'
import { CashSessionsService } from './services/cash-sessions.service'

@Module({
  imports: [TypeOrmModule.forFeature([CashSession, CashCountLine, CashMovement])],
  controllers: [CashSessionsController],
  providers: [CashSessionsService],
  exports: [CashSessionsService],
})
export class CashSessionsModule {}
