import { Column, Entity, Index } from 'typeorm'
import type { PayableType, PaymentLinkStatus } from '@biztrack/types'
import { BaseEntity } from '@/common/entities/base.entity'
import { decimalTransformer } from '@/common/entities/transformers'

/**
 * Spec 08 — a tokenized link to pay ONE payable (debt / sale balance / online order / deposit) via the
 * merchant's routed providers. Server-only, never synced. The `token` is the public handle (the
 * authorization); the amount is server-bound (resolved live from the payable, never client-supplied).
 * One ACTIVE link per (business, payable_type, payable_id) for DEBT/SALE/ONLINE_ORDER (partial index);
 * DEPOSIT allows many. Settlement runs the payable's own sink and updates amount_paid_minor + status.
 */
@Entity('payment_links')
@Index('idx_payment_links_business', ['businessId'])
@Index('uq_payment_links_token', ['token'], { unique: true })
@Index('idx_payment_links_payable', ['businessId', 'payableType', 'payableId'])
export class PaymentLink extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  /** Unguessable public handle (128-bit+ random hex). */
  @Column({ name: 'token', type: 'varchar', length: 64 })
  token!: string

  @Column({ name: 'payable_type', type: 'varchar', length: 20 })
  payableType!: PayableType

  @Column({ name: 'payable_id', type: 'uuid' })
  payableId!: string

  /** Target amount at creation (the live balance then); re-validated at pay time. Minor units. */
  @Column({ name: 'amount_minor', type: 'bigint', transformer: decimalTransformer })
  amountMinor!: number

  @Column({ name: 'amount_paid_minor', type: 'bigint', default: 0, transformer: decimalTransformer })
  amountPaidMinor!: number

  @Column({ name: 'currency', type: 'varchar', length: 3 })
  currency!: string

  @Column({ name: 'allow_partial', type: 'boolean', default: false })
  allowPartial!: boolean

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status!: PaymentLinkStatus

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date

  @Column({ name: 'label', type: 'varchar', length: 140, nullable: true })
  label!: string | null

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId!: string | null

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null

  // SALE_DRAFT only (Spec 09): the sale DTO to materialize on payment, and the id of the sale once
  // created. Null for every other payable type.
  @Column({ name: 'draft_payload', type: 'jsonb', nullable: true })
  draftPayload!: Record<string, unknown> | null

  @Column({ name: 'sale_id', type: 'uuid', nullable: true })
  saleId!: string | null
}
