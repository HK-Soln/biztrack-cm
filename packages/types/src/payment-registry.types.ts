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
