import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { Business } from './business.entity'
import { User } from './user.entity'

/**
 * A destination for a business's notifications (the Settings → Recipients list).
 * Usually a business member (`userId` set — name/email/phone + verification resolve
 * live from the user); may be a bare email/phone recipient (`userId` null). The
 * `subscriptions` jsonb records which of the 7 configurable events this recipient
 * receives — `subscriptions[event] = enabled`.
 */
@Entity('notification_recipients')
@Index('idx_notification_recipients_business_id', ['businessId'])
@Index('unq_notification_recipients_business_user', ['businessId', 'userId'], {
  unique: true,
  where: 'user_id IS NOT NULL',
})
export class NotificationRecipient extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'business_id',
    foreignKeyConstraintName: 'fk_notification_recipients_business_id',
  })
  business?: Business

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_notification_recipients_user_id' })
  user?: User | null

  /** Used only for bare (userId-null) recipients; for linked ones the user is source of truth. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  name!: string | null

  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone!: string | null

  /** `subscriptions[event] = enabled` for the 7 configurable events. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  subscriptions!: Record<string, boolean>
}
