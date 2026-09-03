// Spec 07 — Payment Provider Registry. Cross-app shapes for the provider catalogue, per-business
// credentials, routing and execution attempts. Provider SECRETS never appear in these client-facing
// shapes (write-only API); catalogue + capability data are safe to expose.

import { PaymentMethod } from './sale.types'

/** How a provider authenticates the merchant's account. */
export enum PaymentProviderAuthType {
  OAUTH = 'OAUTH',
  API_KEY = 'API_KEY',
}

/** One field a merchant supplies when connecting a provider. `secret: true` fields are encrypted at
 * rest and never returned by the API. */
export interface ProviderCredentialField {
  key: string
  labelEn: string
  labelFr: string
  secret: boolean
  type?: 'text' | 'password' | 'select'
  /** For `type: 'select'` — allowed values (e.g. sandbox | production). */
  options?: string[]
}

export type ProviderCredentialSchema = ProviderCredentialField[]

/** A catalogue provider (seeded reference data — not an enum). Safe to expose. */
export interface PaymentProvider {
  code: string
  name: string
  authType: PaymentProviderAuthType
  credentialSchema: ProviderCredentialSchema
  isActive: boolean
}

/** What a provider can do for a (method, country) — the first of the three verification layers.
 * Keyed on `businesses.country` (ISO-3166 alpha-2). Safe to expose. */
export interface PaymentProviderCapability {
  providerCode: string
  paymentMethod: PaymentMethod
  countryCode: string
  supportsPaymentLinks: boolean
  supportsUssdPush: boolean
  supportsRefunds: boolean
  supportsWebhooks: boolean
  isActive: boolean
}

/** Methods that can be routed to a provider for EXECUTION. `CASH`/`SAVINGS`/`MIXED` are never
 * routable (cash needs no provider; SAVINGS is a deposit draw-down; MIXED is a derived header). */
export const ROUTABLE_PAYMENT_METHODS: PaymentMethod[] = [
  PaymentMethod.MTN_MOMO,
  PaymentMethod.ORANGE_MONEY,
  PaymentMethod.CARD,
]

/** Lifecycle of a merchant's connection to a provider (§2.2). */
export enum PaymentProviderConnectionStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  ACTIVE = 'ACTIVE',
  FAILED = 'FAILED',
  REVOKED = 'REVOKED',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
}

/** A merchant→provider connection as returned by the WRITE-ONLY API — never carries the secret.
 * Reads expose only provider, last-four, fingerprint, status and verification metadata. */
export interface BusinessPaymentProviderView {
  id: string
  providerCode: string
  status: PaymentProviderConnectionStatus
  lastFour: string | null
  fingerprint: string | null
  verifiedMethods: PaymentMethod[]
  lastVerifiedAt: string | null
  verificationError: string | null
  createdAt: string
  updatedAt: string
}

/** Connect or rotate a provider's credentials. `credentials` is a map keyed by the provider's
 * `credential_schema` field keys; secret fields are encrypted and never returned. */
export interface ConnectPaymentProviderRequest {
  providerCode: string
  credentials: Record<string, string>
}

export interface ConnectPaymentProviderResponse {
  connection: BusinessPaymentProviderView
}
