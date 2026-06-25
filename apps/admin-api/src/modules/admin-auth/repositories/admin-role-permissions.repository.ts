import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ImmutableBaseRepository } from '@/common/repositories/immutable-base.repository'
import { AdminRolePermission } from '@/entities/admin-role-permission.entity'

@Injectable()
export class AdminRolePermissionsRepository extends ImmutableBaseRepository<AdminRolePermission> {
  constructor(@InjectRepository(AdminRolePermission) repo: Repository<AdminRolePermission>) {
    super(repo)
  }

  findByRole(adminRoleId: string) {
    return this.repo.find({ where: { adminRoleId } })
  }
}
