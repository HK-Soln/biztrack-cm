import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseRepository } from '@/common/repositories/base.repository'
import { VerificationCode } from '@/entities/verification-code.entity'

@Injectable()
export class VerificationCodesRepository extends BaseRepository<VerificationCode> {
  constructor(@InjectRepository(VerificationCode) repo: Repository<VerificationCode>) {
    super(repo)
  }
}
