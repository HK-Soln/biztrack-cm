import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import type { PaymentProviderAuthType, ProviderCredentialSchema } from '@biztrack/types'
import { dateTransformer } from '@/common/entities/transformers'

/**
 * Spec 07 — the provider catalogue. Seeded reference data (not an enum): adding a provider is a
 * data change. `credential_schema` describes the fields a merchant supplies to connect the provider
 * (which are secret drives encryption + write-only masking). Holds no per-business secrets.
 */
@Entity('payment_providers')
export class PaymentProvider {
  @PrimaryColumn({ type: 'text' })
  code!: string

  @Column({ type: 'text' })
  name!: string

  @Column({ name: 'auth_type', type: 'varchar', length: 16 })
  authType!: PaymentProviderAuthType

  @Column({ name: 'credential_schema', type: 'jsonb' })
  credentialSchema!: ProviderCredentialSchema

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean

  /** When true, routing to this provider requires completed webhook setup (no per-request callback
   * fallback, e.g. Stripe). When false, webhook setup is optional (e.g. MTN). */
  @Column({ name: 'requires_webhook_registration', type: 'boolean', default: false })
  requiresWebhookRegistration!: boolean

  @CreateDateColumn({ name: 'created_at', transformer: dateTransformer })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', transformer: dateTransformer })
  updatedAt!: Date
}
