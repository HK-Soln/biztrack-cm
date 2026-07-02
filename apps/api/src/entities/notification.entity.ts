import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer } from '@/common/entities/transformers'
import { NotificationChannel, NotificationStatus, NotificationType } from '@biztrack/types'

// Re-export so existing `from '@/entities/notification.entity'` imports keep working;
// the enums now live in @biztrack/types (shared with the frontend).
export { NotificationChannel, NotificationStatus, NotificationType }

@Entity('notifications')
@Index('idx_notifications_status', ['status'])
@Index('idx_notifications_provider_message_id', ['providerMessageId'], {
  where: 'provider_message_id IS NOT NULL',
})
@Index('idx_notifications_business_id', ['businessId'], { where: 'business_id IS NOT NULL' })
@Index('idx_notifications_user_id', ['userId'], { where: 'user_id IS NOT NULL' })
export class Notification extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid', nullable: true })
  businessId?: string | null

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string | null

  @Column({ type: 'enum', enum: NotificationChannel })
  channel!: NotificationChannel

  @Column({ type: 'enum', enum: NotificationType })
  type!: NotificationType

  /// Email address for email notifications, phone number for SMS, WhatsApp ID for WhatsApp, null for InApp etc.
  @Column({ type: 'varchar', length: 320, nullable: true })
  sender?: string | null

  /** Phone number or email address */
  @Column({ type: 'varchar', length: 320 })
  recipient!: string

  @Column({ type: 'varchar', length: 500, nullable: true })
  subject?: string | null

  @Column({ type: 'text' })
  body!: string

  /** In-app notifications: internal route the bell/banner navigates to on click
   * (e.g. `/invitations/:token`). Null for outbound channels. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  deeplink?: string | null

  /** In-app notifications: when the recipient marked it read (null = unread). */
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  readAt?: Date | null

  /** Template variables and any extra context used to build the message */
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null

  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.PENDING,
  })
  status!: NotificationStatus

  /** The specific service that delivered this notification (e.g. 'resend', 'africas_talking', 'meta') */
  @Column({ type: 'varchar', length: 100, nullable: true })
  provider?: string | null

  /** Provider-assigned message ID used to correlate webhook delivery events */
  @Column({ name: 'provider_message_id', type: 'varchar', length: 255, nullable: true })
  providerMessageId?: string | null

  @Column({ type: 'int', default: 0 })
  attempts!: number

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  sentAt?: Date | null

  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  failedAt?: Date | null

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason?: string | null
}
