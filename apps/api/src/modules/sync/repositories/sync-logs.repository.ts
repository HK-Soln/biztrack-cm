import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ImmutableBaseRepository } from '@/common/repositories/immutable-base.repository'
import { SyncLog } from '@/entities/sync-log.entity'

@Injectable()
export class SyncLogsRepository extends ImmutableBaseRepository<SyncLog> {
  constructor(@InjectRepository(SyncLog) repo: Repository<SyncLog>) {
    super(repo)
  }
}
