import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ImmutableBaseRepository } from '@/common/repositories/immutable-base.repository'
import { PendingInvite } from '@/entities/pending-invite.entity'

export class PendingInvitesRepository extends ImmutableBaseRepository<PendingInvite> {
  constructor(@InjectRepository(PendingInvite) repo: Repository<PendingInvite>) {
    super(repo)
  }
}
