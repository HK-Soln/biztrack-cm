import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Business } from '@/entities/business.entity'
import { ReviewFlagRecord } from '@/entities/review-flag.entity'
import { NotificationsModule } from '@/modules/notifications/notifications.module'
import { ReviewFlagsController } from './review-flags.controller'
import { ReviewFlagsService } from './review-flags.service'

@Module({
  imports: [TypeOrmModule.forFeature([ReviewFlagRecord, Business]), NotificationsModule],
  controllers: [ReviewFlagsController],
  providers: [ReviewFlagsService],
  exports: [ReviewFlagsService],
})
export class ReviewFlagsModule {}
