import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseRepository } from '@/common/repositories/base.repository'
import { Business } from '@/entities/business.entity'

@Injectable()
export class BusinessesRepository extends BaseRepository<Business> {
  constructor(@InjectRepository(Business) repo: Repository<Business>) {
    super(repo)
  }
}
