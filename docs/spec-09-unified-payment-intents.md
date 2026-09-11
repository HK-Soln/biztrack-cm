# Spec 09 — Unified Payment Intents (single token-addressed payment route)

**One payment route for everything.** Every payable — an online order, an in-store sale, a customer
debt, a deposit top-up — is collected through **one** token-addressed page (`/pay/{token}`) served from
the storefront app on the `pay.[domain]` host. The token resolves the payable's supported methods; the
payer picks one and pays; **multiple payments accumulate** toward the target; the merchant can stop short
and record the remainder as **credit**. This retires the bespoke per-surface payment flows (the online
order `/orders/{token}/pay` page, the in-store `PaymentModal` charge machine) once parity is proven.

**Prereqs:** Spec 07 (provider registry + execution) and Spec 08 (payment links) — both complete. This
spec **generalizes Spec 08's `payment_links`** from "a link you share" into "the payment intent behind
any payable," and adds embedded Stripe Elements + split-payment finalize-to-credit.

## 1. Why

Today there are **three** payment initiation paths with overlapping logic:
- online checkout (`initiateOnlineCheckout`, order-specific pay page, single settle),
- in-store (`initiateInStorePayment`, `PaymentModal` charge machine, client posts the sale on confirm),
- payment links (`initiateLinkPayment`, `/pay/{token}`, accumulating partial payments — Spec 08).

The link flow (Spec 08) is already the most general: token → methods → pay → accumulate → settle to a
payable sink. **Make it the only one.** Fewer flows, one pay page to design/harden, split payments
everywhere for free, and it works for merchants with no online store.

## 2. The intent model

**Reuse `payment_links` as the intent store** (it already is one: token, target `amount_minor`,
accumulating `amount_paid_minor`, `status ACTIVE|PARTIALLY_PAID|PAID|EXPIRED|CANCELLED`, `allow_partial`,
`payable_type/id`). No table rename (a shipped table). The word "intent" is the concept; the row is a
payment_link. New capabilities layered on:

- **`allow_multiple` / target semantics.** Every payable's intent accumulates payments up to
  `amount_minor` (the target). Partial is the norm; `PAID` when `amount_paid >= amount_minor` OR the
  payable's live balance clears.
- **Finalize (§4).** A payable's intent can be **finalized** by the merchant with an outstanding
  balance → the collected amount is applied and the remainder becomes credit (sale → receivable).
- **One intent per payable** (the existing partial unique index), created lazily the first time a
  payment is wanted for that order/sale/debt/deposit.

### 2.1 Stripe & "partial payments" — how our accumulation works

Stripe has **no** primitive for paying one PaymentIntent down over time in our sense (multicapture =
multiple captures of an *already-authorized full amount*; Invoicing partial payments = a different
product). We don't need one: **our intent accumulates across N separate attempts, and each attempt is
its own complete Stripe PaymentIntent for the partial amount entered that time.** Each Stripe charge is
a normal full payment for its own amount; the running total lives on `payment_links.amount_paid_minor`
(our side). With Elements, each partial mints a fresh PaymentIntent + `clientSecret` and re-mounts
`PaymentElement`. MoMo is likewise a fresh request-to-pay per partial. Verified against Stripe docs.

### 2.2 Debt collection = a CONTACT-BALANCE intent (not per-debt)

Merchants collect a customer's **total** owed, not one debt at a time. New payable type
**`CONTACT_RECEIVABLE`** — `payableId = contactId`:
- `resolve()` = SUM of the contact's outstanding RECEIVABLE debts (label "Balance for {contact}",
  `customerId = contactId`, `allowPartial = true`).
- `applyPayment(contactId, amountMinor)` = **allocate the paid amount across the contact's outstanding
  debts OLDEST-FIRST (FIFO)** via `debtsService.recordPayment` per debt, partial on the last, until
  exhausted. Multiple payments accumulate the same way.
- One intent for the **whole balance** (default) or the amount the client chooses; share one link/QR.
- **Debt selection** (pay only a chosen subset) is a refinement: it needs the selected debt ids
  persisted on the intent (a small `scope jsonb` column on `payment_links`) so settlement allocates
  within the selection. **v1 = whole-balance FIFO**; selection is a later slice.
- Desktop: a contact-level "Collect balance" action becomes the default; the per-debt link (Spec 08)
  still works.

## 3. Card via embedded Stripe Elements

Replace the hosted Checkout Session redirect with an **inline PaymentElement** on the pay page (amount is
known, we control the page):
- **Adapter:** add `createPaymentIntent(creds, {amountMinor, currency, idempotencyKey}) → {providerRef
  (pi_…), clientSecret}` to the Stripe adapter (alongside the existing `createPaymentLink`, which stays
  for any hosted fallback). MoMo is unchanged (request-to-pay push).
