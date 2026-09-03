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
