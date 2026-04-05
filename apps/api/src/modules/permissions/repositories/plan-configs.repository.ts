import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseRepository } from '@/common/repositories/base.repository'
import { PlanConfig } from '@/entities/plan-config.entity'

@Injectable()
export class PlanConfigsRepository extends BaseRepository<PlanConfig> {
  constructor(@InjectRepository(PlanConfig) repo: Repository<PlanConfig>) {
    super(repo)
  }
}
