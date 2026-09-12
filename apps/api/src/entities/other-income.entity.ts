import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseEntity } from '@/common/entities/base.entity'
import { dateTransformer, decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { IncomeCategory } from './income-category.entity'
import { User } from './user.entity'

/**
 * Spec 10 — a non-trading ("other") income entry: money the business receives that is NOT product
 * revenue (delivery fees collected via a general payment link, deposit-cancellation charges, misc.).
 * Feeds the income statement's "other income" line. Mirrors Expense's financial-grain columns
 * (date / business_date / posting_date) so it lives on the same accounting timeline.
 */
@Entity('other_incomes')
@Index('idx_other_incomes_business_id_deleted_at', ['businessId', 'deletedAt'])
@Index('idx_other_incomes_business_id_date', ['businessId', 'date'])
export class OtherIncome extends BaseEntity {
  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_other_incomes_business_id' })
  business?: Business

  // Null for a system/settlement-originated entry (a payment link settled by a guest, a migrated charge).
  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById?: string | null

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'recorded_by_id', foreignKeyConstraintName: 'fk_other_incomes_recorded_by_id' })
  recordedBy?: User | null

  @Column({ name: 'category_id' })
  categoryId!: string

  @ManyToOne(() => IncomeCategory, (category) => category.incomes)
  @JoinColumn({ name: 'category_id', foreignKeyConstraintName: 'fk_other_incomes_category_id' })
  category?: IncomeCategory

  @Column()
  description!: string

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  amount!: number

  @Column({ default: 'XAF' })
  currency!: string

  @Column({ name: 'payment_method', type: 'varchar', nullable: true })
  paymentMethod?: string | null

  // Provider reference (MoMo ref / Stripe PI) when settled via a payment link.
  @Column({ type: 'varchar', nullable: true })
  reference?: string | null

  // How this income was booked: MANUAL entry, a general PAYMENT_LINK settlement, or a migrated
  // DEPOSIT_CHARGE (deposit-cancellation charge; the savings ledger keeps its own row too).
  @Column({ default: 'MANUAL' })
  source!: string

  // The originating record id (payment_link id / savings_transaction id), when source != MANUAL.
  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId?: string | null

  @Column({ type: 'text', nullable: true })
  note?: string | null

  @Column({ name: 'date', type: 'date', transformer: dateTransformer })
  date!: Date

  // Local trading day (BIZ-5.1).
  @Column({ name: 'business_date', type: 'date', nullable: true })
  businessDate?: string | null

  // Accounting day this income posts to (BIZ-5.4); a late arrival into a closed period is redated forward.
  @Column({ name: 'posting_date', type: 'date', nullable: true })
  postingDate?: string | null

  @Column({ name: 'is_late_arrival', type: 'boolean', default: false })
  isLateArrival!: boolean

  @Column({ name: 'original_period_id', type: 'uuid', nullable: true })
  originalPeriodId?: string | null
}
