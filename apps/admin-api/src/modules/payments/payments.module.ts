import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Business } from '@/entities/read/business.entity'
import { SubscriptionEvent } from '@/entities/read/subscription-event.entity'
import { PaymentsController } from './payments.controller'
import { PaymentsService } from './payments.service'

@Module({
  imports: [TypeOrmModule.forFeature([Business, SubscriptionEvent])],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
