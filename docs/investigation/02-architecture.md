# 02 — Architecture

All CONFIRMED unless marked. Citations as `file:line`.

---

## Stack & repo shape

- **Monorepo:** Turborepo + pnpm workspaces. `pnpm@11.9.0`, Node ≥22.13.0 (root `package.json`). Prettier (no semicolons, single quotes, trailing commas, printWidth 100), ESLint `@biztrack/eslint-config` at `--max-warnings 0`.
- **Primary apps:** `apps/api` (NestJS 10 + TypeORM + Postgres) and `apps/desktop-v2` (Electron + Vite + React). Others (`apps/web`, `apps/mobile`, `apps/storefront`, `apps/admin-*`) are out of scope for Specs 01–04. CI (`.github/workflows/ci.yml`) gates only `@biztrack/api...` and `@biztrack/desktop-v2...`.
- **Shared packages:** `packages/types` (shared types + the sync dependency graph), `packages/utils` (currency/date/phone/permissions), `packages/ui`, `packages/http-client`, `packages/templates` (HTML/PDF/email), `packages/electron-core` (SQLite + sync engine), `packages/logger`, `packages/theme`, `packages/validators`.

## Layering — honest assessment

There is a **domain/service layer** distinct from UI and persistence, but it is **duplicated across two runtimes** rather than shared:

- **Server:** NestJS modules under `apps/api/src/modules/<domain>/` — controllers (HTTP) → services (business rules) → TypeORM repositories. Business logic lives in services (e.g. `SalesService.computeSale`), not controllers. Consistent.
- **Desktop:** Electron main-process services under `apps/desktop-v2/src/main/services/<domain>.service.ts` — invoked over IPC from the React renderer, writing directly to SQLite + `sync_outbox`. These **re-implement the same domain rules** (e.g. a second `computeSale`) with explicit "mirrors the API so both tie out" comments.
- **Consequence:** the domain core is **not** a single shared package. Rules like line-total computation, expected-cash, ageing buckets, and daily-summary math exist **twice** (once per runtime) and are kept in parity **by convention and by comment**, not by shared code or shared tests. Any Spec 01–04 rule (rounding, expected-cash, pro-rata allocation) must be implemented and tested in **both** places. This is the single most important architectural fact for the specs.

`packages/types` + `packages/templates` are the only genuinely shared domain artifacts (types and report/HTML builders).

---

## How a sale is written today — end-to-end trace

