import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseRepository } from '@/common/repositories/base.repository'
import { BusinessOverride } from '@/entities/business-override.entity'

@Injectable()
export class BusinessOverridesRepository extends BaseRepository<BusinessOverride> {
  constructor(@InjectRepository(BusinessOverride) repo: Repository<BusinessOverride>) {
    super(repo)
  }
}
