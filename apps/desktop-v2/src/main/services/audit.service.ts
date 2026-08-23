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
  /** Money impact in whole XAF (BIZ-2.7), or null/absent when the event moves no money. */
  amount?: number | null
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
  actor_id: string | null
  actor_name: string | null
  actor_role: string | null
  changes: string | null
  amount: number | null
  sequence: number | null
  created_at: string
  device_time: string | null
  server_time: string | null
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
      // device_time = this device's clock (same as created_at on-device); server_time stays
      // NULL until the server ingests the row (BIZ-2.7 / the audit bridge in a later phase).
      const now = new Date().toISOString()
      // Monotonic per-device counter (BIZ-2.9) — MAX+1 for this device (better-sqlite3 is
      // synchronous/single-threaded, so no race). A gap later reveals a dropped/tampered row.
      const seqRow = this.db.get<{ n: number }>(
        `SELECT COALESCE(MAX(sequence), 0) + 1 AS n FROM local_audit_logs WHERE device_id IS ?`,
        [ctx.deviceId],
      )
      this.db.run(
        `INSERT INTO local_audit_logs
          (id, business_id, actor_id, actor_type, actor_name, actor_role, action,
           entity_type, entity_id, entity_label, changes, device_id, amount, sequence, created_at,
           device_time, server_time, synced_at)
         VALUES (?, ?, ?, 'USER', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
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
          entry.amount ?? null,
          seqRow?.n ?? 1,
          now,
          now,
        ],
      )
    } catch {
      // Audit is best-effort — never let it break the originating action.
    }
  }

  list(query: AuditListQuery = {}): PaginatedResult<LocalAuditLog> {
    const ctx = this.getContext()
    if (!ctx.businessId)
      return toPaginated<LocalAuditLog>([], { total: 0, page: 1, limit: 20, totalPages: 1 })

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
    if (query.actorId) {
      where += ' AND actor_id = ?'
      params.push(query.actorId)
    }
    if (query.dateFrom) {
      where += ' AND created_at >= ?'
      params.push(query.dateFrom)
    }
    if (query.dateTo) {
      where += ' AND created_at <= ?'
      params.push(query.dateTo)
    }

    const { rows, ...meta } = paginateRows<AuditRow>(
      this.db,
      {
        from: 'local_audit_logs',
        columns:
          'id, action, entity_type, entity_id, entity_label, actor_id, actor_name, actor_role, changes, amount, sequence, created_at, device_time, server_time',
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
        actorId: r.actor_id,
        actorName: r.actor_name,
        actorRole: r.actor_role,
        changes: r.changes ? (JSON.parse(r.changes) as LocalAuditLog['changes']) : null,
        amount: r.amount,
        sequence: r.sequence,
        createdAt: r.created_at,
        deviceTime: r.device_time,
        serverTime: r.server_time,
      })),
      meta,
    )
  }
}
