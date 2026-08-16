import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { AuditAction, AuditActorType, AuditChanges, AuditDeviceType } from '@biztrack/types'
import { dateTransformer, decimalTransformer } from '@/common/entities/transformers'

/**
 * Immutable system audit trail (Phase 3H). Append-only — no updates/deletes.
 * Written asynchronously via the audit queue so it never blocks a request.
 *
 * Stored as a plain indexed table for now; monthly range partitioning (per the
 * spec) is a future performance optimisation.
 */
@Entity('audit_logs')
@Index('idx_audit_logs_business', ['businessId', 'createdAt'])
@Index('idx_audit_logs_entity', ['businessId', 'entityType', 'entityId'])
@Index('idx_audit_logs_actor', ['businessId', 'actorId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'business_id' })
  businessId!: string

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null

  @Column({ name: 'actor_type', type: 'varchar', length: 20 })
  actorType!: AuditActorType

  @Column({ name: 'actor_name', type: 'text', nullable: true })
  actorName!: string | null

  @Column({ name: 'actor_role', type: 'text', nullable: true })
  actorRole!: string | null

  @Column({ type: 'varchar', length: 30 })
  action!: AuditAction

  @Column({ name: 'entity_type', type: 'varchar', length: 50 })
  entityType!: string

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId!: string

  @Column({ name: 'entity_label', type: 'text', nullable: true })
  entityLabel!: string | null

  @Column({ type: 'jsonb', nullable: true })
  changes!: AuditChanges | null

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null

  @Column({ name: 'device_id', type: 'text', nullable: true })
  deviceId!: string | null

  @Column({ name: 'device_type', type: 'varchar', length: 20, nullable: true })
  deviceType!: AuditDeviceType | null

  @Column({ name: 'device_info', type: 'jsonb', nullable: true })
  deviceInfo!: Record<string, unknown> | null

  @Column({ name: 'request_id', type: 'text', nullable: true })
  requestId!: string | null

  /**
   * The originating device's own clock reading (BIZ-2.7) — client-reported and NEVER trusted
   * as authoritative. Compared against `serverTime` to detect clock skew / back-dating.
   */
  @Column({ name: 'device_time', type: 'timestamp', nullable: true, transformer: dateTransformer })
  deviceTime!: Date | null

  /**
   * Server-stamped ingest time (authoritative) — BIZ-2.7. Defaulted by the database (`now()`),
   * so it's correct whether the row is written by the queue, the direct-write fallback, or a
   * future sync-bridge ingest — the client can never set it.
   */
  @Column({
    name: 'server_time',
    type: 'timestamp',
    default: () => 'now()',
    transformer: dateTransformer,
  })
  serverTime!: Date

  /** Money impact of the event in whole XAF (BIZ-2.7), or null when the event moves no money. */
  @Column({ type: 'bigint', nullable: true, transformer: decimalTransformer })
  amount!: number | null

  @CreateDateColumn({ name: 'created_at', transformer: dateTransformer })
  createdAt!: Date
}
