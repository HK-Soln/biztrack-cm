import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ImmutableBaseRepository } from '@/common/repositories/immutable-base.repository'
import { RefreshToken } from '@/entities/refresh-token.entity'

@Injectable()
export class RefreshTokensRepository extends ImmutableBaseRepository<RefreshToken> {
  constructor(@InjectRepository(RefreshToken) repo: Repository<RefreshToken>) {
    super(repo)
  }
}