The single most instructive path (Phase 0 #4). Two runtimes:

### Electron (offline-first) path

1. **UI event** — `/sell` (`Sell.tsx`): cashier adds a product; cart line built with `unitPrice = variant.priceOverride ?? product.sellingPrice` (`Sell.tsx:397,489`) — **price snapshotted at cart-add**. Discounts/charges added client-side (PERCENT/FIXED). Payment captured in `PaymentModal` (Cash/MTN/OM/Card/Deposit/Credit/Split).
2. **IPC → main service** — renderer calls `dataClient.sales.create(...)` → IPC → `apps/desktop-v2/src/main/services/sales.service.ts:createSale`.
3. **Compute + validate** — local `computeSale`: `lineTotal = round2(unitPrice*qty − discount)`, `subtotal = Σ lineTotal`, `totalAmount = round2(subtotal − saleDiscount + charges)`, `amountPaid = Σ payments`, `creditAmount = max(0, total − paid)` (`:200-253`). `soldAt = input.soldAt || new Date().toISOString()`; `sale_date = soldAt.slice(0,10)` — **UTC day** (`:104,326`).
4. **Local write** — inside one SQLite transaction: insert `sales` + `sale_items` (+ `sale_payments`, `sale_charges`, `sale_discounts`), deduct `inventory_levels`, write `inventory_movements` (`MovementType.SALE`), consume serial units, upsert `daily_sale_summaries`, materialize any `debts(RECEIVABLE)` for credit, best-effort `local_audit_logs.log('CREATE','sale')`.
5. **Outbox** — `enqueue('sale', saleId, 'UPSERT', payload)` into `sync_outbox` (same UUID as the row), then an `onMutated()` nudge (`categories.service.ts:45` pattern).
6. **Sync push** — `SyncService.push()` (`packages/electron-core/src/services/sync.service.ts`) batches ≤100 pending outbox rows in dependency-tier order, `POST /api/v1/sync/batches` (SyncTokenGuard). Per-op result: `applied`/`conflict` → delete outbox row; `deferred`/`failed` → retry with backoff; `dead` after 8 attempts.
7. **Server apply** — `SyncBatchesProcessor` (BullMQ) → `apps/api/src/modules/sync/sync.service.ts:processBatch` → per-entity applier upserts `sales`/`sale_items` in Postgres with LWW (`recordUpdatedAt <= existing.updatedAt` → `conflict/server_wins`). Server recomputes `sale_date`, updates `daily_sale_summaries`, emits `audit_logs('CREATE','sale')`. Socket.IO `sync.changes.available` fires.
8. **Pull** — other devices `GET /sync/pull?cursor=<iso>` get changed rows (cursor = `updated_at > since`).

### Cloud/browser path

Same renderer, but `dataClient.sales.create` → `POST /api/v1/sales` directly (`SalesController` → `SalesService.create`), which runs the **server** `computeSale` and writes Postgres in one transaction. No outbox; the API is the source of truth. **This is why the desktop↔API parity rule exists** (every local write needs a matching REST endpoint) — see `05-conventions`.

---

## 5.1 Offline & sync (deep)

- **Engine:** homegrown, no library (no WatermelonDB/PowerSync/Replicache/RxDB/Electric). Client `SyncService` in `packages/electron-core/src/services/sync.service.ts:407`; server `SyncService` in `apps/api/src/modules/sync/sync.service.ts:453`.
- **Model:** one cycle = `push()` then `pull()` (`electron-core sync.service.ts:461`). **Triggers:** 45 s interval (`DEFAULT_INTERVAL_MS = 45_000`), a per-write `onMutated()` nudge, and manual `retryFailed()`/`forceFullSync()`. Server-side Socket.IO realtime exists but is **"intentionally deferred" client-side** — desktop relies on interval + nudge.
- **Outbox:** table `sync_outbox` (`0001_initial_schema.ts:281`) — `id, entity, record_id, operation, payload, status, attempt_count, next_attempt_at, last_error`. **Coalesced:** unique `(entity, record_id)`; re-enqueue overwrites payload and resets to `pending`. Statuses `pending|deferred|failed|dead`; backoff 5 s→1 h, `MAX_PUSH_ATTEMPTS=8` → `dead` (manual retry only). Push limit 100/cycle.
- **Conflict resolution:** **Last-Writer-Wins by `updated_at`, per whole record** (not per-field, not CRDT, not event-log). Uniform across entities (`apps/api sync.service.ts:1658, 1774, …`); Postgres unique-violation also maps to `server_wins`. A pull never clobbers a local record with a non-terminal outbox row (`pendingLocalIds()`). Debts are keyed on a natural key `(business_id, source_type, source_id, direction)`, not id.
- **Append-only tables:** by **convention only**, no DB constraint. Tables without `updated_at` (`inventory_movements`, `sale_payments`, `sale_charges`, `sale_returns`, restock records/items) are pulled filtered by `created_at` with "append-only" comments (`apps/api sync.service.ts:988-1006`).
- **Late offline records:** **no date-based rejection.** An old offline record still applies (it's an insert; LWW only compares the same record's timestamps). Pull is cursor-based, not age-gated. → Directly relevant to Spec 04's late-arrival design: the sync engine will happily accept a sale dated into a closed period; the _rejection/redating_ must be a domain-layer rule, not a sync feature.
- **Client migrations across versions:** forward-only integer-id runner (`packages/electron-core/src/migrations/runner.ts`), files `00NN_name.ts` (currently to `0059`), `_migrations` table, each in a transaction, `up()` only (no `down()`), `ensureColumn()` for idempotent adds. A device offline across versions applies all missed migrations in order on next launch. No app-version gate.
- **Failure modes:** whole `sync()` in try/catch → `status.state='error'`, retried next interval; batch status polled `GET /sync/batches/:id` every 800 ms up to 30 s; server `recoverNonTerminalBatches()` re-reconciles stale batches; dead-letter rows need manual `retryFailed()`.
- **Dependency graph:** `SyncEntity` = **27** entities; `SYNC_ENTITY_DEPENDENCY_TIER` (tiers 0–3) + `SYNC_ENTITY_DEPENDENCIES` topological order drive **both** client push ordering and server processing (`sync.types.ts:84-197`).
- **Push set ≠ everything that reaches the device.** `SyncEntity` is the **outbox (device→server) push** set only. It contains **no `user`, `member`, or `role`.** Users, team members, and roles are delivered **pull-only** (server→device) inside the `ChangeSet` payload — `ChangeSet.teamMembers` / `.roles` (`sync.types.ts:698-699`), typed `TeamMemberSyncRecord` (`:596`) and `RoleSyncRecord` (`:608`). They are **read-only on the device with no offline write-up path.** Consequence for future work: identity/config data (PIN hashes, per-role discount policy, per-business settings) can be distributed _down_ via this pull channel but **cannot be created/edited offline** through the outbox — a device-originated change to any of them is online-only unless a new push path is built. (Config/settings pull itself is noted as deferred in the sync-engine plan — verify before relying on it.)

## 5.2 Data layer

- **Desktop:** `better-sqlite3` (synchronous), **raw SQL**, no ORM. Wrapper `DatabaseService` (WAL, `foreign_keys=ON`). Timestamps = TEXT ISO-8601; money = `REAL`.
- **Server:** PostgreSQL via **TypeORM**, migrations-only (no `synchronize`). Entities `apps/api/src/entities/*.entity.ts`; base classes `BaseEntity` / `ImmutableBaseEntity` (`apps/api/src/common/entities/base.entity.ts`).
- **Migrations:** two independent mechanisms — server TypeORM `<epochMillis>-Name.ts` with `up`/`down` (reversible); client `00NN_name.ts` forward-only. Authored as **pairs** (e.g. API `1784200000000` ↔ local `0059`).
- **Single source of truth?** **No.** SQLite and Postgres schemas are hand-authored separately and reconciled only through `packages/types` shapes + drift-tolerant appliers (`PRAGMA table_info` writes only existing columns) and ~20 hand-written column maps. No codegen, no shared DDL — a standing maintenance hazard to call out in every new-table story.

## 5.3 Auth, roles, permissions, PIN

- **Auth:** two-phase JWT (`type: 'phase1'|'phase2'|'sync'`) + a separate device **sync token** (`POST /sync/token`, hashed `SyncDeviceSession`, revocable, long-lived). Tokens held in Electron main (`TokenStore`), never exposed to the renderer.
- **Offline auth:** `offlineLogin(password)` compares against a locally cached **bcrypt** hash (`bcrypt.hash(pw,10)` at login, `bcrypt.compare` offline — `apps/desktop-v2/src/main/services/auth.service.ts:396`). Full password re-entry, **not a PIN**. "Daily-login" model.
- **PIN / passcode / quick-login / manager step-up / approval:** **DOES NOT EXIST** anywhere. The only `pin` tokens are audit **redaction keys** in `packages/utils/src/audit-diff.ts`. Reusable primitives for Specs 01/02: the local `bcrypt.compare` pattern and the `SpecialPermission` time-boxed grant shape.
- **Roles:** `BusinessMemberRole = OWNER, MANAGER, CASHIER, ACCOUNTANT, STAFF`; member status `ACTIVE, PENDING, SUSPENDED, REMOVED`. Custom roles via the `Role` entity (`isSystem`, `isOwnerRole`) with `permissions: string[]`.
- **Permission enforcement — asymmetric.** The real gate is **server-side**: `@RequireResource(Resource.X)` + `ResourceGuard` (403 `PLAN_UPGRADE_REQUIRED` + `requiredPlan`), backed by `PermissionsService.getEffectivePermissions` (Redis-cached) + `QuotaService`. **desktop-v2 has no local Resource gate** (the v1 `plan-access.ts` was removed); client gating is minimal/UI-only, and plan/quota violations on offline-created rows surface as per-op `failed` results at the sync push boundary.

## 5.4 Entitlements / plans / feature flags

- `SubscriptionPlan = FREE, SOLO, BUSINESS, PRO`; `SubscriptionStatus = TRIAL, ACTIVE, PAST_DUE, CANCELLED, SUSPENDED`; `BillingCycle = MONTHLY, ANNUAL` (`business.types.ts:51-69`).
- `Resource` enum — 50+ boolean flags (`permissions.types.ts:3-76`), incl. **forward-declared placeholders** for unbuilt features (`ONLINE_STORE_BUILDER`, `CUSTOM_ROLES`, `API_ACCESS`, `BRANCHES_MULTI`). `DEFAULT_PLAN_RESOURCES` maps plan→resources; `DEFAULT_PLAN_QUOTAS` maps numeric quotas (`products`, `contacts`, `categories`, `users`).
- **Reaches the client** as `AuthPermissions { plan, effectivePermissions, specialPermissions, permissionsIssuedAt, permissionsExpiresAt }` inside auth/plan responses. Offline: SQLite `plan_state_cache` (`selected_plan`, `effective_plan`, `subscription_status`, `stale_after`). Time-boxed — after `permissionsExpiresAt` the client "must fall back to FREE semantics if it cannot revalidate."
- **Signed vs trusted:** entitlement is **trusted server-issued JSON with an expiry**, **not** an independently verifiable signed license. `SpecialPermission { resource, grantedAt, expiresAt, grantedBy, reason, isRevocation }` is a per-business override channel.
- **Module gating today:** server-side only — `@RequireResource` gates whole controllers (live example: `ONLINE_STORE` gates the store, PRO-only builder/domain). No reusable **client-side** module-gate helper exists in desktop-v2. → Spec 04's "one ledger, many modules, entitlement-gated feature surface" matches the server pattern; its **signed token** and **offline client gate** are the new pieces.

---

## Notifications, realtime, background jobs (context for Spec 03)

- **`NotificationsModule` (`apps/api`)** — real multi-channel: `EMAIL` (Resend), `WHATSAPP` (WAHA), `SMS` (currently routed through WAHA as a placeholder until a real SMS contract), `IN_APP`. `NotificationType = INVITE, OTP, PAYMENT_REMINDER, MARKETING`. **`PAYMENT_REMINDER` exists but is not wired to debts.** No push (FCM/APNs).
- **Background jobs:** BullMQ + Redis server-side, cron via repeatable jobs (`inventory-alerts.scheduler` daily 08:00 `Africa/Douala`; `subscriptions.scheduler`). **No client-side scheduler** — desktop main runs only sync + IPC services.
- **In-app bell + realtime:** `NotificationItem` feed types + `RealtimeService` (app-wide Socket.IO publisher) are fairly built (`notifications.service.ts`), matching the "in-app bell in progress" state.
- **Templating:** `packages/templates` produces HTML/PDF (receipts, PO, RFQ, reports, `order-status-email`). SMS/WhatsApp bodies are assembled as plain strings; short i18n strings come from `apps/api/src/i18n/{en,fr}/notifications.json`.
