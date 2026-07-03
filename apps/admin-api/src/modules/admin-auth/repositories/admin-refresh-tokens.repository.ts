import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThan, Not, IsNull, Repository } from 'typeorm'
import { ImmutableBaseRepository } from '@/common/repositories/immutable-base.repository'
import { AdminRefreshToken } from '@/entities/admin-refresh-token.entity'

@Injectable()
export class AdminRefreshTokensRepository extends ImmutableBaseRepository<AdminRefreshToken> {
  constructor(@InjectRepository(AdminRefreshToken) repo: Repository<AdminRefreshToken>) {
    super(repo)
  }

  findByTokenId(tokenId: string) {
    return this.repo.findOne({ where: { tokenId }, relations: ['adminUser'] })
  }

  updateByFamilyId(familyId: string, data: Partial<Omit<AdminRefreshToken, 'adminUser'>>) {
    return this.repo.update({ familyId }, data)
  }

  updateByTokenId(tokenId: string, data: Partial<Omit<AdminRefreshToken, 'adminUser'>>) {
    return this.repo.update({ tokenId }, data)
  }

  updateByAdminUserId(adminUserId: string, data: Partial<Omit<AdminRefreshToken, 'adminUser'>>) {
    return this.repo.update({ adminUserId }, data)
  }

  /** Delete expired tokens that have already been rotated or revoked (cleanup cron). */
  deleteExpiredConsumed() {
    return this.repo.delete([
      { expiresAt: LessThan(new Date()), usedAt: Not(IsNull()) },
      { expiresAt: LessThan(new Date()), revokedAt: Not(IsNull()) },
    ])
  }
}
