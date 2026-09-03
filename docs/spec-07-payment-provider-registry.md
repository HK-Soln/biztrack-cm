# Spec 07 — Payment Provider Registry & Execution Layer (FINAL)

**Product:** BizTrack CM · **Status:** Approved for build
**Grounded in:** `docs/investigation-payments/P00`–`P07` (repo-verified)
**Supersedes:** spec-07 v1 (no repo access) and spec-07 v2 (superseded by the A1–A12 amendments folded in here)
**Depends on (all shipped, Sprint-1):** Epic 2 (cash sessions, audit), Epic 3 (PIN step-up), `member_auth_credentials`, whole-XAF money (Epic 0), `packages/domain`.

Decision provenance is marked `[A#]`/`[Q#]`/`[D]` against the review answers in this file's history.

---

## 1. Positioning — the license-free path

Merchants **supply their own provider credentials**; funds settle **directly into the merchant's own account**. BizTrack never holds or moves client money — this is what keeps it outside money-transmission licensing.

`docs/paytrack-implementation-plan.md` (a standalone licensed telco service, deferred to ~2027) is **not** this spec and must not leak into it. Design rule: **PayTrack is provider N in this registry.** If the §4 adapter interface is right, the future licensed service registers as one more provider and merchants migrate by switching a route. Do not build a PayTrack-shaped special case.

**First providers `[Q3]`:** **Stripe (CARD)** then **MTN MoMo (`MTN_MOMO`)**.

- **Stripe = pipeline harness / sandbox** first — it proves the provider-agnostic plumbing (steps 1–7) against a mature, well-documented API. **Stripe does not onboard Cameroon-registered businesses for payouts**, so in production the capability matrix marks Stripe **not available for `country_code = 'CM'`**; it stays a dev/diaspora adapter, not a CM production tender. _(Open: if Stripe is ever a real CM production option via a diaspora/Atlas entity, revisit — see P07/history.)_
- **MTN MoMo = production-first for the CM market**, integrated **close behind** Stripe so the abstraction is validated on the hard case (USSD push, request-vs-payment ambiguity, late approval) before it ossifies.
- **Resist Stripe-isms** in the core: no assumption of hosted-checkout pages, synchronous confirmation, or guaranteed webhooks. The §4 interface guards this; keep it that way.

---

## 2. Data model

### 2.1 Provider catalogue — seeded data, not enums

```
payment_providers
  code               TEXT PK       -- 'STRIPE','CAMPAY','FLUTTERWAVE', … later 'PAYTRACK'
  name               TEXT
  auth_type          TEXT          -- OAUTH | API_KEY
  credential_schema  JSONB         -- field names, FR/EN labels, which fields are secret
  is_active          BOOLEAN

payment_provider_capabilities
  provider_code      TEXT   ┐
  payment_method     TEXT   ├─ PK  -- typed against PaymentMethod (varchar storage)
  country_code       TEXT   ┘      -- matches businesses.country (ISO-3166 alpha-2, default 'CM') [A8]
  supports_payment_links  BOOLEAN
  supports_ussd_push      BOOLEAN
  supports_refunds        BOOLEAN
  supports_webhooks       BOOLEAN
  is_active               BOOLEAN
```

Adding a **provider** is a data change. Adding a **payment method** is **not** pure data `[A3]` — a new tender needs `Sell.tsx` UI, shift-close reconciliation, reports, and per-tender variance (see §2.6). Key the matrix on `businesses.country` only; there is **no `region` column**, do not invent one.

### 2.2 Credentials — server-only, encrypted

```
business_payment_providers
  id, business_id, provider_code,
  encrypted_credentials    BYTEA,  -- AES-256-GCM, AAD = business_id
  key_version              INT,
  fingerprint              TEXT,   -- SHA-256 of plaintext, change detection
  last_four                TEXT,
  status                   TEXT,   -- PENDING_VERIFICATION | ACTIVE | FAILED | REVOKED | PROVIDER_UNAVAILABLE
  verified_methods         TEXT[], -- what the merchant's account is ACTUALLY approved for (§5)
  last_verified_at, verification_error,
  webhook_token            TEXT,   -- opaque, unique, rotatable independently
  webhook_secret_encrypted BYTEA,
  created_by, created_at, updated_at
  UNIQUE unq_business_payment_providers_business_provider (business_id, provider_code)
```

