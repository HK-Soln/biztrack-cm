# Spec 08 — Payment Links

Generic, tokenized payment links for **any payable** — a customer debt, a sale/order balance, an
online order awaiting payment, a customer deposit top-up. The merchant creates a link against a
payable and shares the URL/QR (WhatsApp/SMS/email); anyone with the link pays via the merchant's
routed providers (Stripe hosted page, or our own hosted page for MoMo). Settlement runs the payable's
own sink (reduce the debt, record the sale payment, mark the order paid, credit the deposit).

**This is the Spec 07 execution layer pointed at an arbitrary payable instead of an online order.**
~90% is reuse: routing, envelope credentials, the `payment_attempts` state machine, verification,
poll+webhook settle, the anonymous realtime channel, and fee capture all flow unchanged. The only new
logic is the *payable abstraction* and a *dedicated public pay page*.

Prereq: Spec 07 (`docs/spec-07-payment-provider-registry.md`) — complete.

## 1. Positioning

A payment link = an **unguessable token** granting **pay-only** access to **one payable**, for a
**server-bound amount**, executed against the **merchant's** routed provider. Cash-flow tool first
(debt collection), then order/sale balances and deposit top-ups. No online store required — a store-less
merchant can still send a debt link.

## 2. Data model

### 2.1 `payment_links`
| column | notes |
| --- | --- |
| `id` uuid pk | |
| `business_id` uuid | routing + provider creds resolve from here |
| `token` varchar unique | 32-hex (`randomBytes(16)`-class), the public handle; unguessable |
| `payable_type` enum | `DEBT | SALE | ONLINE_ORDER | DEPOSIT` |
| `payable_id` uuid | the source row |
| `amount_minor` int | TARGET at creation (the balance then); re-validated live at pay time |
| `currency` varchar | |
| `allow_partial` bool | true for DEBT/SALE/DEPOSIT; false for ONLINE_ORDER |
| `amount_paid_minor` int default 0 | accumulates across attempts |
| `status` enum | `ACTIVE | PARTIALLY_PAID | PAID | EXPIRED | CANCELLED` |
| `expires_at` timestamptz | default **7 days**, merchant-overridable |
| `label` varchar | shown on the pay page ("Order #123", "Debt", …) |
| `customer_id` uuid null | attribution |
| `created_by` uuid, `created_at`, `updated_at` | audit |

Partial unique index: **one ACTIVE link per (`business_id`,`payable_type`,`payable_id`)** for
DEBT/SALE/ONLINE_ORDER (re-create supersedes: cancel the old or return the existing). DEPOSIT allows
many (independent top-ups). Server-only, never synced (like `payment_attempts`).

### 2.2 `payment_attempts.payment_link_id`
A new nullable `payment_link_id` — the **fourth initiation context** alongside `online_order_id`,
`sale_id`, `cash_session_id`. Every reuse keys off it; `initiation_type = LINK` (hosted) or `USSD_PUSH`.

## 3. The payable abstraction (the only real new logic)

A **handler registry**, one implementation per `payable_type`:

```ts
interface PayableHandler {
  type: PayableType
  /** Server truth — compute the current amount owed + display label from the source. */
  resolve(businessId, payableId): Promise<{ amountDueMinor; currency; label; customerId? } | null>
  /** The settle sink — apply a confirmed payment of amountMinor to the source. */
  applyPayment(businessId, payableId, amountMinor, attempt): Promise<void>
}
```

- **DEBT** → `resolve` reads the outstanding balance; `applyPayment` records a debt payment (reduces it).
- **SALE** → `resolve` reads `sale.creditAmount` (balance due); `applyPayment` → `salesService.recordPayment`.
- **ONLINE_ORDER** → `resolve` reads the order total (if unpaid); `applyPayment` → `settleOnlineOrder`-style mark-paid.
- **DEPOSIT** → `resolve` returns an OPEN amount (payer enters); `applyPayment` credits the savings account.

New payable types = one new handler; nothing else changes.

## 4. Amount model — live + partial

- **DEBT / SALE balance**: the link is "pay toward this." At pay time `resolve` gives the **current**
  balance; the payer may pay **part** (capped at that balance). Link: `ACTIVE → PARTIALLY_PAID → PAID`
  (PAID when the source balance hits 0), payable until cleared or `expires_at`.
