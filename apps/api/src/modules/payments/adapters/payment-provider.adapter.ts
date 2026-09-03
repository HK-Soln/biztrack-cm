import type { PaymentMethod } from '@biztrack/types'

/**
 * Spec 07 §4 — the payment provider adapter contract. One adapter per provider. Server-only: these
 * live in apps/api (which never ships to a client), which satisfies the spec's "never bundled into
 * a client" requirement without a separate packages/payments — provider secrets can't reach a
 * device from here. The interface is deliberately shaped to MoMo's hard case (USSD push,
 * request-vs-payment failure, non-optional polling), not Stripe's easy one.
 */

export type PaymentAttemptStatus = 'INITIATED' | 'PENDING' | 'CONFIRMED' | 'FAILED' | 'EXPIRED'

export interface VerifyCredentialsResult {
  valid: boolean
  /** What the merchant's account is ACTUALLY approved for (may be narrower than the catalogue). */
  enabledMethods: PaymentMethod[]
  accountRef?: string
  error?: string
}

export interface CreatePaymentLinkRequest {
  amountXaf: number
  method: PaymentMethod
  reference: string
  idempotencyKey: string
  customerPhone?: string
  expiresInSeconds: number
}

export interface InitiateUssdPushRequest {
  amountXaf: number
  method: PaymentMethod
  customerPhone: string
  reference: string
  idempotencyKey: string
}

export interface ProviderTxnState {
  status: PaymentAttemptStatus
  providerRef: string
  amountXaf?: number
  feeXaf?: number
  netXaf?: number
  raw?: unknown
}

export interface ProviderEvent {
  providerRef: string
  status: PaymentAttemptStatus
  amountXaf?: number
  feeXaf?: number
  netXaf?: number
  /** Provider event id — used for `whook:<provider>:<event-id>` idempotency. */
  eventId: string
  raw: unknown
}

export interface PaymentProviderAdapter {
  readonly code: string

  /** Read-only credential check (never a test charge). Returns the account's enabled methods. */
  verifyCredentials(credentials: Record<string, string>): Promise<VerifyCredentialsResult>

  /** Poll a transaction's current state — the safety net when a webhook is lost. NOT optional. */
  getTransaction(
    credentials: Record<string, string>,
    providerRef: string,
  ): Promise<ProviderTxnState>

  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, unknown>, secret: string): boolean
  parseWebhook(rawBody: Buffer): ProviderEvent

  /** Present where the capability advertises it (supports_payment_links). */
  createPaymentLink?(
    credentials: Record<string, string>,
    req: CreatePaymentLinkRequest,
  ): Promise<{ providerRef: string; url: string; expiresAt: string }>

  /** Present where the capability advertises it (supports_ussd_push). */
  initiateUssdPush?(
    credentials: Record<string, string>,
    req: InitiateUssdPushRequest,
  ): Promise<{ providerRef: string; status: PaymentAttemptStatus }>

  refund?(
    credentials: Record<string, string>,
    providerRef: string,
    amountXaf: number,
    idempotencyKey: string,
  ): Promise<{ providerRef: string; status: PaymentAttemptStatus }>
}