> ⛔ **Never register this table in any `SYNC_ENTITY_*` map or sync applier.** A reversible-use provider secret must never reach a client device. Note the precedent that must **not** be copied: `member_auth_credentials.secret_hash` (bcrypt PIN/card hashes) _is_ pull-synced via `AUTH_CREDENTIAL_MAP` — acceptable for a one-way local-verify hash, **unacceptable** for a provider secret. **CI test required** `[A5]`: fails if `business_payment_providers` appears in any sync map/applier.

### 2.3 Routing — one provider per method, DB-enforced

```
business_payment_routes
  id, business_id,
  payment_method  TEXT,
  provider_id     UUID → business_payment_providers,
  provider_code   TEXT,   -- denormalised, deliberately
  country_code    TEXT,   -- denormalised, deliberately (= businesses.country)
  is_enabled      BOOLEAN,
  UNIQUE unq_business_payment_routes_business_method (business_id, payment_method)
  FK fk_business_payment_routes_capability
     (provider_code, payment_method, country_code) → payment_provider_capabilities
```

The unique constraint **is** the one-provider-per-method rule; the composite FK makes routing MoMo to a card-only provider structurally impossible. **Routable methods: `MTN_MOMO`, `ORANGE_MONEY`, `CARD` only.** Reject `CASH`, `SAVINGS` (deposit draw-down), and `MIXED` (a derived header value — `deriveStoredPaymentMethod`, `sales.service.ts:2785-2797` — never a `sale_payments` row).

### 2.4 `payment_attempts` — the mutable execution record `[A3/Q9]`

**Named `payment_attempts`, not `payment_transactions`** (it is neither the `sale_payments` ledger nor `online_orders.payment_status`).

```
payment_attempts
  id, business_id,
  sale_id            UUID NULL,   -- populated at confirmation for in-store [A1]
  online_order_id    UUID NULL,   -- online context
  cash_session_id    UUID NULL,   -- in-store only; set at creation; NULL for online [A9]
  payment_method     TEXT,
  provider_id        UUID → business_payment_providers,
  provider_ref       TEXT,        -- authoritative provider txn id
  amount_minor       BIGINT,      -- integer, minor units of `currency` (§3)
  currency           TEXT,        -- ISO-4217, from business/store settings (not assumed)
  fee_minor          BIGINT NULL,
  net_minor          BIGINT NULL,
  status             TEXT,        -- INITIATED | PENDING | CONFIRMED | FAILED | EXPIRED
  attempt_number     INT,
  idempotency_key    TEXT UNIQUE,
  initiation_type    TEXT,        -- ATTESTED | LINK | USSD_PUSH | ONLINE_CHECKOUT
  customer_phone, link_url, expires_at,
  confirmed_at, failed_reason,
  confirmed_by, confirmation_type, -- WEBHOOK | POLL | MANUAL
  raw_callback       JSONB,
  created_at, updated_at
```

**Server-only. Mutable. Holds no ledger money.** It tracks provider execution, then feeds the two places that own truth:

- **Online** → updates `online_orders.payment_status` + `payment_reference`, writes an `online_order_events` row `triggered_by = 'PAYMENT_GATEWAY'`.
- **In-store** → on success, appends a `sale_payments` row (`mobile_money_reference = provider_ref`, and `payment_attempt_id`, see §2.5).

Retries are **new rows** (`attempt_number+1`, new idempotency key), never mutations. **Attempts are plural per order/sale** `[A7]`: retries → several rows (one CONFIRMED); partial payments → several CONFIRMED rows → several `sale_payments` rows. Never assume one.

**Invariant** `[A9]`: when `sale_id` is populated, `payment_attempts.cash_session_id` must equal `sales.cash_session_id` — except the session-boundary late-confirm case (§7.5), which is flagged, not silently divergent. CI test.

### 2.5 `sale_payments` gets `payment_attempt_id` `[A11]`

