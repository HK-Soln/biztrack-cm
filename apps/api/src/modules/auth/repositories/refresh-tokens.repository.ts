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

  updateByFamilyId(familyId: string, data: Partial<Omit<RefreshToken, 'user'>>) {
    return this.repo.update({ familyId }, data)
  }

  updateByTokenId(tokenId: string, data: Partial<Omit<RefreshToken, 'user'>>) {
    return this.repo.update({ tokenId }, data)
  }

  updateByUserId(userId: string, data: Partial<Omit<RefreshToken, 'user'>>) {
    return this.repo.update({ userId }, data)
  }
}
