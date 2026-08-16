import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm'
import { CashSessionClosedReason, CashSessionStatus } from '@biztrack/types'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer, decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { User } from './user.entity'
import { CashCountLine } from './cash-count-line.entity'

/**
 * A cashier's shift at a till (BIZ-2.1). Named CashSession, never bare "session"
 * (that already means the auth device session).
 *
 * Money columns are `bigint` whole XAF — XAF is zero-decimal, and new money columns
 * are integer by decision D1 (no `decimal(_,2)` + CHECK dance needed; a bigint can't
 * hold a fraction). `updated_at` + the (business_id, updated_at) index drive the LWW
 * sync pull cursor. Once CLOSED, the row is immutable to every role including OWNER;
 * that guard lives in the service layer, not the schema.
 */
@Entity('cash_sessions')
@Index('idx_cash_sessions_business_id_status', ['businessId', 'status'])
@Index('idx_cash_sessions_business_id_updated_at', ['businessId', 'updatedAt'])
@Index('idx_cash_sessions_business_id_user_id', ['businessId', 'userId'])
export class CashSession extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_cash_sessions_business_id' })
  business?: Business

  // Reserved for future multi-outlet support; unused today.
  @Column({ name: 'outlet_id', type: 'uuid', nullable: true })
  outletId?: string | null

  @Column({ name: 'device_id', type: 'text' })
  deviceId!: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string

  @ManyToOne(() => User, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_cash_sessions_user_id' })
  user?: User

  @Column({ type: 'varchar', length: 20, default: CashSessionStatus.OPEN })
  status!: CashSessionStatus

  @Column({ name: 'opened_at', type: 'timestamptz', transformer: dateTransformer })
  openedAt!: Date

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true, transformer: dateTransformer })
  closedAt?: Date | null

  @Column({ name: 'opening_float', type: 'bigint', default: 0, transformer: decimalTransformer })
  openingFloat!: number

  @Column({
    name: 'expected_cash',
    type: 'bigint',
    nullable: true,
    transformer: decimalTransformer,
  })
  expectedCash?: number | null

  @Column({ name: 'counted_cash', type: 'bigint', nullable: true, transformer: decimalTransformer })
  countedCash?: number | null

  @Column({
    name: 'variance_cash',
    type: 'bigint',
    nullable: true,
    transformer: decimalTransformer,
  })
  varianceCash?: number | null

  @Column({
    name: 'expected_mtn_momo',
    type: 'bigint',
    nullable: true,
    transformer: decimalTransformer,
  })
  expectedMtnMomo?: number | null

  @Column({
    name: 'confirmed_mtn_momo',
    type: 'bigint',
    nullable: true,
    transformer: decimalTransformer,
  })
  confirmedMtnMomo?: number | null

  @Column({
    name: 'expected_orange_money',
    type: 'bigint',
    nullable: true,
    transformer: decimalTransformer,
  })
  expectedOrangeMoney?: number | null

  @Column({
    name: 'confirmed_orange_money',
    type: 'bigint',
    nullable: true,
    transformer: decimalTransformer,
  })
  confirmedOrangeMoney?: number | null

  @Column({ name: 'credit_issued', type: 'bigint', default: 0, transformer: decimalTransformer })
  creditIssued!: number

  @Column({ name: 'discount_total', type: 'bigint', default: 0, transformer: decimalTransformer })
  discountTotal!: number

  @Column({ name: 'sales_count', type: 'int', default: 0 })
  salesCount!: number

  @Column({ name: 'void_count', type: 'int', default: 0 })
  voidCount!: number

  @Column({ name: 'closed_reason', type: 'varchar', length: 20, nullable: true })
  closedReason?: CashSessionClosedReason | null

  @Column({ name: 'recount_used', type: 'boolean', default: false })
  recountUsed!: boolean

  @Column({ name: 'closing_note', type: 'text', nullable: true })
  closingNote?: string | null

  @Column({ name: 'variance_reason', type: 'varchar', length: 30, nullable: true })
  varianceReason?: string | null

  @Column({ name: 'variance_note', type: 'text', nullable: true })
  varianceNote?: string | null

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy?: string | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'reviewed_by', foreignKeyConstraintName: 'fk_cash_sessions_reviewed_by' })
  reviewer?: User | null

  @Column({
    name: 'reviewed_at',
    type: 'timestamptz',
    nullable: true,
    transformer: dateTransformer,
  })
  reviewedAt?: Date | null

  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote?: string | null

  @OneToMany(() => CashCountLine, (line) => line.cashSession)
  countLines?: CashCountLine[]
}