Add nullable `payment_attempt_id UUID` to `sale_payments`. Append-only (BIZ-2.8) forbids UPDATE/DELETE, **not** new columns. Without it, tracing a ledger row to its attempt relies on `mobile_money_reference`, which is `NULL` for `MANUAL` hard-confirms — the case you most want to audit.
**Parity** `[A11]`: `sale_payments` syncs, so add the SQLite column (desktop migration) **and** the entry in the sync applier's payment column map — not just the Postgres column.

### 2.6 `cash_sessions` tender columns — deferred normalisation `[A3/A3b]`

`cash_sessions` carries `expected_/confirmed_mtn_momo`, `expected_/confirmed_orange_money`, etc. as **columns**. Per A3b (no new tenders expected near-term in the CM economy) and Q1 (5 live merchant stores → migrating a live table is costly), **keep the columns for v1.** Requirement: route **all** tender expected/confirmed reads-and-writes in the reconciliation layer (§7, §9) through **one helper** (`packages/domain`), so a future `cash_session_tenders` normalisation is a single contained change. **Trigger to normalise:** a 4th routable tender is approved.

---

## 3. Money representation — currency-aware `[D]` `[A13]`

**Not XAF-specific.** BizTrack already has a non-XAF merchant (a UAE store priced in AED), and AED has **two** decimal places where XAF has **zero** — so a single "whole XAF integer" is wrong. Money on the provider boundary and in `payment_attempts` is **`(amountMinor, currency)`**: an integer in the currency's **minor units** plus an ISO-4217 `currency`. This is the exact, currency-agnostic form providers consume (Stripe et al. take integer minor units + currency).

- `currency` comes from **business settings** (`businesses.currency`, default `'XAF'`) / the store's currency — **never assumed**.
- Minor units follow the currency's ISO-4217 exponent: **XAF = 0** (minor == major), **AED = 2** (fils), most currencies = 2. A small exponent map lives in `packages/domain` (default 2; XAF/other 0-decimal currencies listed explicitly).
- **Backward-compatible:** the existing `online_orders` **int** columns are already _minor-units-of-the-store-currency_ — "whole XAF" is simply XAF's minor unit — so XAF merchants are unaffected and the AED store's fils already fit.
- **The sales ledger stays `sale_payments.amount decimal(12,2)` (major units)** — the shipped D1 decision; do NOT re-type it. `decimal(12,2)` holds both XAF (never uses the decimals) and AED (10.50).
- **Single conversion point:** `amountMinor` (currency) → decimal major units when a `payment_attempts` success appends a `sale_payments` row — one function in `packages/domain` keyed on the currency exponent, with a test.

> **Broader note (founder scope):** full multi-currency across products/prices/sales/reports/cash-rounding is larger than this spec. Any remaining hardcoded-XAF assumptions in those surfaces need a separate pass for the UAE store. This spec makes the **payments layer** currency-correct; it does not multi-currency the whole app.

---

## 4. Adapter interface

One adapter per provider in a new **`packages/payments` — server-only**.

```ts
interface Money { amountMinor: number; currency: string }  // §3 — never assume XAF

interface PaymentProviderAdapter {
  code: string
  verifyCredentials(cred): Promise<{ valid: boolean; enabledMethods: PaymentMethod[]; accountRef?: string; error?: string }>
  createPaymentLink(req: Money & { method: PaymentMethod; reference: string; idempotencyKey: string; customerPhone?: string; expiresInSeconds: number }): Promise<{ providerRef: string; url: string; expiresAt: string }>
  initiateUssdPush(req: Money & { method: PaymentMethod; customerPhone: string; reference: string; idempotencyKey: string }): Promise<{ providerRef: string; status: AttemptStatus }>
  getTransaction(providerRef: string): Promise<ProviderTxnState>   // NOT optional — the poll safety net
  verifyWebhookSignature(rawBody: Buffer, headers, secret): boolean
  parseWebhook(rawBody: Buffer): ProviderEvent
  refund?(providerRef: string, amount: Money, idempotencyKey: string): Promise<…>
}
```

Each adapter converts `(amountMinor, currency)` to its provider's expected wire format (Stripe already wants integer minor units + currency; a telco adapter formats as needed). The currency's decimal exponent lives in `packages/domain`, not in adapters.

