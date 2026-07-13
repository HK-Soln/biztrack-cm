import { Column, Entity } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'

/** Mapping onto the client-owned `subscription_events` table (subscription history log). */
@Entity('subscription_events')
export class SubscriptionEvent extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @Column({ name: 'event', type: 'varchar' })
  event!: string

  @Column({ name: 'from_plan', type: 'varchar', nullable: true })
  fromPlan?: string | null

  @Column({ name: 'to_plan', type: 'varchar', nullable: true })
  toPlan?: string | null

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null
}
