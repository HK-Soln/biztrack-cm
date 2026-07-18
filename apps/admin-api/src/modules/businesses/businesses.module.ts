import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Business } from '@/entities/read/business.entity'
import { ClientUser } from '@/entities/read/client-user.entity'
import { BusinessMember } from '@/entities/read/business-member.entity'
import { BusinessOverride } from '@/entities/read/business-override.entity'
import { SubscriptionEvent } from '@/entities/read/subscription-event.entity'
import { SyncBatch } from '@/entities/read/sync-batch.entity'
import { BusinessesController } from './businesses.controller'
import { BusinessesService } from './businesses.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Business,
      ClientUser,
      BusinessMember,
      BusinessOverride,
      SubscriptionEvent,
      SyncBatch,
    ]),
  ],
  controllers: [BusinessesController],
  providers: [BusinessesService],
})
export class BusinessesModule {}
