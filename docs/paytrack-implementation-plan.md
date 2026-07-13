# PayTrack CM — Implementation Plan

> Status: **DRAFT / planning** · Owner: TBD · Target window: roadmap Q1–Q2 2027 (build starting now)
> Decisions locked with product: **standalone service** (`apps/paytrack-api`) · **direct telco integration** (MTN MoMo + Orange Money APIs, not an aggregator) · deliver as a **full build**, not just a spike.

PayTrack is BizTrack CM's standalone payments infrastructure: a licensed-grade money-movement service that collects and disburses funds over MTN Mobile Money, Orange Money, cards, QR and payment links — usable both by BizTrack merchants and by third-party developers via a REST API + JS SDK.

This document is the engineering plan. It is grounded in an audit of the current codebase (see **§2 Current-state audit**) and structured as phases that can each ship independently behind flags.

---

## 1. Goals, non-goals, and the critical path

### 1.1 Goals

- A standalone `apps/paytrack-api` service with its **own database** and its **own merchant identity**, integratable with — but not dependent on — the BizTrack `apps/api`.
- **Direct** integration with MTN MoMo (Collections + Disbursements) and Orange Money (Web Payment + Cashin/Cashout), no third-party aggregator (Campay) in the critical path.
- A correct, immutable, **double-entry ledger** as the single source of truth for every franc that moves.
- Async **collection** flows (USSD push / OTP), provider **webhooks + reconciliation** polling, and a **settlement/payout** engine that pays merchants out to MoMo or bank on a schedule.
- Merchant-facing **payment links** and **dynamic QR** (dual-provider), a **developer REST API** (API keys + signed webhooks), and a **JS SDK** for online shops.
- BizTrack integration: online-store checkout goes live-MoMo (replacing COD-only), in-store sale MoMo collections, and paid-plan subscription billing.

### 1.2 Non-goals (this phase)

- Card **acquiring** / Bluetooth terminals (GIM-UEMOA/Visa/MC) — hardware- and certification-heavy; deferred to a late phase, gated on card-scheme onboarding.
- Cross-border remittance, multi-currency settlement (XAF only initially).
- Becoming our own licensed PSP/EMI. Initial launch runs under **partner merchant agreements** with MTN/Orange; the COBAC/BEAC licensing track runs in parallel and is a **business/legal workstream**, not an engineering blocker for sandbox + pilot.

### 1.3 The critical path is regulatory, not code

Direct telco access is **gated on partner onboarding**, which is slow and out of our hands:

| Track                                                                                                    | Can start now  | Blocks                                |
| -------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------- |
| MTN MoMo **sandbox** (self-provision API user/key on momodeveloper.mtn.com)                              | ✅ immediately | nothing — build against sandbox today |
| MTN MoMo **production** (partner/merchant agreement, KYC, prod subscription keys, callback allowlisting) | ⏳ apply now   | live MTN collections                  |
| Orange Money **developer sandbox** (developer.orange.com)                                                | ✅ immediately | nothing                               |
| Orange Money **production merchant** (OM merchant code, contract, prod credentials)                      | ⏳ apply now   | live Orange collections               |
| Settlement bank account / MoMo payout wallet                                                             | ⏳ apply now   | paying merchants out                  |
| COBAC/BEAC PSP posture, AML/KYC policy                                                                   | ⏳ legal       | scale beyond pilot                    |

**Implication for sequencing:** every phase is built and fully tested against **sandbox** first. Going live per provider is a config swap once prod credentials land. Kick off the MTN + Orange + bank applications on **day 1** in parallel with Phase 0.