- **Public API:** `POST /public/pay/:token/initiate` for CARD returns `{ clientSecret, providerRef,
  attemptId }` instead of a redirect URL. The attempt is created PENDING keyed on `providerRef`.
- **Pay page:** load Stripe.js (external script — fine on a real deployed app, not an artifact), mount
  `<PaymentElement>` with the `clientSecret`, call `stripe.confirmPayment` client-side; settlement still
  arrives via webhook + poll (unchanged). No redirect.
- MoMo path on the same page unchanged (number → push → poll).

## 4. Split payments + finalize-to-credit

- **Accumulate:** each confirmed attempt adds to `amount_paid_minor` (Spec 08 settlement already does
  this). The pay page already re-fetches the link after each settle and offers to pay the remainder
  (shipped). For a SALE/ONLINE_ORDER this means the sale/order can be **partially** collected.
- **Multiple payments on orders/sales:** the settlement sinks apply each partial to the payable —
  `salesService.recordPayment` / order payment rows — so a sale/order accepts N payments (needs the
  online order to carry multiple payment rows; today `settleOnlineOrder` is one-shot → change to
  accumulate + a per-payment event).
- **Finalize (merchant action):** "Finish & record balance as credit" on a partially-paid sale/order →
  the collected amount stands, the remainder becomes a **credit sale / receivable** on the customer
  (reuses the existing credit-sale path). The intent goes to `PAID` (fully accounted: cash + credit).
  Deposits/debts have no leftover concept (they're open/balance payables).

## 5. Surface changes (incremental — keep old paths until parity)

- **Online checkout:** at checkout pick a preferred method → create the intent → **redirect to
  `/pay/{token}`** (pre-select the method, payer can switch). Retire `/orders/{token}/pay` once proven.
  NEW checkouts route here; existing orders keep working.
- **Sell (till):** create the intent for the cart → show a **QR to `/pay/{token}`**; the cashier can
  still trigger card/MoMo directly from the till against the **same token**, or the customer scans and
  self-serves. Leftover → credit sale (the sell flow already supports credit). The `PaymentModal` charge
  machine is kept until the token flow reaches parity, then removed.
- **Payment links (Spec 08):** already the token flow — unchanged; it just gains Elements + the shared
  finalize where relevant.

## 6. Deployment

`pay.[domain]` points (DNS) at the **existing storefront deploy** — one multi-tenant app. `/pay/*`
already renders on any host (middleware excludes it from the store-root redirect). `PAYMENT_LINK_BASE_URL`
(API) = `https://pay.[domain]`. No new app.

## 7. Build order (incremental)

| # | Slice | Notes |
| --- | --- | --- |
| 1 | `CONTACT_RECEIVABLE` payable — whole-balance intent + FIFO allocation across debts (§2.2) | new handler; desktop "Collect balance" at contact level |
| 2 | Stripe `createPaymentIntent` (client_secret) + public initiate returns it for CARD | adapter + public API + attempt keyed on pi_ ref |
| 3 | Pay page: inline `<PaymentElement>` (Stripe.js) for CARD; MoMo unchanged | retires the redirect for links |
| 4 | Online order: accept MULTIPLE payments (accumulate, per-payment event) | change `settleOnlineOrder` one-shot → accumulate |
| 5 | Finalize-to-credit (sale/order): apply collected + remainder→receivable | merchant action + intent PAID |
| 6 | Online checkout → create intent + redirect to `/pay/{token}` (pre-selected method) | keep old order pay page |
| 7 | Sell → intent + QR to `/pay/{token}` (+ direct card/MoMo from till on same token) | keep PaymentModal until parity |
| 8 | Retire the bespoke flows once parity proven | cleanup |
| — | (later) Debt-subset selection — `scope` column + selection UI | refinement of §2.2 |

## 8. Reuse / do not reinvent

Spec 07 (routing, adapters, `payment_attempts` state machine, verification, poll+webhook, fee capture,
the anonymous realtime pattern) and Spec 08 (`payment_links` intent store, `PayableHandlerRegistry`,
`PaymentLinkSettlementService`, `PublicPaymentLinkService`, the `/pay/[token]` page + `PayLinkView`
multi-payment). This spec extends, it does not rebuild.

## 9. Out of scope (v1)

Recurring/scheduled intents; multi-currency; saving a card for reuse (Stripe SetupIntent); Apple/Google
Pay tuning beyond what PaymentElement gives for free; per-merchant custom pay domains.
