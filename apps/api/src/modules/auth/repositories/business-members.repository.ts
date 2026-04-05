import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseRepository } from '@/common/repositories/base.repository'
import { BusinessMember } from '@/entities/business-member.entity'

export class BusinessMembersRepository extends BaseRepository<BusinessMember> {
  constructor(@InjectRepository(BusinessMember) repo: Repository<BusinessMember>) {
    super(repo)
  }
}
