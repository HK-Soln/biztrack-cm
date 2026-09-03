import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm'
import type { PaymentMethod, PaymentProviderConnectionStatus } from '@biztrack/types'
import { BaseEntity } from '@/common/entities/base.entity'
import { Business } from './business.entity'

/**
 * Spec 07 §2.2 — a merchant's connection to a provider. Holds the ENVELOPE-ENCRYPTED credentials
 * (AES-256-GCM, AAD = business_id) and the webhook secret. Server-only: this entity must NEVER be
 * added to a sync map/applier (a reversible-use secret must not reach a device). The write-only API
 * never returns `encryptedCredentials`/`webhookSecretEncrypted`.
 */
@Entity('business_payment_providers')
@Index('idx_business_payment_providers_business', ['businessId'])
@Unique('unq_business_payment_providers_business_provider', ['businessId', 'providerCode'])
export class BusinessPaymentProvider extends BaseEntity {
  @Column({ name: 'business_id', type: 'uuid' })
  businessId!: string

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id' })
  business?: Business

  @Column({ name: 'provider_code', type: 'text' })
  providerCode!: string

  @Column({ name: 'encrypted_credentials', type: 'bytea' })
  encryptedCredentials!: Buffer

  @Column({ name: 'key_version', type: 'int' })
  keyVersion!: number

  /** SHA-256 of the plaintext credential set — change detection only. */
  @Column({ name: 'fingerprint', type: 'text', nullable: true })
  fingerprint!: string | null

  /** Last few chars of the primary secret, for the merchant to recognise which key is stored. */
  @Column({ name: 'last_four', type: 'varchar', length: 8, nullable: true })
  lastFour!: string | null

  @Column({ name: 'status', type: 'varchar', length: 24 })
  status!: PaymentProviderConnectionStatus

  /** Methods the merchant's account is ACTUALLY approved for (from verifyCredentials, §5). */
  @Column({ name: 'verified_methods', type: 'jsonb', default: () => "'[]'" })
  verifiedMethods!: PaymentMethod[]

  @Column({ name: 'last_verified_at', type: 'timestamptz', nullable: true })
  lastVerifiedAt!: Date | null

  @Column({ name: 'verification_error', type: 'text', nullable: true })
  verificationError!: string | null

  /** Opaque, unique, rotatable — the tenant is resolved from this in the webhook URL (§8). */
  @Column({ name: 'webhook_token', type: 'text', nullable: true })
  webhookToken!: string | null

  @Column({ name: 'webhook_secret_encrypted', type: 'bytea', nullable: true })
  webhookSecretEncrypted!: Buffer | null

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null
}
