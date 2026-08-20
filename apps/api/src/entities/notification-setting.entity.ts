import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { Business } from './business.entity'

/**
 * Per-business notification control plane (the Settings → Notifications matrix +
 * quiet hours). One row per business. The channel matrix is stored as jsonb —
 * `matrix[event][channel] = enabled` — for the 7 configurable events × 4 channels.
 * SMS cells are ignored by the dispatcher until a real SMS provider exists (N3).
 */
@Entity('notification_settings')
@Index('unq_notification_settings_business_id', ['businessId'], { unique: true })
export class NotificationSetting extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'business_id',
    foreignKeyConstraintName: 'fk_notification_settings_business_id',
  })
  business?: Business

  /** `matrix[event][channel] = enabled`. Missing cells fall back to defaults. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  matrix!: Record<string, Record<string, boolean>>

  @Column({ name: 'quiet_hours_enabled', type: 'boolean', default: false })
  quietHoursEnabled!: boolean

  /** Local 'HH:mm' (24h). */
  @Column({ name: 'quiet_from', type: 'varchar', length: 5, default: '21:00' })
  quietFrom!: string

  @Column({ name: 'quiet_until', type: 'varchar', length: 5, default: '07:00' })
  quietUntil!: string

  /** IANA timezone quiet hours + scheduled digests are evaluated in (the business's zone). */
  @Column({ type: 'varchar', length: 64, default: 'Africa/Douala' })
  timezone!: string
}
