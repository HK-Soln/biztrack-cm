import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type { AuditAction, AuditListQuery, LocalAuditLog, PaginatedResult } from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'

/** Resolved actor/device context at the time of an action (snapshotted per row). */
export interface AuditContext {
  businessId: string | null
  actorId: string | null
  actorName: string | null
  actorRole: string | null
  deviceId: string | null
}

export interface AuditEntry {
  action: AuditAction
  entityType: string
  entityId: string
  entityLabel?: string | null
  changes?: { before: unknown; after: unknown } | null
}

/** Minimal logger surface other services depend on (keeps them decoupled). */
export interface AuditLogger {
  log(entry: AuditEntry): void
}

interface AuditRow {
  id: string
  action: string
  entity_type: string
  entity_id: string
  entity_label: string | null
  actor_name: string | null
  actor_role: string | null
  changes: string | null
  created_at: string
}

/**
 * Append-only local audit trail. Every mutating service action writes one row via
 * {@link log}; logging never throws (a failed audit must not fail the action).
 * Rows carry an actor + device snapshot and stay `synced_at = NULL` until pushed
 * to the server audit log (a later phase).
 */
export class AuditService implements AuditLogger {
  constructor(
    private readonly db: DatabaseService,
    private readonly getContext: () => AuditContext,
  ) {}

  log(entry: AuditEntry): void {
    try {
      const ctx = this.getContext()
      if (!ctx.businessId) return
      this.db.run(
        `INSERT INTO local_audit_logs
          (id, business_id, actor_id, actor_type, actor_name, actor_role, action,
           entity_type, entity_id, entity_label, changes, device_id, created_at, synced_at)
         VALUES (?, ?, ?, 'USER', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          randomUUID(),
          ctx.businessId,
          ctx.actorId,
          ctx.actorName,
          ctx.actorRole,
          entry.action,
          entry.entityType,
          entry.entityId,
          entry.entityLabel ?? null,
          entry.changes ? JSON.stringify(entry.changes) : null,
          ctx.deviceId,
          new Date().toISOString(),
        ],
      )
    } catch {
      // Audit is best-effort — never let it break the originating action.
    }
  }

  list(query: AuditListQuery = {}): PaginatedResult<LocalAuditLog> {
    const ctx = this.getContext()
    if (!ctx.businessId) return toPaginated<LocalAuditLog>([], { total: 0, page: 1, limit: 20, totalPages: 1 })

    let where = 'business_id = ?'
    const params: unknown[] = [ctx.businessId]
    if (query.entityType) {
      where += ' AND entity_type = ?'
      params.push(query.entityType)
    }
    if (query.entityId) {
      where += ' AND entity_id = ?'
      params.push(query.entityId)
    }
    if (query.action) {
      where += ' AND action = ?'
      params.push(query.action)
    }

    const { rows, ...meta } = paginateRows<AuditRow>(
      this.db,
      {
        from: 'local_audit_logs',
        columns: 'id, action, entity_type, entity_id, entity_label, actor_name, actor_role, changes, created_at',
        where,
        params,
        searchColumns: ['entity_label', 'actor_name'],
        // rowid tiebreak keeps ordering stable when several rows share a millisecond
        // (e.g. a wizard save writes product + images + variants in the same tick).
        defaultSort: 'created_at DESC, rowid DESC',
        sortMap: { createdAt: 'created_at' },
      },
      query,
    )
    return toPaginated(
      rows.map((r) => ({
        id: r.id,
        action: r.action as AuditAction,
        entityType: r.entity_type,
        entityId: r.entity_id,
        entityLabel: r.entity_label,
        actorName: r.actor_name,
        actorRole: r.actor_role,
        changes: r.changes ? (JSON.parse(r.changes) as LocalAuditLog['changes']) : null,
        createdAt: r.created_at,
      })),
      meta,
    )
  }
}
