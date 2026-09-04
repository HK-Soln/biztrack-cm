/** Spec 07 — BullMQ queue for background payment reconciliation. */
export const PAYMENTS_QUEUE = 'payments'

/** Poll a PENDING attempt's provider status until it settles or the window closes. */
export const POLL_PAYMENT_ATTEMPT_JOB = 'poll-payment-attempt'

export interface PollPaymentAttemptJobData {
  businessId: string
  attemptId: string
  /** Epoch ms after which we stop polling (the customer didn't approve in time). */
  deadline: number
}

/** How long to keep polling a request-to-pay (the approve-on-phone window) and how often. */
export const POLL_ATTEMPT_WINDOW_MS = 90_000
export const POLL_ATTEMPT_INTERVAL_MS = 5_000

/**
 * Provider failure-reason CODES that are safe to surface to the customer on the payment page.
 * A whitelist — an attempt's `failedReason` is only echoed publicly when it's one of these known,
 * customer-meaningful provider codes, so internal error text (initiation exceptions, HTTP messages)
 * is never leaked over the public storefront API. The storefront maps each code to localized copy.
 */
export const PUBLIC_PROVIDER_FAILURE_REASONS: ReadonlySet<string> = new Set([
  'NOT_ENOUGH_FUNDS',
  'PAYER_LIMIT_REACHED',
  'APPROVAL_REJECTED',
  'PAYMENT_NOT_APPROVED',
  'EXPIRED',
  'TRANSACTION_CANCELED',
  'PAYER_NOT_FOUND',
  'PAYEE_NOT_ALLOWED_TO_RECEIVE',
  'INTERNAL_PROCESSING_ERROR',
])
