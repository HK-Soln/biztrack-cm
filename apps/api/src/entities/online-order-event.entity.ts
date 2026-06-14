import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { OnlineOrderEventType } from '@biztrack/types'

/** Append-only timeline of an online order's lifecycle (Phase 3I / deferred 3H). */
@Entity('online_order_events')
@Index('idx_order_events_order', ['onlineOrderId', 'createdAt'])
export class OnlineOrderEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'online_order_id' })
  onlineOrderId!: string

  @Column({ name: 'business_id' })
  businessId!: string

  @Column({ name: 'event_type', length: 40 })
  eventType!: OnlineOrderEventType

  @Column({ name: 'from_status', length: 20, nullable: true, type: 'varchar' })
  fromStatus?: string | null

  @Column({ name: 'to_status', length: 20, nullable: true, type: 'varchar' })
  toStatus?: string | null

  @Column({ name: 'triggered_by', length: 20 })
  triggeredBy!: 'CUSTOMER' | 'MERCHANT' | 'SYSTEM' | 'PAYMENT_GATEWAY'

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId?: string | null

  @Column({ name: 'actor_name', type: 'text', nullable: true })
  actorName?: string | null

  @Column({ name: 'is_customer_visible', default: true })
  isCustomerVisible!: boolean

  @Column({ name: 'customer_message', type: 'text', nullable: true })
  customerMessage?: string | null

  @Column({ name: 'internal_note', type: 'text', nullable: true })
  internalNote?: string | null

  @Column({ name: 'tracking_token', length: 64, nullable: true, type: 'varchar' })
  trackingToken?: string | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date
}
