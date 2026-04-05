import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsWhere, Repository } from 'typeorm'
import { BaseRepository } from '@/common/repositories/base.repository'
import { User } from '@/entities/user.entity'

@Injectable()
export class AuthUsersRepository extends BaseRepository<User> {
  constructor(@InjectRepository(User) repo: Repository<User>) {
    super(repo)
  }

  existsBy(where: Partial<User>) {
    return this.repo.exists({ where: where as FindOptionsWhere<User> })
  }

  incrementFailedLoginAttempts(userId: string) {
    return this.repo.increment({ id: userId }, 'failedLoginAttempts', 1)
  }
}