> Reference (MTN): [MoMo Developer Portal](https://momodeveloper.mtn.com/) · [momo.mtn.com/api](https://momo.mtn.com/api/) · [API docs / sandbox](https://momodeveloper.mtn.com/api-documentation). Sandbox self-provisions API users/keys and supports webhook callbacks; Collections + Disbursements are available for Cameroon.

---

## 2. Current-state audit (what already exists to build on)

Verified against the codebase on 2026-07-11. **None of this is a payment gateway yet** — it's a ledger/recording layer that PayTrack will feed.

### 2.1 Payment types (in `packages/types`)

- `PaymentMethod` enum (`sale.types.ts`): `CASH | MTN_MOMO | ORANGE_MONEY | CARD | SAVINGS | MIXED`.
- `PaymentStatus` (`payment.types.ts`): `PENDING | SUCCESS | FAILED | REFUNDED` — currently only used by the unused `SubscriptionPayment` shape.
- `OnlinePaymentStatus` (`online.types.ts`): `PENDING | AUTHORIZED | PARTIALLY_PAID | PAID | FAILED | REFUNDED | PARTIALLY_REFUNDED` (on `OnlineOrder.paymentStatus`).
- `SalePaymentKind`: `PAYMENT | REFUND` (append-only signed ledger; `amountPaid = Σ(PAYMENT) − Σ(REFUND)`).
- **Campay types exist but are dead code**: `CampayPaymentInit` / `CampayPaymentResponse` in `payment.types.ts`, env vars in `.env.example` (`CAMPAY_*`) **not** in the Zod schema, **zero usages**. Direct-telco decision means we do **not** wire Campay; these can be deleted later.

### 2.2 Ledger entities (in `apps/api`, all append-only / immutable)

- `SalePayment` (`sale_payments`): `saleId, businessId, method, amount decimal(12,2), mobileMoneyReference, savingsAccountId, kind, recordedAt, recordedById, note`. Created by `SalesService.recordPayment()` — **idempotent by payment id**, recomputes sale settlement, auto-settles COD receivable.
- `DebtPayment` (`debt_payments`), `RestockPayment` (`restock_payments`), `SavingsTransaction` (`savings_transactions`) — same shape family, each with `method` + `mobileMoneyReference`.
- **Money representation:** `decimal(12,2)`, **XAF major units** (XAF has no minor unit), via `decimalTransformer`; `roundMoney()` guards precision.

### 2.3 Online-order payment flow (the current "manual" seam PayTrack replaces)

- `PATCH /online-store/orders/:id/payment` → `OnlineOrdersService.updatePayment()`. Admin manually marks an order `PAID` and picks a static method. If `ONLINE_SALE_AT_CONFIRM` (default true) and the order has a `saleId` with outstanding `creditAmount`, it calls `SalesService.recordPayment()`. Storefront checkout is **COD-only** today (see memory `payment-methods-plan`).
- `OnlineOrder` already has `paymentReference varchar(200)` and `paymentMethod` — natural join points for a PayTrack transaction id.

### 2.4 Subscriptions/plans

- Paid plans are **trial-only**; `SubscriptionPayment` is a defined-but-unused shape. No gateway, no billing processor. PayTrack will own real plan charges.

### 2.5 Operator routing (in `packages/utils/phone.ts`)

- `getCameroonNetwork()`, `detectMoMoOperator() → 'MTN' | 'ORANGE' | 'UNKNOWN'`, `formatCMPhone()` (E.164 +237…), `isValidCMPhone()`. **Reuse directly** to route a payer's number to the right telco. (MTN: 650–654, 67X, 680–683; Orange: 640, 655–659, 686–689, 69X.)

### 2.6 Sync

- Payment ledger rows are **pull-only** children of their aggregates (`SalePaymentSyncRecord`, `DebtPaymentSyncPayload`). Desktop can record CASH/SAVINGS payments fully offline. **MoMo collections are inherently online** — PayTrack calls are never part of the offline write path; the desktop initiates a collection only when connected, then records the resulting `SalePayment` with the PayTrack reference.

---

## 3. Target architecture

### 3.1 Service & data boundary

- **New app:** `apps/paytrack-api` (NestJS 10, URI-versioned `/api/v1`, port `3004`). Scaffolded from the `apps/admin-api` skeleton (§7).
- **Own database** (`PAYTRACK_DATABASE_URL`) — **not** the shared BizTrack DB. Rationale: financial-data isolation, independent ledger integrity/migrations, independent scaling, cleaner audit/compliance boundary, and it must serve **non-BizTrack merchants**. This is a deliberate deviation from admin-api's shared-DB pattern. PayTrack **owns its own migrations**.
- **Shared infra:** Redis (BullMQ queues for webhooks/reconciliation/settlement, and rate limits) — separate logical prefix; can reuse the same Redis instance.
- **Money in PayTrack:** store as **`bigint` integer XAF** (whole francs) at the ledger boundary to remove all float ambiguity; map to/from BizTrack's `decimal(12,2)` at the integration edge. (XAF is already indivisible, so integer francs are exact.)

### 3.2 Core domain model (PayTrack DB)

```
merchant            — a PayTrack account (may be linked to a BizTrack businessId, or standalone)
merchant_api_key    — hashed API keys + scopes for the developer API
merchant_webhook    — merchant callback URLs + signing secret
ledger_account      — double-entry accounts (per merchant: BALANCE, PENDING, FEES, SETTLEMENT_PAYABLE; plus platform accounts)
payment             — a collection intent + lifecycle state machine (the "charge")
payout              — a disbursement/settlement to a merchant destination
provider_txn        — one row per provider API call/callback (MTN/Orange), with raw request/response + provider ref
journal_entry       — an immutable double-entry event (balanced set of postings)
posting             — one debit or credit line against a ledger_account
webhook_delivery    — outbound webhook attempts to merchants (with retry/backoff)
idempotency_key     — request-level idempotency store (key → first response), TTL'd
reconciliation_run  — periodic provider-vs-ledger sweep results
```

### 3.3 Payment (collection) state machine

```
CREATED → PENDING (provider accepted; USSD push / OTP sent)
        → SUCCEEDED (provider confirms; ledger posts collected funds)
        → FAILED (declined/timeout/insufficient)
        → EXPIRED (payer never approved within TTL)
SUCCEEDED → REFUND_PENDING → REFUNDED | REFUND_FAILED
```

- Every transition is **idempotent** and **event-sourced** into `journal_entry`. State only advances on a **verified** provider signal (webhook **or** reconciliation poll — never trust the client).
- Double-entry on success: `Dr PENDING/clearing → Cr merchant BALANCE` and `Dr merchant BALANCE → Cr platform FEES` for the PayTrack fee.

### 3.4 Two-sided reliability: webhooks **and** reconciliation

MoMo/OM collections are async and webhooks are lossy. Every payment gets:

1. an inbound **webhook handler** (signature/allowlist verified) that advances state, and
2. a **BullMQ reconciliation poller** that queries provider `GET status` on a backoff until terminal, as the source of truth if the webhook never arrives. Idempotency guarantees webhook + poll can't double-post.

### 3.5 BizTrack ↔ PayTrack integration contract

- BizTrack `apps/api` becomes a **PayTrack merchant** (server-to-server, API key). To collect: `POST /paytrack/v1/payments` with `{amount, payerPhone, method, externalReference, callbackUrl}`. PayTrack returns `{paymentId, status, ussdCode?}`.
- On terminal status PayTrack calls BizTrack's webhook → BizTrack records/settles the existing `SalePayment` (or `OnlineOrder.paymentStatus`) using `paymentReference = paytrack:{paymentId}`. **No change to BizTrack's ledger model** — PayTrack just supplies verified references and fires the existing `recordPayment()` path.
- Desktop/offline unchanged: MoMo collection is an online-only action; offline sales stay CASH/SAVINGS.

---

## 4. Phased delivery

Each phase is independently shippable behind flags. Sandbox-first throughout.

### Phase 0 — Foundations & regulatory kickoff (1–2 wks)

- Kick off MTN, Orange, and settlement-bank/payout applications (business/legal) — **day 1, parallel**.
- Scaffold `apps/paytrack-api` from the admin-api skeleton (§7): health, config/Zod env, own DB datasource + first migration, JWT auth for the merchant dashboard, response envelope/filter/request-id, Redis + BullMQ, CI + deploy workflow.
- Land the **core domain migrations** (§3.2) and the **double-entry ledger primitives** (`ledger_account`, `journal_entry`, `posting`) with a `LedgerService.post(entries[])` that enforces balanced postings in a single DB transaction.
- **Idempotency middleware** (`Idempotency-Key` header → `idempotency_key` table).
- Exit: service deploys to staging; `POST` a manual balanced journal entry; 100% ledger unit-test coverage on balancing invariants.

### Phase 1 — Merchant & money primitives (1–2 wks)

- `merchant`, `ledger_account` provisioning (open standard accounts on merchant create), balance queries.
- Merchant dashboard auth (email/password → JWT), "link to BizTrack business" flow (BizTrack calls PayTrack with a service token to provision a merchant for a `businessId`).
- Fee model config (per-merchant / per-method bps + fixed), applied as ledger postings.
- Exit: create a merchant, see a zero balance across correct accounts, configure fees.

### Phase 2 — MTN MoMo Collections (2–3 wks) ★ first real money

- MTN **Collections** client: sandbox API-user/key provisioning, OAuth token cache, `requestToPay` (USSD push), `GET /requesttopay/{referenceId}` status.
- `payment` state machine + inbound **webhook** handler (allowlist + validation) + **reconciliation** poller (BullMQ, exponential backoff to terminal).
- Ledger postings on success/fail/expire; fee posting; merchant balance moves.
- `POST /paytrack/v1/payments` (API-key auth) + merchant webhook fan-out on terminal state.
- Exit: end-to-end sandbox collection (initiate → USSD → webhook + poll → SUCCEEDED → balance credited → merchant webhook delivered); replay/idempotency proven.

### Phase 3 — Orange Money Collections (1–2 wks)

- Orange **Web Payment / Cashin** client (OM merchant credentials, OTP/redirect flow), same state machine, webhook + reconciliation.
- `detectMoMoOperator()` auto-routes MTN vs Orange from the payer number; explicit override supported.
- Exit: sandbox OM collection end-to-end; provider-agnostic `payment` API (method or auto-route).

### Phase 4 — Disbursements & settlement engine (2–3 wks)

- MTN **Disbursements** (`transfer`) + OM **Cashout** clients.
- `payout` state machine + ledger (`Dr SETTLEMENT_PAYABLE → Cr clearing` on payout).
- **Settlement scheduler** (BullMQ cron): roll each merchant's available balance (minus fees/holds) into a daily payout to their configured MoMo/bank destination; hold/rolling-reserve config; payout webhooks + reconciliation.
- Exit: sandbox daily settlement run pays a merchant out; balances reconcile to zero across the cycle.

### Phase 5 — Payment links & dynamic QR (1–2 wks)

- Hosted **payment link** pages (`pay.paytrack.cm/{token}`) — pick method, enter number, live status; shareable via WhatsApp/SMS/email.
- **Dynamic QR** encoding a payment intent (dual-provider); merchant-presented and customer-scan flows.
- Exit: create a link/QR, pay it in sandbox, funds land, receipt shown.

### Phase 6 — Developer platform (2 wks)

- `merchant_api_key` (create/rotate/scope, hashed at rest), **HMAC-signed** outbound webhooks with retries + a `webhook_delivery` log and replay endpoint.
- Public REST API surface (payments, payouts, balance, refunds), API docs, and a small **JS SDK** (`@biztrack/paytrack-sdk`) for online shops.
- Exit: an external merchant integrates end-to-end using only the public API + SDK against sandbox.

### Phase 7 — BizTrack integration go-live (2 wks)

- Provision BizTrack `apps/api` as a PayTrack merchant; add a `PaytrackModule` client in `apps/api`.
- **Online store:** replace COD-only checkout with live MoMo/OM (storefront + `OnlineOrdersService`); PayTrack webhook drives `OnlineOrder.paymentStatus` + the existing sale-record path.
- **In-store:** desktop/cloud "collect via MoMo" on a sale → PayTrack collection → `SalePayment` recorded with `paytrack:{id}` reference.
- **Subscriptions:** wire real paid-plan charges (the deferred `SubscriptionPayment`) through PayTrack.
- Retire the dead Campay types.
- Exit: a real BizTrack sale + online order + plan upgrade collected via PayTrack sandbox, then production once telco prod creds land.

### Phase 8 — Card & terminals (LATER, gated)

- Bluetooth card terminals (GIM-UEMOA/Visa/MC), card acquiring, PCI scope. Separate certification track; do **not** block Phases 0–7.

### Cross-cutting (every phase)

- **Security/compliance:** secrets in env only; provider creds encrypted at rest; PCI-avoidance by never touching PAN (cards deferred); full immutable audit trail; AML/KYC hooks on merchant onboarding; least-privilege service tokens between BizTrack↔PayTrack.
- **Observability:** structured logs w/ request-id, per-provider latency/error metrics, a reconciliation dashboard, alerting on stuck-PENDING payments and settlement variance.
- **Testing:** ledger-invariant unit tests (must always balance), provider-client contract tests against sandbox, idempotency/replay tests, chaos on webhook loss (poller must still settle).

---

## 5. Key risks & mitigations

| Risk                                        | Mitigation                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Telco prod onboarding slips (critical path) | Sandbox-first; apply day 1; pilot with a subset of merchants; keep COD fallback in the store until live. |
| Webhook loss / double-delivery              | Reconciliation poller + strict idempotency; webhook and poll converge on the same terminal state.        |
| Money bugs / float drift                    | Integer XAF ledger, balanced double-entry enforced in one txn, invariant tests, no client-trusted state. |
| Regulatory (COBAC/BEAC/AML)                 | Run under partner merchant agreements initially; legal workstream in parallel; KYC/AML hooks from day 1. |
| Scope creep (cards, multi-currency)         | Explicitly deferred (Phase 8 / non-goals).                                                               |

## 6. Open decisions to confirm before Phase 2

1. **Fee model** — who bears the PayTrack fee (merchant-absorbed vs payer-added), and default bps/fixed?
2. **Settlement cadence & reserve** — daily default? rolling reserve %? min payout threshold?
3. **Merchant identity** — is a PayTrack merchant always 1:1 with a BizTrack business at launch, or do we open standalone signups immediately (affects onboarding/KYC UI in Phase 1)?
4. **Domains** — `pay.paytrack.cm` (links/QR) + `api.paytrack.cm`? DNS/cert ownership.
5. **Refund policy** — full only (mirror current sale refunds) or partial at launch?

---

## 7. Scaffolding recipe — `apps/paytrack-api`

Mirror `apps/admin-api` (the minimal NestJS service), with these PayTrack specifics:

- **package.json:** `@biztrack/paytrack-api`, deps like admin-api **plus** `@nestjs/schedule`, `bullmq`, `ioredis`; consume `@biztrack/logger`, `@biztrack/types`, `@biztrack/utils`, `@biztrack/validators`. zod `^4`.
- **Config files:** `tsconfig.json` (extends root, `@/*` paths), `nest-cli.json`, `eslint.config.mjs` (from `@biztrack/eslint-config`), `jest.config.ts`, `.env.example`.
- **Bootstrap (`main.ts`):** global prefix `api`, URI versioning default `1`, CORS (env allowlist), `ValidationPipe({whitelist,forbidNonWhitelisted,transform})`, port `PAYTRACK_PORT=3004`, `trust proxy`.
- **`app.module.ts`:** `ConfigModule.forRoot({validate})`, `ScheduleModule`, `ThrottlerModule`, **own** `TypeOrmModule` datasource (`PAYTRACK_DATABASE_URL`, entities glob, **owns migrations**), Redis, BullMQ, JWT guard, response interceptor, exception filter, request-id middleware.
- **Config (`configuration.ts`):** Zod schema — `PAYTRACK_PORT`, `PAYTRACK_DATABASE_URL`, `REDIS_URL`, `PAYTRACK_JWT_*`, `PASSWORD_*`, `PAYTRACK_CORS_ORIGINS`, and provider creds: `MTN_MOMO_*` (subscription keys, API user/key, base URL, callback host, target env), `ORANGE_MONEY_*` (merchant key, client id/secret, base URL), `SETTLEMENT_*`.
- **DB:** own `data-source.ts`, **owns** `src/database/migrations/` (unlike admin-api). Copy `base.entity.ts`/transformers, response interceptor, request-id middleware, redis service, logger module, password-manager, public decorator from the existing services.
- **Monorepo wiring:** picked up automatically by turbo/pnpm workspaces; add `PAYTRACK_*` to `turbo.json` globalEnv; add a `.github/workflows/paytrack-api-deploy.yml` mirroring `api-deploy.yml` (separate Railway service, own env/secrets, `paths: apps/paytrack-api/**`).
- **First modules:** `health`, `paytrack-auth` (merchant dashboard), then the domain modules per phase (`ledger`, `merchants`, `payments`, `providers/{mtn,orange}`, `payouts`, `settlement`, `webhooks`, `developer`).

---

## 8. Immediate next steps

1. **Business/legal:** file MTN MoMo + Orange Money production/merchant applications and open the settlement account **today** (unblocks go-live weeks from now).
2. **Eng:** scaffold `apps/paytrack-api` (Phase 0) + land ledger primitives + MTN **sandbox** client stub.
3. Confirm the **§6 open decisions** (fees, settlement, merchant identity, domains, refunds) with product before Phase 2.
