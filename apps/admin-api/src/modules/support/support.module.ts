import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SupportTicket } from '@/entities/support-ticket.entity'
import { Business } from '@/entities/read/business.entity'
import { SyncBatch } from '@/entities/read/sync-batch.entity'
import { SupportController } from './support.controller'
import { SupportService } from './support.service'

@Module({
  imports: [TypeOrmModule.forFeature([SupportTicket, Business, SyncBatch])],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
