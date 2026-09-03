import { Column, Entity, Index } from 'typeorm'
import type {
  PaymentAttemptInitiationType,
  PaymentAttemptStatus,
  PaymentConfirmationType,
  PaymentMethod,
} from '@biztrack/types'
import { BaseEntity } from '@/common/entities/base.entity'
import { decimalTransformer } from '@/common/entities/transformers'

/**
 * Spec 07 §2.4 — the mutable provider-execution record. NOT the sale_payments ledger and NOT
 * online_orders.payment_status: it tracks a provider attempt, then feeds those two. Server-only —
 * never synced. Money is (amountMinor, currency); retries are NEW rows, not mutations.
 */
@Entity('payment_attempts')
@Index('idx_payment_attempts_business', ['businessId'])
@Index('idx_payment_attempts_sale', ['saleId'])
@Index('idx_payment_attempts_online_order', ['onlineOrderId'])
@Index('idx_payment_attempts_provider_ref', ['providerRef'])
export class PaymentAttempt extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  // Exactly one context: sale_id (in-store, set at confirmation) or online_order_id.
  @Column({ name: 'sale_id', type: 'uuid', nullable: true })
  saleId!: string | null

  @Column({ name: 'online_order_id', type: 'uuid', nullable: true })
  onlineOrderId!: string | null

  // In-store only; the ONLY link to the shift during the pending window (§7.2). NULL for online.
  @Column({ name: 'cash_session_id', type: 'uuid', nullable: true })
  cashSessionId!: string | null

  @Column({ name: 'payment_method', type: 'varchar', length: 20 })
  paymentMethod!: PaymentMethod

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId!: string

  @Column({ name: 'provider_ref', type: 'text', nullable: true })
  providerRef!: string | null

  /** Integer, MINOR units of `currency` (§3). bigint in PG; coerced to a JS number (minor-unit
   * amounts are well within Number.MAX_SAFE_INTEGER). */
  @Column({ name: 'amount_minor', type: 'bigint', transformer: decimalTransformer })
  amountMinor!: number

  @Column({ name: 'currency', type: 'varchar', length: 3 })
  currency!: string

  @Column({ name: 'fee_minor', type: 'bigint', nullable: true, transformer: decimalTransformer })
  feeMinor!: number | null

  @Column({ name: 'net_minor', type: 'bigint', nullable: true, transformer: decimalTransformer })
  netMinor!: number | null

  @Column({ name: 'status', type: 'varchar', length: 16 })
  status!: PaymentAttemptStatus

  @Column({ name: 'attempt_number', type: 'int', default: 1 })
  attemptNumber!: number

  @Column({ name: 'idempotency_key', type: 'text', unique: true })
  idempotencyKey!: string

  @Column({ name: 'initiation_type', type: 'varchar', length: 16 })
  initiationType!: PaymentAttemptInitiationType

  @Column({ name: 'customer_phone', type: 'varchar', length: 32, nullable: true })
  customerPhone!: string | null

  @Column({ name: 'link_url', type: 'text', nullable: true })
  linkUrl!: string | null

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null

  @Column({ name: 'failed_reason', type: 'text', nullable: true })
  failedReason!: string | null

  @Column({ name: 'confirmed_by', type: 'uuid', nullable: true })
  confirmedBy!: string | null

  @Column({ name: 'confirmation_type', type: 'varchar', length: 16, nullable: true })
  confirmationType!: PaymentConfirmationType | null

  @Column({ name: 'raw_callback', type: 'jsonb', nullable: true })
  rawCallback!: unknown
}
