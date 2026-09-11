// Spec 08 — payment links. A tokenized link to pay one payable (debt / sale balance / online order /
// deposit) via the merchant's routed providers. Reuses the Spec 07 execution layer.

/** What a payment link collects toward. New sources add a PayableHandler + an entry here. */
export enum PayableType {
  DEBT = 'DEBT',
  SALE = 'SALE',
  ONLINE_ORDER = 'ONLINE_ORDER',
  DEPOSIT = 'DEPOSIT',
  /** A customer's WHOLE outstanding receivable balance (payableId = contactId). Payments allocate
   *  oldest-first across the contact's debts (Spec 09 §2.2). The default debt-collection payable. */
  CONTACT_RECEIVABLE = 'CONTACT_RECEIVABLE',
}

/** Balance payables allow partial payment; ONLINE_ORDER is exact. */
export const PARTIAL_PAYABLE_TYPES: readonly PayableType[] = [
  PayableType.DEBT,
  PayableType.SALE,
  PayableType.DEPOSIT,
  PayableType.CONTACT_RECEIVABLE,
]

export enum PaymentLinkStatus {
  ACTIVE = 'ACTIVE',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

/** Create a link for a payable (merchant, authed). Amount + currency are resolved SERVER-SIDE from the
 *  payable — never supplied by the client. */
export interface CreatePaymentLinkRequest {
  payableType: PayableType
  payableId: string
  /** Optional expiry override (ISO); default 7 days. */
  expiresAt?: string
  /** Optional label override; otherwise derived from the payable ("Order #123", "Debt", …). */
  label?: string
}

/** Merchant-facing view of a link (the token is returned so the merchant can share it). */
export interface PaymentLinkView {
  id: string
  token: string
  /** Full public pay URL (built from the configured pay-page base + token). */
  url: string
  payableType: PayableType
  payableId: string
  amountMinor: number
  amountPaidMinor: number
  currency: string
  allowPartial: boolean
  status: PaymentLinkStatus
  label: string | null
  customerId: string | null
  expiresAt: string
  createdAt: string
}

/** Public (payer) view resolved by token — MINIMAL disclosure (no customer history). `amountDueMinor`
 *  is the LIVE amount owed (re-checked at read time); `methods` are the business's enabled routed
 *  methods (CARD / MTN_MOMO / ORANGE_MONEY). */
export interface PublicPaymentLink {
  token: string
  businessName: string
  label: string
  amountDueMinor: number
  /** Total already collected across prior (partial) payments — drives the "X paid, Y remaining" UI. */
  amountPaidMinor: number
  currency: string
  allowPartial: boolean
  status: PaymentLinkStatus
  methods: string[]
}

/** Start a payment for a link (public, payer). `amountMinor` is honoured only for partial-capable
 *  links and is capped server-side at the live balance; otherwise the full live amount is charged. */
export interface InitiatePaymentLinkRequest {
  method: string
  clientReference: string
  amountMinor?: number
  customerPhone?: string
  /** The pay page's own origin — the server builds the hosted-card return URL from this. */
  returnUrl?: string
}

/** Outcome of starting a link payment: an embedded card form (Stripe Elements), a hosted redirect
 *  (card fallback), or a pending push (MoMo). */
export interface InitiatePaymentLinkResult {
  attemptId: string
  kind: 'redirect' | 'pending' | 'elements'
  /** kind==='redirect' — the hosted URL to send the payer to. */
  url?: string
  /** kind==='elements' — confirm the PaymentIntent inline with these (Stripe Elements). */
  clientSecret?: string
  publishableKey?: string
}

/** Poll state for a link payment (payer). */
export interface PaymentLinkPaymentStatus {
  status: 'PENDING' | 'PAID' | 'FAILED'
  reason?: string
}