- Every outbound call carries an **idempotency key derived from the attempt id**.
- **Reuse `packages/utils/src/phone.ts`** (`getCameroonNetwork()` / `detectMoMoOperator()`) to infer operator, not the customer.
- **Delete or complete the dead `Campay*` types** (`packages/types/src/payment.types.ts:21-34`, zero importers, env not in Zod schema) — unwired types that imply a provider choice bake in wrong assumptions.

**Enforcement that `packages/payments` never ships to a client `[A5]`:**

1. **Omit `@biztrack/payments` from the `package.json` deps** of `apps/desktop-v2`, `apps/mobile`, `apps/storefront`, `packages/ui` (pnpm resolution fails the build). Primary guard.
2. **ESLint import-boundary** rule for a clearer error.
3. **Sync-map test** (§2.2) + the domain-purity check pattern from Spec 06.

**Refund when `supports_refunds = false` `[A6]`:** not a blocker — a manual attested path. Merchant initiates → UI directs them to refund in the provider dashboard, records intent (`MANUAL_REFUND_REQUIRED`) → merchant performs it externally, returns and marks done (**PIN step-up + audit**) → only then the `REFUND`-kind `sale_payments` row appends. The ledger records money **actually** returned. `salesService.refund()` (stock + serials) runs regardless of which path collects the money — don't couple them.

---

## 5. Verification — three layers must agree

1. Provider supports it — `payment_provider_capabilities`
2. This merchant's account is approved for it — `verified_methods` (from `verifyCredentials`, a **read-only** provider call — never a test charge)
3. Merchant enabled it — `business_payment_routes.is_enabled`

A route may exist only where all three agree → a would-be checkout failure becomes a config-time message. **Re-verify daily** (BullMQ, `attempts:3` + exponential backoff, per `audit.service.ts:43-44`).

### 5.1 Store payment flags become derived `[A2]`

`online_stores.payment_mtn_momo`/`_orange_money`/`_card` are today independent booleans with no gateway. Once routes exist:

- **Effective availability = published-snapshot flag AND live verified-and-enabled route** (intersection). Payment methods behave like stock (read live), not branding.
- **Do NOT auto-republish** on route change — it would push whatever is staged in `has_unpublished_changes` live. A 2am route failure must not publish half-finished branding.
- **Re-validate at checkout submission**, not only at render — a route can fail between load and submit; fail with a clear message and preserve the cart. This is a **new server seam**: the public checkout must do a **live route lookup by `business_id`** (it currently resolves store by slug/snapshot).
- `payment_cash_on_delivery` is unaffected (COD needs no route).
- `ONLINE_PAYMENT_METHODS` (static `['CASH','MTN_MOMO','ORANGE_MONEY','CARD']`, `online.types.ts:538`) becomes **derived per business** from routes ∩ snapshot ∩ COD.
- **`mapPaymentMethod()`** (`online-orders.service.ts:863-876`) currently defaults unknown → `CASH` (dangerous once real MoMo exists). Make it **strict on the write path only** `[A10]`: (1) constrain `CheckoutRequest.paymentMethod` to the derived set (DTO validation), (2) storefront sends canonical values, (3) then strict mapper on checkout/payment-recording. **Keep a tolerant mapper on reads** — existing `online_orders` rows hold free-string labels; strict-on-read would break historical order display.

**Live-store migration note `[Q1]`:** the 5 live stores have no routes, so non-COD methods resolve to _unavailable_ — but that already matches reality (checkout is COD-only, no gateway). COD keeps working. **No live-store behaviour change.**

---

## 6. Online payment flow

### 6.1 The decoupling

Under `ONLINE_SALE_AT_CONFIRM` (default ON) the `Sale` is materialised at **merchant confirmation**, so a prepaid online payment succeeds while `online_orders.sale_id` is still `NULL`. Handled:

1. Checkout → `payment_attempts` row, `online_orders.payment_status = PENDING`.
2. Provider confirms → attempt `CONFIRMED`; `payment_status = PAID`; `payment_reference` set; `online_order_events` `triggered_by='PAYMENT_GATEWAY'`.
3. Merchant confirms order → `postSaleForOrder()` posts the Sale **with a payment** (existing `paymentStatus==='PAID'` branch). Source `provider_ref` from the **CONFIRMED `payment_attempts`** (authoritative), not the denormalised `online_orders.payment_reference` `[A7]`.

