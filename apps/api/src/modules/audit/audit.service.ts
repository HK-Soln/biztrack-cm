import { Inject, Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import type { Queue } from 'bullmq'
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm'
import type { Logger } from '@biztrack/logger'
import type { AuditContext, AuditData, QueryAuditLogRequest } from '@biztrack/types'
import { AuditLog } from '@/entities/audit-log.entity'
import { LOGGER } from '@/logger/logger.module'
import { AUDIT_LOG_JOB, AUDIT_QUEUE } from './constants/audit.constants'

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    @InjectQueue(AUDIT_QUEUE)
    private readonly auditQueue: Queue,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('AuditService')
  }

  /**
   * Record an auditable event. Fire-and-forget — NEVER awaited by callers, so it
   * adds zero latency to the user-facing request. Falls back to a direct write if
   * the queue is unavailable.
   */
  log(context: AuditContext, data: AuditData): void {
    if (!context.businessId) {
      return
    }
    void this.auditQueue
      .add(
        AUDIT_LOG_JOB,
        { context, data },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: { count: 1000 } },
      )
      .catch((error) => {
        this.logger.warn('Audit enqueue failed; writing directly', 'AuditService', {
          message: error instanceof Error ? error.message : 'Unknown error',
        })
        void this.auditRepo
          .save(this.auditRepo.create(buildAuditLog(context, data)))
          .catch((writeError) => {
            this.logger.error('Audit direct write failed', 'AuditService', {
              message: writeError instanceof Error ? writeError.message : 'Unknown error',
            })
          })
      })
  }

  /** Paginated audit query for the admin activity log / entity history. */
  async query(businessId: string, query: QueryAuditLogRequest) {
    const where: Record<string, unknown> = { businessId }
    if (query.entityType) where.entityType = query.entityType
    if (query.entityId) where.entityId = query.entityId
    if (query.actorId) where.actorId = query.actorId
    if (query.action) where.action = query.action
    if (query.from && query.to) {
      where.createdAt = Between(new Date(query.from), new Date(query.to))
    } else if (query.from) {
      where.createdAt = MoreThanOrEqual(new Date(query.from))
    } else if (query.to) {
      where.createdAt = LessThanOrEqual(new Date(query.to))
    }

    const page = Math.max(query.page ?? 1, 1)
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200)
    const [data, total] = await this.auditRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    })

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }
}

/** Build a persistable audit row from context + data (shared by service + processor). */
export function buildAuditLog(context: AuditContext, data: AuditData): Partial<AuditLog> {
  return {
    businessId: context.businessId as string,
    actorId: context.actorId ?? null,
    actorType: context.actorType,
    actorName: context.actorName ?? null,
    actorRole: context.actorRole ?? null,
    action: data.action,
    entityType: data.entityType,
    entityId: data.entityId,
    entityLabel: data.entityLabel ?? null,
    changes: data.changes ?? null,
    ipAddress: context.ipAddress ?? null,
    deviceId: context.deviceId ?? null,
    deviceType: context.deviceType ?? null,
    deviceInfo: context.deviceInfo ?? null,
    requestId: context.requestId ?? null,
  }
}
