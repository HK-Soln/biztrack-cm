import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseRepository } from '@/common/repositories/base.repository'
import { User } from '@/entities/user.entity'

@Injectable()
export class AuthUsersRepository extends BaseRepository<User> {
  constructor(@InjectRepository(User) repo: Repository<User>) {
    super(repo)
  }
}
