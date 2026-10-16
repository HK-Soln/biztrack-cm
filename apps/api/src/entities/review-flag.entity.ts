import { Column, Entity, Index } from 'typeorm'
import {
  ReviewFlagCode,
  ReviewFlagSeverity,
  ReviewFlagStatus,
  type ReviewFlagEntityType,
} from '@biztrack/types'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer } from '@/common/entities/transformers'

/**
 * Something the server accepted but the owner should look at (rulings R1–R3). A sale or
 * refund made at an offline till already happened, so the server records it and raises a
 * flag instead of rejecting it. One row per occurrence: (business, code, dedupe_key) is
 * unique, so a retried sync never raises the same flag twice.
 */
@Entity('review_flags')
@Index('unq_review_flags_business_code_dedupe', ['businessId', 'code', 'dedupeKey'], {
  unique: true,
})
@Index('idx_review_flags_business_status', ['businessId', 'status', 'createdAt'])
@Index('idx_review_flags_entity', ['businessId', 'entityType', 'entityId'])
export class ReviewFlagRecord extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  /** The branch the flag belongs to, once branches exist. */
  @Column({ name: 'outlet_id', type: 'uuid', nullable: true })
  outletId?: string | null

  @Column({ type: 'varchar', length: 40 })
  code!: ReviewFlagCode

  @Column({ type: 'varchar', length: 10 })
  severity!: ReviewFlagSeverity

  @Column({ name: 'entity_type', type: 'varchar', length: 40 })
  entityType!: ReviewFlagEntityType

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId!: string

  @Column({ name: 'dedupe_key', type: 'varchar', length: 200 })
  dedupeKey!: string

  @Column({ type: 'jsonb', default: () => `'{}'` })
  details!: Record<string, unknown>

  @Column({ type: 'varchar', length: 10, default: ReviewFlagStatus.OPEN })
  status!: ReviewFlagStatus

  @Column({
    name: 'resolved_at',
    type: 'timestamptz',
    nullable: true,
    transformer: dateTransformer,
  })
  resolvedAt?: Date | null

  @Column({ name: 'resolved_by_id', type: 'uuid', nullable: true })
  resolvedById?: string | null

  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolutionNote?: string | null
}
