import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AuditLog } from '@/entities/audit-log.entity'
import { AuditFiltersDto } from './dto/audit-filters.dto'

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>) {}

  async list(filters: AuditFiltersDto) {
    const page = Math.max(filters.page ?? 1, 1)
    const limit = Math.min(Math.max(filters.limit ?? 30, 1), 100)

    const qb = this.auditRepo.createQueryBuilder('a')
    if (filters.adminUserId)
      qb.andWhere('a.admin_user_id = :adminUserId', { adminUserId: filters.adminUserId })
    if (filters.action) qb.andWhere('a.action ILIKE :action', { action: `%${filters.action}%` })
    if (filters.entityType)
      qb.andWhere('a.entity_type = :entityType', { entityType: filters.entityType })
    if (filters.from) qb.andWhere('a.created_at >= :from', { from: filters.from })
    if (filters.to) qb.andWhere('a.created_at <= :to', { to: filters.to })

    qb.orderBy('a.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)

    const [rows, total] = await qb.getManyAndCount()
    return {
      data: rows.map((a) => ({
        id: a.id,
        adminUserId: a.adminUserId,
        adminRoleName: a.adminRoleName,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId ?? null,
        payload: a.payload ?? null,
        ipAddress: a.ipAddress,
        at: a.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }
}