- **ONLINE_ORDER**: fixed, exact — pay the order total once.
- **DEPOSIT**: open amount — the payer enters what to add; the link is one payment then `PAID`.
- **Invariants (all types):** the charge amount is **server-bound** (never client-set beyond a
  partial amount **≤ live balance**); settle is **idempotent**; a `PAID` link refuses payment; the
  balance is re-checked live so a source already settled elsewhere can't be paid again. **No overpay,
  no double-pay.**

## 5. Security

- **Token IS the authorization.** 128-bit+ random; enumeration infeasible. Grants pay-only rights to
  one payable — nothing else. Same trust model as the order `trackingToken`.
- **Amount never client-supplied.** Server computes it (partial ≤ live balance). The client cannot set
  what it is charged.
- **Recipient correct by construction.** Executes against the merchant's routed provider creds — funds
  cannot be redirected.
- **Expiry (7d default) + throttling + minimal disclosure.** The public page shows only
  *"Payment to [Business] · [what for] · [amount]"* — never the customer's broader history.
- **Creds never touch the client** — server-only; Stripe-hosted or our hosted page (unchanged).

## 6. Surfaces

### 6.1 Merchant (authed)
- `POST /payment-links` — create for a payable → `{ token, url }` (+ list, `POST /:id/cancel`).
- Desktop: a **"Send payment link"** action on a debt / customer / sale / order → copyable link + QR +
  share; a links list with status.

### 6.2 Payer (public, by token)
- `GET /public/pay/:token` — amount (live), label, business, enabled methods, status.
- `POST /public/pay/:token/initiate` — start a payment (card link / MoMo push; optional partial amount).
- `GET /public/pay/:token/status` — poll. Reuses the in-store/online initiation machinery.

## 7. Settlement

Attempt confirms → `applyDownstreamEffects` sees `payment_link_id` → `PaymentLinkService.settle(attempt)`:
resolve the handler → `applyPayment` (record sale/debt payment · mark order paid · credit deposit) →
increment `amount_paid_minor`, recompute `status` from the handler's live balance → notify the merchant
→ emit on the link's token channel. Idempotent via the attempt state machine.

## 8. Public pay page

A **dedicated public route `/pay/[token]`** — OUTSIDE the storefront `(store)` route group (no store
slug, no store gating), reusing the storefront app's `PaymentView`, socket client, and i18n. Stripe →
hosted redirect; MoMo → number → push → poll+WS. A **partial-amount input** for balance links.

## 9. Realtime + notifications

- Reuse the anonymous public realtime channel keyed by the **link token** (mirrors `/public-orders`) +
  poll fallback.
- Merchant gets a **"Payment link paid"** notification (payable + amount) on settle.

## 10. Build order

| # | Slice | Notes |
| --- | --- | --- |
| 1 | `payment_links` table + entity + `PayableHandler` registry (all 4 `resolve`) + `PaymentLinkService.create/list/cancel` + authed controller | new `payment-links` module |
| 2 | `payment_attempts.payment_link_id` seam + public `GET/initiate/status` by token (reuse initiation) | live-balance + partial here |
| 3 | Settlement sinks — `applyDownstreamEffects` → `handler.applyPayment` + link status + notify + WS | the 4 `applyPayment` |
| 4 | Dedicated `/pay/[token]` page generalizing `PaymentView` (+ partial amount) | storefront app, non-store route |
| 5 | Merchant desktop UI — "Send payment link" + links list | |

## 11. Reuse (Spec 07 — do not reinvent)

Routing (`PaymentRoutingService`), adapters (Stripe/MTN), `payment_attempts` + state machine,
verification, poll job + webhook controller, fee capture, the anonymous public realtime namespace
(`OrderChannelService` pattern), `PaymentInitiationService` (add a `initiateLinkPayment` sibling of
`initiateInStorePayment`/`initiateOnlineCheckout`).

## 12. Out of scope (v1)

- Reusable/standing links (a customer's permanent top-up link) — v1 links are one payment cycle.
- Multi-currency payables — inherit the payable's currency.
- Scheduled/recurring links, dunning sequences.
- Signed short links / custom domains per merchant (deploy concern).