**New build:** `ORDER_PAID_UNCONFIRMED` alert (§6.3) — money taken, merchant hasn't acted.

### 6.2 Refund before a Sale exists

Order paid online then cancelled while `PENDING` has no Sale. Call provider refund, set `payment_status=REFUNDED`, write the event, append **no** `sale_payments` row. Distinct from `RETURNED` (which refunds a real sale via `salesService.refund()`).

### 6.3 Emails + alert

`STATUS_EMAIL` (`order-email.service.ts:15-71`) covers fulfilment only (`CONFIRMED` deliberately `null`). Add **payment-confirmation** and **payment-failure** customer emails without disturbing the fulfilment map.
New `NotificationType.ORDER_PAID_UNCONFIRMED` `[A12]`, same channels as `NEW_ORDER` (Socket.IO + bell), escalating — **respecting the business's quiet-hours/timezone** so a 2am payment doesn't WhatsApp the owner at 2am:

| Elapsed (order still PENDING) | Action                                      |
| ----------------------------- | ------------------------------------------- |
| 15 min                        | in-app + push                               |
| 1 hour                        | WhatsApp/email to owner (quiet-hours gated) |
| Daily                         | digest line until resolved                  |

Thresholds are a product choice `[A12b]` — tune later.

---

## 7. In-store flow

### 7.1 Three paths

- **A. Attested** _(offline-capable)_ — cashier reads the SMS on their phone, marks received. No API call. Writes a `sale_payments` row directly (`mobile_money_reference` operator-typed), as today. `initiation_type = ATTESTED`.
- **B. Payment link** _(online; `supports_payment_links`)_.
- **C. USSD push** _(online; `supports_ussd_push`)_ — model **request-failed vs payment-failed** distinctly; late approval after timeout is common → idempotency + poll (§9) mandatory.
  Offline, B/C are disabled with an explicit reason; attested MoMo + cash stay fully available.

### 7.2 Hold the Sale — do not post it unpaid `[A1]`

For B/C, **the Sale is NOT created until the attempt confirms.** `payment_attempts.sale_id = NULL` at creation, populated at confirmation; `cash_session_id` set at creation (the attempt is the **only** link to the shift during the pending window). Rationale: `Sale.creditAmount` is a generated column that materialises a `Debt` (a pending 30s payment would create/age a real receivable); `sales` has no `AWAITING_PAYMENT` status; and it resolves §7.3 cleanly. **Expiry 5 min**; the customer is present.

**Where the pending cart lives (in-store):** the parked-cart mechanism is **client-only** (`Sell.tsx:247-248,497` — localStorage `biztrack:sell:held`, "no DB / no sync / no DB row"). So during the pending window the **cart is client-held and the client posts the Sale on confirmation** (poll/subscribe to the attempt). It **ties up that device/session** until confirm/expire; a device loss mid-wait is caught by the §7.5 reconciliation exception. _(Hardening path if lost-cart-but-paid proves common: carry a cart snapshot on the attempt so the server can post independently — out of scope for v1.)_

### 7.3 Failed / expired attempt — no Sale was created

A failed or expired attempt means **no sale exists**. The cashier re-tenders (cash, credit, retry). Simple. **Do not auto-reverse stock** (none was deducted — the Sale never posted).

### 7.4 Cash-session rule `[A1/A9/Q5]`

- **Online orders: `cash_session_id` stays `NULL`** (reconcile against provider settlement).
- **In-store provider payments belong to the open cash session** (via the attempt, then the sale).
- **A pending in-store attempt must not count toward `expected_mtn_momo`** at close (BIZ-2.4) — only CONFIRMED attempts (i.e. rows that reached `sale_payments`) count. Naturally satisfied: pending attempts have no `sale_payments` row.

### 7.5 Late confirmation & session boundary `[A1]`

Goods given on trust, attempt `EXPIRED`, payment lands late → **reconciliation exception** (exceptions list); a human posts the sale or refunds. **Never auto-post a sale from a late confirmation.**
Session boundary (hard-confirm after the original session closed — Epic 2 sessions are immutable):

