import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import type { PaymentMethod } from '@biztrack/types'
import { BaseEntity } from '@/common/entities/base.entity'
import { BusinessPaymentProvider } from './business-payment-provider.entity'

/**
 * Spec 07 §2.3 — which provider executes a given method for a business. The unique constraint IS the
 * one-provider-per-method rule; the composite FK (provider_code, payment_method, country_code) →
 * payment_provider_capabilities makes an impossible route (e.g. MoMo on a card-only provider)
 * structurally impossible. Only MTN_MOMO / ORANGE_MONEY / CARD are routable.
 */
@Entity('business_payment_routes')
@Index('idx_business_payment_routes_business', ['businessId'])
// Partial unique index (live rows only) — one provider per method, but soft-deleted tombstones may
// coexist so a disconnected route can be re-created without a duplicate-key collision.
@Index('unq_business_payment_routes_business_method', ['businessId', 'paymentMethod'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class BusinessPaymentRoute extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @Column({ name: 'payment_method', type: 'varchar', length: 20 })
  paymentMethod!: PaymentMethod

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId!: string

  @ManyToOne(() => BusinessPaymentProvider, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'provider_id' })
  provider?: BusinessPaymentProvider

  /** Denormalised (deliberately) so the composite capability FK can be enforced. */
  @Column({ name: 'provider_code', type: 'text' })
  providerCode!: string

  @Column({ name: 'country_code', type: 'varchar', length: 2 })
  countryCode!: string

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled!: boolean
}
