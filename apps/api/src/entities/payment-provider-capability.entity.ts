import { Column, Entity, PrimaryColumn } from 'typeorm'
import type { PaymentMethod } from '@biztrack/types'

/**
 * Spec 07 — what a provider can do for a (method, country). The first of the three verification
 * layers (§5): a route may only reference a capability that exists here. Keyed on
 * `businesses.country` (ISO-3166 alpha-2); there is no region concept. Seeded reference data.
 */
@Entity('payment_provider_capabilities')
export class PaymentProviderCapability {
  @PrimaryColumn({ name: 'provider_code', type: 'text' })
  providerCode!: string

  @PrimaryColumn({ name: 'payment_method', type: 'varchar', length: 20 })
  paymentMethod!: PaymentMethod

  @PrimaryColumn({ name: 'country_code', type: 'varchar', length: 2 })
  countryCode!: string

  @Column({ name: 'supports_payment_links', type: 'boolean', default: false })
  supportsPaymentLinks!: boolean

  @Column({ name: 'supports_ussd_push', type: 'boolean', default: false })
  supportsUssdPush!: boolean

  @Column({ name: 'supports_refunds', type: 'boolean', default: false })
  supportsRefunds!: boolean

  @Column({ name: 'supports_webhooks', type: 'boolean', default: false })
  supportsWebhooks!: boolean

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean
}
