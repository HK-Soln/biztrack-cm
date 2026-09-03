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

/** A configured route: which provider executes a method for the business (§2.3). */
export interface BusinessPaymentRouteView {
  id: string
  paymentMethod: PaymentMethod
  providerId: string
  providerCode: string
  countryCode: string
  isEnabled: boolean
}

export interface SetPaymentRouteRequest {
  paymentMethod: PaymentMethod
  /** A verified, ACTIVE connection for this business. */
  providerId: string
  isEnabled?: boolean
}

/** A method the business can actually collect right now — passed the three-layer check (§5). The
 * online checkout intersects this with the published-store snapshot flags to decide availability. */
export interface AvailablePaymentMethod {
  method: PaymentMethod
  providerCode: string
}

/** Lifecycle of a provider-execution attempt (§2.4). CONFIRMED/FAILED are terminal; a late provider
 * confirmation on an EXPIRED attempt is a reconciliation exception (§7.5), never an auto-transition. */
export enum PaymentAttemptStatus {
  INITIATED = 'INITIATED',
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

/** How an attempt was started (§7.1). */
export enum PaymentAttemptInitiationType {
  ATTESTED = 'ATTESTED',
  LINK = 'LINK',
  USSD_PUSH = 'USSD_PUSH',
  ONLINE_CHECKOUT = 'ONLINE_CHECKOUT',
}

/** How an attempt reached a terminal state. */
export enum PaymentConfirmationType {
  WEBHOOK = 'WEBHOOK',
  POLL = 'POLL',
  MANUAL = 'MANUAL',
}

/** Allowed forward transitions of a payment attempt. CONFIRMED/FAILED are terminal — a late
 * provider event must NEVER regress or re-transition them (§8). EXPIRED is terminal too: a late
 * confirmation on an expired attempt is handled as a reconciliation exception by a human (§7.5),
 * not an automatic EXPIRED→CONFIRMED. Retries are NEW attempt rows, not transitions. */
const PAYMENT_ATTEMPT_TRANSITIONS: Record<PaymentAttemptStatus, PaymentAttemptStatus[]> = {
  [PaymentAttemptStatus.INITIATED]: [
    PaymentAttemptStatus.PENDING,
    PaymentAttemptStatus.CONFIRMED,
    PaymentAttemptStatus.FAILED,
    PaymentAttemptStatus.EXPIRED,
  ],
  [PaymentAttemptStatus.PENDING]: [
    PaymentAttemptStatus.CONFIRMED,
    PaymentAttemptStatus.FAILED,
    PaymentAttemptStatus.EXPIRED,
  ],
  [PaymentAttemptStatus.CONFIRMED]: [],
  [PaymentAttemptStatus.FAILED]: [],
  [PaymentAttemptStatus.EXPIRED]: [],
}

export const PAYMENT_ATTEMPT_TERMINAL: PaymentAttemptStatus[] = [
  PaymentAttemptStatus.CONFIRMED,
  PaymentAttemptStatus.FAILED,
  PaymentAttemptStatus.EXPIRED,
]

export function canTransitionPaymentAttempt(
  from: PaymentAttemptStatus,
  to: PaymentAttemptStatus,
): boolean {
  return PAYMENT_ATTEMPT_TRANSITIONS[from]?.includes(to) ?? false
}
