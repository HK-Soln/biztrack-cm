import { Inject, Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import type { Queue } from 'bullmq'
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm'
import type { Logger } from '@biztrack/logger'
import type { AuditChanges, AuditContext, AuditData, QueryAuditLogRequest } from '@biztrack/types'
import { AuditLog } from '@/entities/audit-log.entity'
import { LOGGER } from '@/logger/logger.module'
import { AUDIT_LOG_JOB, AUDIT_QUEUE } from './constants/audit.constants'
import type { AuditIngestRowDto } from './dto/audit-ingest.dto'
import { TeamActivityNotifier } from './team-activity.notifier'

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    @InjectQueue(AUDIT_QUEUE)
    private readonly auditQueue: Queue,
    private readonly teamActivity: TeamActivityNotifier,
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
    // BIZ-2.9: a null businessId (a pre-business/system event) is NO LONGER dropped — it's
    // recorded with business_id NULL. We only skip a genuinely empty event.
    if (!data.action || !data.entityType) {
      return
    }
    void this.auditQueue
      .add(
        AUDIT_LOG_JOB,
        { context, data },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { count: 1000 },
        },
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

  /**
   * Ingest a batch of device-originated audit rows (BIZ-2.10) — the desktop→server bridge.
   * The trail is append-only, so this is INSERT-only and idempotent (ON CONFLICT DO NOTHING on
   * the device-generated id), letting a device safely re-push. server_time is stamped by the DB
   * default (never trusted from the device); actor_type is normalised 'USER' → 'BUSINESS_USER'.
   */
  async ingestBatch(
    businessId: string | null,
    deviceId: string | null,
    rows: AuditIngestRowDto[],
  ): Promise<{ ingested: number }> {
    if (rows.length === 0) return { ingested: 0 }
    const values = rows.map((r) => ({
      id: r.id,
      businessId,
      actorId: r.actorId ?? null,
      actorType: 'BUSINESS_USER' as const,
      actorName: r.actorName ?? null,
      actorRole: r.actorRole ?? null,
      action: r.action as AuditLog['action'],
      entityType: r.entityType,
      entityId: r.entityId,
      entityLabel: r.entityLabel ?? null,
      changes: r.changes ?? null,
      deviceId,
      deviceType: 'DESKTOP_APP' as const,
      // Preserve the device's clock reading; created_at + server_time are the server ingest
      // time (DB default now()), never trusted from the device.
      deviceTime: new Date(r.deviceTime ?? r.createdAt),
      amount: r.amount ?? null,
      sequence: r.sequence ?? null,
    }))
    const insertResult = await this.auditRepo
      .createQueryBuilder()
      .insert()
      .into(AuditLog)
      .values(values)
      .orIgnore() // ON CONFLICT (id) DO NOTHING — idempotent re-push
      .returning(['id'])
      .execute()

    // High-signal staff actions pushed from a device → notify the owner (team-activity
    // producer). Only NEWLY-inserted rows (returned by ON CONFLICT DO NOTHING) fire, so a
    // device safely re-pushing the same batch never re-notifies. Fire-and-forget.
    const insertedIds = new Set((insertResult.raw as Array<{ id: string }>).map((row) => row.id))
    for (const r of rows) {
      if (!insertedIds.has(r.id)) continue
      void this.teamActivity.maybeNotify({
        businessId,
        action: r.action as AuditLog['action'],
        entityLabel: r.entityLabel ?? null,
        actorName: r.actorName ?? null,
        changes: (r.changes ?? null) as AuditChanges | null,
      })
    }
    return { ingested: rows.length }
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
    businessId: context.businessId ?? null,
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
    deviceTime: context.deviceTime ? new Date(context.deviceTime) : null,
    amount: data.amount ?? null,
    sequence: context.sequence ?? null,
    // serverTime is intentionally NOT set here — the DB `now()` default stamps it at ingest so
    // the client (or a replayed job) can never influence the authoritative time.
  }
}
