import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Business } from '@/entities/read/business.entity'
import { PlanConfig } from '@/entities/read/plan-config.entity'
import { SubscriptionEvent } from '@/entities/read/subscription-event.entity'
import { SupportTicket } from '@/entities/support-ticket.entity'
import { MetricsController } from './metrics.controller'
import { MetricsService } from './metrics.service'

@Module({
  imports: [TypeOrmModule.forFeature([Business, PlanConfig, SubscriptionEvent, SupportTicket])],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
