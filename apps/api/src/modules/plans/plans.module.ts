import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PlanConfig } from '@/entities/plan-config.entity'
import { Business } from '@/entities/business.entity'
import { SubscriptionEvent } from '@/entities/subscription-event.entity'
import { PlansController } from './plans.controller'
import { PlansService } from './plans.service'
import { PlanConfigsRepository } from '@/modules/permissions/repositories/plan-configs.repository'
import { SubscriptionEventsRepository } from '@/modules/subscriptions/repositories/subscription-events.repository'
import { PermissionsModule } from '@/modules/permissions/permissions.module'
import { BusinessesRepository } from '@/modules/business/repositories/businesses.repository'

@Module({
  imports: [PermissionsModule, TypeOrmModule.forFeature([PlanConfig, Business, SubscriptionEvent])],
  controllers: [PlansController],
  providers: [PlansService, PlanConfigsRepository, SubscriptionEventsRepository, BusinessesRepository],
})
export class PlansModule {}
