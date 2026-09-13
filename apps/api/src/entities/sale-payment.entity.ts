import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { PaymentMethod, SalePaymentKind } from '@biztrack/types'
import { ImmutableBaseEntity } from '@/common/entities/immutable-base.entity'
import { decimalTransformer } from '@/common/entities/transformers'
import { Business } from './business.entity'
import { Sale } from './sale.entity'

@Entity('sale_payments')
@Index('idx_sale_payments_sale_id', ['saleId'])
@Index('idx_sale_payments_business_id', ['businessId'])
export class SalePayment extends ImmutableBaseEntity {
  @Column({ name: 'sale_id' })
  saleId!: string

  @ManyToOne(() => Sale, (sale) => sale.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id', foreignKeyConstraintName: 'fk_sale_payments_sale_id' })
  sale?: Sale

  @Column({ name: 'business_id' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_sale_payments_business_id' })
  business?: Business

  @Column({ type: 'varchar' })
  method!: PaymentMethod

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount!: number

  @Column({ name: 'mobile_money_reference', nullable: true, type: 'varchar', length: 100 })
  mobileMoneyReference?: string | null

  @Column({ name: 'savings_account_id', nullable: true, type: 'uuid' })
  savingsAccountId?: string | null

  // Ledger direction — PAYMENT (collected) or REFUND (paid back out). Append-only signed
  // ledger: amountPaid = Σ(PAYMENT) − Σ(REFUND).
  @Column({ type: 'varchar', default: SalePaymentKind.PAYMENT })
  kind!: SalePaymentKind

  // Set for payments appended after the sale was posted (COD collection, refund).
  @Column({ name: 'recorded_at', type: 'timestamptz', nullable: true })
  recordedAt?: Date | null

  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById?: string | null

  @Column({ type: 'text', nullable: true })
  note?: string | null

  // Local trading day this payment lands on (BIZ-5.1): the sale's day for payments taken at
  // the sale; the collection day for a later COD payment / refund.
  @Column({ name: 'business_date', type: 'date', nullable: true })
  businessDate?: string | null

  // Accounting day this payment posts to (BIZ-5.4). See Sale.postingDate — a payment landing in an
  // already-closed period is redated forward to the earliest open period as a late arrival.
  @Column({ name: 'posting_date', type: 'date', nullable: true })
  postingDate?: string | null

  @Column({ name: 'is_late_arrival', type: 'boolean', default: false })
  isLateArrival!: boolean

  @Column({ name: 'original_period_id', type: 'uuid', nullable: true })
  originalPeriodId?: string | null

  // Spec 07 [A11] — the provider-execution attempt this ledger row was posted from (payments). NULL
  // for cash/attested rows. Traces a row back to its attempt even when mobile_money_reference is null.
  @Column({ name: 'payment_attempt_id', type: 'uuid', nullable: true })
  paymentAttemptId?: string | null
}
