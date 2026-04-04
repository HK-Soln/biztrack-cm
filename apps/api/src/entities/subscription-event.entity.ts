import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { Business } from './business.entity'
import { SubscriptionPlan } from '@biztrack/types'

export enum SubscriptionEventType {
  TRIAL_STARTED = 'TRIAL_STARTED',
  TRIAL_ENDING_SOON = 'TRIAL_ENDING_SOON',
  TRIAL_ENDED = 'TRIAL_ENDED',
  PLAN_SELECTED = 'PLAN_SELECTED',
  PLAN_UPGRADED = 'PLAN_UPGRADED',
  PLAN_DOWNGRADED = 'PLAN_DOWNGRADED',
  PAYMENT_SUCCESS = 'PAYMENT_SUCCESS',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  CANCELLED = 'CANCELLED',
  REACTIVATED = 'REACTIVATED',
  OVERRIDE_GRANTED = 'OVERRIDE_GRANTED',
  OVERRIDE_REVOKED = 'OVERRIDE_REVOKED',
}

@Entity('subscription_events')
@Index('idx_subscription_events_business_id', ['businessId'])
export class SubscriptionEvent extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, (business) => business.subscriptionHistory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_subscription_events_business_id' })
  business?: Business

  @Column({ type: 'enum', enum: SubscriptionEventType })
  event!: SubscriptionEventType

  @Column({ name: 'from_plan', type: 'enum', enum: SubscriptionPlan, nullable: true })
  fromPlan?: SubscriptionPlan | null

  @Column({ name: 'to_plan', type: 'enum', enum: SubscriptionPlan, nullable: true })
  toPlan?: SubscriptionPlan | null

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>
}
