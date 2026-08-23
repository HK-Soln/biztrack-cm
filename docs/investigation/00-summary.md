# 00 — Executive Summary

**Investigation of the BizTrack CM codebase** to replace every invented name/concept in Specs 01–04 with a fact from this repository, so an implementation handoff can be written from these documents alone.

Method: six parallel read-only agents swept money, sales, payments, receivables/payables, audit, cash/inventory/reporting, sync/auth/plans, dates/i18n/notifications, and conventions — each citing `file:line`. The four specs themselves were located in-repo at `plans/` (spec-01, spec-02, spec-04; **spec-03 is not in the repo** and was analysed from the investigation brief's description).

Deliverables in this folder: `01-glossary.md`, `02-architecture.md`, `03-domain-inventory.md`, `04-gap-analysis.md`, `05-conventions.md`, `06-jira-seed.md`, `07-open-questions.md`. **Location choice:** `docs/investigation/` — the repo keeps all working docs under `docs/` (86 files incl. `docs/database/`, `docs/modules/`), so this sits with existing architecture notes.

---

## Stack, in one paragraph

Turborepo + pnpm (`pnpm@11.9.0`, Node ≥22.13.0) monorepo. Two primary targets: **`apps/api`** (NestJS 10 + TypeORM + PostgreSQL, migrations-only, BullMQ/Redis, Socket.IO, `/api/v1` REST) and **`apps/desktop-v2`** (Electron + Vite + React; the _only_ desktop app — v1 `apps/desktop` was removed). Desktop persistence is **local-first SQLite via `better-sqlite3`** in `packages/electron-core`, which also houses a **homegrown offline sync engine** (outbox push + cursor pull, no third-party sync library). Shared code: `packages/types` (27-entity sync graph, all cross-app enums), `packages/utils`, `packages/ui`, `packages/templates` (HTML/PDF). The same React renderer runs in Electron (IPC → SQLite) and as a cloud/browser build (HTTP → API).

---

## The 10 findings that most affect Specs 01–04

1. **Money is not integer XAF — and the two layers disagree.** Postgres stores money as `decimal/numeric(12,2)`; desktop SQLite stores it as **`REAL` (IEEE-754 float)**; product **variant** overrides are `int` on both. In-code type is plain `number`. Rounding is duplicated (`roundMoney` API / `round2` desktop), with no shared helper, at 2 decimals on a 0-decimal currency. **Every spec's `*_xaf INTEGER`, "no floats anywhere" premise is false today.** This is the loudest finding and a prerequisite for Specs 01–02. (`04-gap-analysis`, `03-domain-inventory §6.1`.)

2. **Discounts already exist — richly — under different names.** Spec 01 invents a `sale_discounts` table that **already exists** (`SaleDiscount`, different schema), plus `sale_items.discountAmount`, sale-level `SaleCharge`, variant `price_override`, and a manual-price path that flows through with a `priceDriftWarning` >10% flag. Spec 01 must **extend**, not create. (`04-gap-analysis §Spec 01`.)

3. **The audit trail exists but is thin, unenforced, and doubled.** Server `audit_logs` (`AuditLog`) covers only ~8 write paths and **emits nothing for debts, payments, expenses, auth, roles, or plan changes**. Append-only is **convention only — no DB constraint**. A **more active** desktop `local_audit_logs` exists but doesn't sync to the server and no UI reads it. Verdict: **extend `audit_logs`, don't build `audit_events`** — but hardening (DB-level append-only), coverage, the desktop→server bridge, and a UI are real work. (`03-domain-inventory §6.6`.)

4. **Cash sessions / till / shift / float / owner-draw are entirely greenfield.** No entity, column, or IPC channel exists (roadmap-only in `apps/web`). `Role` has no `tracksCashDrawer`. Spec 02 Part A builds from zero. The nearest analogue is the materialized `daily_sale_summaries` rollup (per-day cash/momo/card/credit collected) — but it is **not** reconciled against a counted drawer.

5. **No PIN, no manager step-up, no approval flow anywhere.** Offline auth is a **full bcrypt password re-entry**, not a PIN. Specs 01 and 02 both hinge on offline manager-PIN authorization — greenfield. Reusable primitives: `offlineLogin`'s local `bcrypt.compare` and the `SpecialPermission` time-boxed-grant shape. (`02-architecture §5.3`.)

6. **No accounting-period / business-day model, and the date foundation is UTC with a trap.** A sale's day is the **UTC** calendar date of `soldAt` (`toISOString().slice(0,10)` → stored `sale_date`), used identically by desktop and server so they reconcile. But `packages/utils/src/date.ts` day helpers are **local-time**, disagreeing for late-evening Douala (UTC+1) sales. No fiscal year / period / close / lock exists. Spec 04's shift-derived `business_date` and dual `transaction_date`/`posting_date` are entirely new. (`03-domain-inventory §6.11`.)

7. **Two divergent "profit" definitions already ship.** The `daily_sale_summaries` gross profit uses `sale.total_amount` (includes sale-level charges, net of all discounts) as revenue; the Income-Statement (`cr`) report uses `Σ sale_items.line_total` (net of line discounts only). Same snapshot COGS, **different revenue base** → they diverge on any sale with sale-level discounts/charges. Spec 03's digest leads with a profit number and must pick one and reconcile. (`03-domain-inventory §6.9`.)

8. **Receivables and payables are already one unified `debts` table** (`direction` discriminator), with a computed running balance, `created_at`-based ageing (not `due_date`), and **no lettrage** (payment→invoice allocation). No credit limit. `due_date` exists but is passive. Spec 03 Part B extends a real, shared abstraction — good — but there's a **parallel `restock_payments` double-representation** of supplier credit to be aware of. (`03-domain-inventory §6.4/6.5`.)

9. **Sync is homegrown, Last-Writer-Wins, and never rejects stale offline records.** Push (outbox, coalesced, backoff→dead-letter) then cursor pull; conflict = LWW by `updated_at` per record; **no date-based rejection** of a record synced days late. Append-only tables are enforced by _convention_ (absence of `updated_at` → filtered by `created_at`), not DB constraints. **Client and server schemas are authored separately** (no single source of truth) and reconciled by drift-tolerant appliers — a standing hazard for any new synced table. This directly shapes Spec 04's late-arrival design and Spec 02's append-only guarantees. (`02-architecture §5.1`.)

10. **Plan/entitlement machinery exists and can gate modules server-side; the client gate does not.** `SubscriptionPlan FREE|SOLO|BUSINESS|PRO`, a 50+-flag `Resource` enum (incl. forward-declared `BRANCHES_MULTI`), `@RequireResource` + `ResourceGuard` (e.g. `ONLINE_STORE` gates the store). Entitlements reach the client as **trusted JSON** (`permissionsExpiresAt`, `plan_state_cache`), **not a signed token**. Spec 04's module architecture aligns with the server pattern; its **signed** entitlement token and a **client-side** module gate are the new pieces. (`02-architecture §5.4`.)

---

## Top risks (ranked)

- **R1 — Money migration is a prerequisite, not a step.** Specs 01–02 arithmetic (percent discounts, pro-rata cart allocation, per-tender variance) on top of SQLite floats + duplicated 2-dp rounding will produce reconciliation drift. A shared integer-XAF money helper + storage decision must land **before** discount/cash work, or the specs' own acceptance criteria ("Σ line discounts === cart discount, integer-equal") cannot pass. Blast radius: every money path, every report, the sync parity contract.
- **R2 — Duplicate-concept collisions are one careless `CREATE TABLE` away.** `sale_discounts` and `audit_events` are the live traps (see `01-glossary §5`). The whole point of this investigation is to stop a second table appearing beside a real one.
- **R3 — Zero automated tests on the local-first write path.** `apps/desktop-v2` + `packages/electron-core` have **no** Jest/vitest tests (only ad-hoc `*.smoke.ts`). All SQLite money/stock/outbox logic — exactly where Specs 01–02 land — ships untested by CI. Any change here is unguarded.
- **R4 — Append-only is a promise, not a constraint.** Spec 02 §B4 requires "no API path updates/deletes an audit event, enforced with a DB grant." Today nothing prevents a raw `UPDATE`/`DELETE` on `audit_logs` or `debt_payments` (and `deletePayment` in fact deletes). Trust in reconciliation depends on closing this.
- **R5 — Schema drift between client and server.** No single schema source of truth; ~20 hand-maintained column maps + PRAGMA-introspecting appliers. Every new table in Specs 01–04 must be authored twice (Postgres migration + SQLite migration) and wired into the sync graph, or it silently won't sync.
- **R6 — The UTC vs local-time date split** will surface as "yesterday's late sales in today's totals" once Spec 04 introduces shift-derived business days. Decide the day-boundary source deliberately.

---

## Recommended sequencing (detail in `06-jira-seed`)

**Epic 0 (prerequisite): Integer-XAF money foundation** → then **Spec 01 (Discounts, extending existing tables)** → **Spec 02 (Cash Sessions + Audit hardening)** → **Spec 03 (Digest/Receivables/Alerts, mostly reads over existing data)** in parallel where it only reads → **Spec 04 (Periods + Module architecture)** last, since it depends on Spec 02's business-day boundary. Spec 03's stock-alert and ageing pieces are **already partly built** and can ship early.