- Original session still open → post there.
- Original closed → post to the currently open session, **flagged late-confirmation** in audit.
- No session open → post `cash_session_id = NULL`, flagged **"hors caisse"**.

### 7.6 Manual intervention

Owner/manager only, **PIN step-up (Epic 3)**, **every action audited**:

- **Hard confirm** — appends the `sale_payments` row, `confirmation_type='MANUAL'` (on the attempt; the ledger row is plain: `method`, `amount`, `mobile_money_reference`, optional `note`, `payment_attempt_id`).
- **Mark failed** → §7.3. **Retry** → new attempt. **Cancel.**
  Report hard-confirms **separately** (a cashier with many is a pattern the owner should see) — feed the per-cashier risk summary (BIZ-2.11).

---

## 8. Webhooks — extend, don't build

| Need             | Reuse                                                                   |
| ---------------- | ----------------------------------------------------------------------- |
| Raw body         | Global `rawBody:true` (`main.ts:15`) → `req.rawBody`                    |
| Signature verify | `WahaWebhookGuard` — `createHmac('sha256')` + `timingSafeEqual`         |
| Idempotency      | Redis `whook:<provider>:<event-id>`, 24h TTL (per `ResendWebhookGuard`) |
| Retry/backoff    | BullMQ `attempts:3` + exp backoff                                       |

**Route:** `POST /api/v1/webhooks/payments/{provider_code}/{webhook_token}` under a **new `payments` module** (NOT `notifications/webhooks`). Tenant resolved from the opaque `webhook_token`, **never the payload**; unknown token → 404, no detail.

**Two genuinely new pieces:**

1. **Success-envelope opt-out decorator** — `ResponseInterceptor` auto-wraps unless `StreamableFile` or the object already has `success`/`requestId`/`timestamp`; no `@SkipInterceptor` exists. Build a first-class decorator for providers requiring an exact literal body.
2. **Throttle exemption** — global `ThrottlerGuard` (5/1s, 30/60s IP) has no `@SkipThrottle` anywhere; a provider retry storm from one IP would hit `medium`. Add `@SkipThrottle()` + signature-gated acceptance (or a dedicated tier) on the webhook.

**Handling:** capture raw body → resolve tenant → verify signature → idempotency check → persist raw → enqueue → **return 200 fast** → process async. Never regress `CONFIRMED`→`PENDING` on a late event; guard transitions in `packages/domain`.

---

## 9. Reconciliation & fees

- **Poll job** — every `PENDING` attempt older than 60s polled via `getTransaction` until terminal/expired, with backoff. Assume webhooks get lost.
- **Attestation matching** — match `ATTESTED` attempts against real provider transactions on a few-hours delay; an unmatched attestation is the closest thing to a real fraud signal. Feed match rate into BIZ-2.11; use provider data to cut BIZ-2.4's manual MoMo tick-through to an exceptions list.
- **Fees** — capture `fee_xaf` + `net_xaf` on `payment_attempts` **now** (cheap today, unrecoverable later; a 10,000 XAF payment settling at ~9,800 overstates profit every time). **Posting waits** for the chart-of-accounts work (P07 Q6); the data must not.

---

## 10. Security

