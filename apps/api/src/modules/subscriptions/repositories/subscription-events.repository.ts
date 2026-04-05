import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseRepository } from '@/common/repositories/base.repository'
import { SubscriptionEvent } from '@/entities/subscription-event.entity'

@Injectable()
export class SubscriptionEventsRepository extends BaseRepository<SubscriptionEvent> {
  constructor(@InjectRepository(SubscriptionEvent) repo: Repository<SubscriptionEvent>) {
    super(repo)
  }
}
