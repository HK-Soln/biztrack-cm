import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Business } from '@/entities/read/business.entity'
import { SubscriptionEvent } from '@/entities/read/subscription-event.entity'
import { SubscriptionsController } from './subscriptions.controller'
import { SubscriptionsService } from './subscriptions.service'

@Module({
  imports: [TypeOrmModule.forFeature([Business, SubscriptionEvent])],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}
