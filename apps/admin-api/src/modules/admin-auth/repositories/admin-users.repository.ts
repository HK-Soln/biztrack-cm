import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ImmutableBaseRepository } from '@/common/repositories/immutable-base.repository'
import { AdminUser } from '@/entities/admin-user.entity'

@Injectable()
export class AdminUsersRepository extends ImmutableBaseRepository<AdminUser> {
  constructor(@InjectRepository(AdminUser) repo: Repository<AdminUser>) {
    super(repo)
  }

  findByEmail(email: string, withRole = false) {
    return this.repo.findOne({
      where: { email: email.toLowerCase() },
      relations: withRole ? ['role'] : [],
    })
  }

  findByIdWithRole(id: string) {
    return this.repo.findOne({ where: { id }, relations: ['role'] })
  }
}
