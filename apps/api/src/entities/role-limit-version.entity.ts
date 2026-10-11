import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { dateTransformer, decimalTransformer } from '@/common/entities/transformers'

/**
 * Every version of a role's discount policy (ruling R2, docs/design/domain-package.md). A
 * sale synced from a till is checked against the limits in force when it was made, not
 * today's, so the limits have to be kept. One row each time the policy changes; the row
 * with the latest `effective_from` at or before a moment is the policy at that moment.
 * Seeded with every role's limits on the day it was deployed.
 */
@Entity('role_limit_versions')
@Index('unq_role_limit_versions_role_version', ['roleId', 'version'], { unique: true })
@Index('idx_role_limit_versions_role_effective', ['roleId', 'effectiveFrom'])
export class RoleLimitVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @CreateDateColumn({ name: 'created_at', transformer: dateTransformer })
  createdAt!: Date

  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string

  /** Counts up from 1 per role; the same number as `roles.limits_version` at the time. */
  @Column({ type: 'int' })
  version!: number

  @Column({
    name: 'max_discount_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  maxDiscountPercent!: number | null

  @Column({
    name: 'max_cart_discount_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  maxCartDiscountPercent!: number | null

  @Column({
    name: 'max_discount_amount_xaf',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  maxDiscountAmountXaf!: number | null

  @Column({ name: 'allow_below_cost', default: false })
  allowBelowCost!: boolean

  @Column({ name: 'effective_from', type: 'timestamptz', transformer: dateTransformer })
  effectiveFrom!: Date
}