- **Credentials never enter the sync graph** (§2.2) — test-enforced.
- **Envelope encryption** — AES-256-GCM, **AAD = `business_id`** (a stolen row can't replay under another tenant); `key_version` for rotation.
- **Master key `[A4/Q4]`** — env-provided behind a `MasterKeyProvider` interface for v1 (no KMS exists; no `createCipheriv` in-repo; Railway env). One env var holds a **versioned JSON map** (`PAYMENT_MASTER_KEYS = {"1":"…","2":"…"}`). Decrypt by row `key_version`; encrypt with `currentVersion()`. **Rotation:** add vN+1 → bump current → **batched re-encrypt job** → drop vN only when zero rows reference it (monitor with a per-`key_version` count). **No lazy re-encryption** (rarely-written rows would strand the old key).
  ```ts
  interface MasterKeyProvider {
    currentVersion(): number
    keyFor(version: number): Buffer /* resolves ALL live versions */
  }
  ```
  ⚠️ **Accepted residual risk (needs sign-off):** env key + DB on the same platform = one platform compromise exposes both. Proportionate only because credentials are merchant-owned + scoped (restricted keys) — not ideal. Revisit at volume.
- **Write-only API** — no endpoint returns a credential (not merchants, admins, support). Reads return provider, `last_four`, `fingerprint`, `status`, `verified_methods`, `last_verified_at`.
- **Prefer OAuth; else scoped/restricted keys** (checkout-session-only ≫ full secret key). POST body only, never query string/URL path. **PIN step-up (Epic 3) before any credential change.** Disable session-replay/error-capture on the credential form.
- **Extend `SENSITIVE_KEYS`** (`packages/utils/src/audit-diff.ts` — exact-key, case-sensitive; current: `password,passwordHash,password_hash,pin,pinHash,pin_hash,refreshToken,refresh_token,token,secret,otp`). **Add:** `apiKey,api_key,providerSecret,provider_secret,webhookSecret,webhook_secret,accountNumber,cardNumber,pan,cvv,momoToken`.
- ⚠️ **Ops question before go-live (Q7):** does Railway's edge proxy log request bodies? TLS terminates there. If it buffers bodies, raw payment payloads could land in platform logs — the only thing that would justify hybrid-encrypting the credential field.

---

## 11. Open questions still owned outside code

| #   | Question                                                                                                                             | Owner                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Q3b | Is Stripe a real CM production tender (diaspora/Atlas entity) or dev/sandbox only? Default assumed: **sandbox/pipeline only for CM** | Founder                |
| Q4  | Env master key (recommended) vs KMS for v1 — residual-risk sign-off (§10)                                                            | Architect + Ops        |
| Q6  | Where do provider fees post (no chart of accounts)? Capture now, post later                                                          | Architect + accountant |
| Q7  | Does Railway's proxy log request bodies?                                                                                             | Ops                    |
| Q8  | Abuse posture for unauthenticated checkout (bot/velocity/fraud)                                                                      | Architect              |

_(Q1 answered: ~5 live merchant stores. A3b answered: no new tenders near-term. Q3 answered: Stripe then MTN.)_

---

## 12. Build order

| #   | Step                                                                                                                                                        | Size  | Notes                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------- |
| 1   | Provider catalogue + capabilities, seeded (Stripe CARD non-CM, MTN `MTN_MOMO` CM)                                                                           | **S** | data-only; no client exposure            |
| 2   | Envelope encryption helper + `MasterKeyProvider` seam; credential storage; **write-only API**                                                               | **L** | security core                            |
| 3   | Verification lifecycle + daily re-verify                                                                                                                    | **M** | read-only provider calls                 |
| 4   | Routes (composite FK); derive store flags + `ONLINE_PAYMENT_METHODS` (§5.1); strict `mapPaymentMethod` write-path; `cash_session` tender helper seam (§2.6) | **M** |                                          |
| 5   | `payment_attempts` + state machine in `packages/domain`; `sale_payments.payment_attempt_id` (+ desktop parity)                                              | **L** |                                          |
| 6   | Envelope opt-out decorator + throttle exemption                                                                                                             | **S** | unblocks 7                               |
| 7   | Payment webhook controller + provider guard + idempotency                                                                                                   | **M** | smaller than v1 assumed                  |
| 8   | **First adapter — Stripe (CARD)** as pipeline harness                                                                                                       | **L** | design interface to MoMo's shape         |
| 9   | Online checkout wiring + `ORDER_PAID_UNCONFIRMED` + payment emails                                                                                          | **L** | test against the 5 live stores' COD path |
| 10  | In-store link/USSD UX + hold-the-sale + manual intervention                                                                                                 | **L** | client posts on confirm (§7.2)           |
| 11  | Poll job + attestation matching                                                                                                                             | **M** |                                          |
| 12  | Fee capture                                                                                                                                                 | **S** |                                          |
| 13  | **Second adapter — MTN MoMo** — the real test of the abstraction                                                                                            | **M** | close behind Stripe                      |

**CI guards to add up front:** sync-map exclusion test (§2.2), `packages/payments` import-boundary (§4), domain-purity (Spec 06 pattern).
