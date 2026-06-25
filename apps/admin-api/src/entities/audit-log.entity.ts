import { Column, Entity, Index } from 'typeorm'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'

/**
 * Immutable, append-only record of every mutating admin action. Never updated or
 * deleted through the API. `admin_role_name` is denormalised (stored as a string)
 * so historical records stay meaningful even after a role is renamed or deleted.
 */
@Entity('admin_audit_logs')
@Index('idx_admin_audit_logs_admin_user', ['adminUserId'])
@Index('idx_admin_audit_logs_entity', ['entityType', 'entityId'])
@Index('idx_admin_audit_logs_created_at', ['createdAt'])
export class AuditLog extends ImmutableBaseEntity {
  @Column({ name: 'admin_user_id', type: 'uuid' })
  adminUserId!: string

  @Column({ name: 'admin_role_name', type: 'varchar', length: 100 })
  adminRoleName!: string

  @Column({ name: 'action', type: 'varchar', length: 100 })
  action!: string

  @Column({ name: 'entity_type', type: 'varchar', length: 50 })
  entityType!: string

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId?: string | null

  @Column({ name: 'payload', type: 'jsonb', nullable: true })
  payload?: Record<string, unknown> | null

  @Column({ name: 'ip_address', type: 'varchar', length: 45 })
  ipAddress!: string

  @Column({ name: 'user_agent', type: 'varchar', length: 255 })
  userAgent!: string
}
