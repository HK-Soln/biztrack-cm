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
  /** A POS "sale intent": the link carries the full sale DTO but NO sale exists yet. When the expected
   *  amount is collected, the backend creates the real sale with the ACTUAL tender (card/MoMo) — so a
   *  scan-to-pay is a true card/MoMo sale, not a credit sale + debt. Works for anonymous customers. */
  SALE_DRAFT = 'SALE_DRAFT',
}

/** Balance payables allow partial payment; ONLINE_ORDER is exact. SALE_DRAFT accumulates toward its
 *  expected total (the sale materializes once fully collected). */
export const PARTIAL_PAYABLE_TYPES: readonly PayableType[] = [
  PayableType.DEBT,
  PayableType.SALE,
  PayableType.DEPOSIT,
  PayableType.CONTACT_RECEIVABLE,
  PayableType.SALE_DRAFT,
]

/** Create a SALE_DRAFT link (till, authed): the full sale DTO to materialize on payment + the expected
 *  amount to collect (minor units). No sale is created until the amount is fulfilled. */
export interface CreateSaleDraftLinkRequest {
  /** The sale to create once paid — the CreateSale DTO WITHOUT payments (the real tender comes from the
   *  actual attempts at fulfillment). Passed through and validated at sale-creation time. */
  sale: unknown
  amountMinor: number
  label?: string
  expiresAt?: string
}

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
  /** Merchant logo for the hosted pay-page header (Stripe-style). Null → render an initial avatar. */
  businessLogoUrl?: string | null
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
