import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ScheduleModule } from '@nestjs/schedule'
import { Business } from '@/entities/business.entity'
import { SubscriptionEvent } from '@/entities/subscription-event.entity'
import { BusinessesRepository } from '@/modules/business/repositories/businesses.repository'
import { SubscriptionEventsRepository } from './repositories/subscription-events.repository'
import { PermissionsModule } from '@/modules/permissions/permissions.module'
import { SubscriptionsService } from './subscriptions.service'
import { SubscriptionsScheduler } from './subscriptions.scheduler'

@Module({
  imports: [
    PermissionsModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Business, SubscriptionEvent]),
  ],
  providers: [SubscriptionsService, SubscriptionsScheduler, BusinessesRepository, SubscriptionEventsRepository],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
