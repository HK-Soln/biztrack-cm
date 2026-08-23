import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SyncDeviceSession } from '@/entities/sync-device-session.entity'
import { SyncFreshnessService } from './sync-freshness.service'

/** Shared sync-freshness guard, reused by data-derived notification producers. */
@Module({
  imports: [TypeOrmModule.forFeature([SyncDeviceSession])],
  providers: [SyncFreshnessService],
  exports: [SyncFreshnessService],
})
export class SyncFreshnessModule {}
