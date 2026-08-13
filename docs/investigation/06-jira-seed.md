# 06 — Jira Seed (proposed structure — nothing created in Jira)

Epics, stories, dependencies. Acceptance criteria are rewritten against **real entity names**. Estimates S/M/L with reasoning. Sequence + parallelism at the end.

> Two conventions: (a) "dual migration" = a Postgres `<epoch>-Name.ts` **and** a SQLite `00NN_*.ts` + `sync.types.ts` registration; (b) "both runtimes" = implement + test in `apps/api` **and** `apps/desktop-v2/src/main/services`.

---

## EPIC 0 — Integer-XAF money foundation _(prerequisite, not in any spec)_

**Why:** money is `decimal(12,2)` on server, `REAL` float on desktop, `int` for variants; rounding is duplicated. Specs 01–02 arithmetic and their acceptance tests ("no `parseFloat`/`toFixed` on money paths"; "Σ line discounts === cart discount, integer-equal") cannot pass on this base.

- **BIZ-0.1 — Shared money helper in `packages/utils`.** `roundXaf(amount, unit ∈ {1,5,25,50,100})`, integer-XAF arithmetic, formatting separated from calculation. AC: single helper consumed by both `sales.service.ts` files; existing `roundMoney`/`round2` deleted. Files: `packages/utils/src/currency.ts`, both `sales.service.ts`. Depends on: —. Est: **M**. Risk: touching rounding shifts historical totals — snapshot-compare before/after.
- **BIZ-0.2 — Decide + migrate money storage to integer XAF.** SQLite `REAL`→`INTEGER`; reconcile Postgres `decimal(12,2)` vs variant `int`. AC: all money columns one representation; parity tests tie out desktop↔API. Files: dual migrations across sales/debts/expenses/inventory. Depends on: BIZ-0.1. Est: **L**. Risk: highest blast radius in the repo; do behind a data-migration + verification job.
- **BIZ-0.3 — Desktop test harness.** Stand up a runner (jest/vitest) for `electron-core` + desktop services. AC: expected-cash/rounding/allocation unit-testable offline. Depends on: —. Est: **M**. Risk: `better-sqlite3` native rebuild in CI (pattern exists in desktop-v2 postinstall).

---

## EPIC 1 — Discounts & Price Overrides (Spec 01)

- **BIZ-1.1 — Extend `sale_items` with discount/override columns.** Add `unit_price_listed`, `cart_discount_alloc` (charged price already = `unitPrice`; cost snapshot already = `costPrice`). AC: listed price snapshotted at sale-add, never re-read; `lineTotal = unitPriceCharged*qty − cartDiscountAlloc`. Files: dual migration + both `computeSale`. Depends on: BIZ-0.1. Est: **M**. Risk: sync-graph registration for new columns.
- **BIZ-1.2 — Reconcile the existing `sale_discounts` table (NO new table).** Extend `SaleDiscount`/`sale_discounts`: add `scope (LINE|CART)`, widen type to PERCENT/AMOUNT/OVERRIDE/ROUNDING/DAMAGE/STAFF (align with existing `PERCENTAGE|FIXED_AMOUNT`), `reason_code`, `applied_by`, `authorized_by`, `unauthorized`, `below_cost`, `computed_xaf`. AC: no `CREATE TABLE sale_discounts`; `Σ sale_discounts.computed_xaf === cartGross − cartNet` integer-equal. Files: `sale-discount.entity.ts`, dual migration. Depends on: BIZ-0.1, BIZ-1.1. Est: **L**. Risk: **name collision** — this is the #1 duplicate-concept trap.
- **BIZ-1.3 — Cart-level discount + pro-rata allocation with remainder-to-largest-line.** AC: allocation sums to the cart discount with zero remainder; passes 3.33%/7-lines/prices-ending-in-5. Files: both `computeSale`. Depends on: BIZ-1.1, BIZ-0.1. Est: **M**.
- **BIZ-1.4 — Role discount limits (`discount_policy`) + BLOCK/APPROVE + `unauthorized` flag.** AC: over-limit with BLOCK can't complete without PIN; with APPROVE completes flagged `unauthorized=1`. Depends on: BIZ-3.x (PIN). Est: **M**.
- **BIZ-1.5 — Margin floor using the existing cost basis.** AC: `unitPriceCharged < costExpr()` requires authorization unless `allowBelowCost`; cost never shown to `CASHIER`; null cost skips silently. Files: reuse `stock-stats.ts costExpr`. Depends on: BIZ-3.x. Est: **M**. Risk: do **not** invent a weighted-average `lastCostPriceXaf`.
- **BIZ-1.6 — POS UX (price-tap keypad, chips, receipt listed→net) + PIN modal.** Depends on: BIZ-1.2, BIZ-3.x. Est: **L**.
- **BIZ-1.7 — Discount reports (summary, by cashier, by product, unauthorized/below-cost, margin-after).** Files: `report-builders.ts`, `reports/registry.ts`. Depends on: BIZ-1.2. Est: **M**.
- **BIZ-1.8 — Integration: void/refund/split-tender/credit at discounted total.** AC: refund returns discounted price; expected-cash uses discounted totals. Depends on: BIZ-1.3, Epic 2. Est: **M**.

---

## EPIC 2 — Cash Sessions & Audit Trail (Spec 02)

### Part A

- **BIZ-2.1 — `cash_sessions` + `cash_count_lines` + state machine.** States OPEN/COUNTING/CLOSED/RECONCILED/ABANDONED; nullable `outlet_id` (unused). AC: closed sessions immutable by any role incl. Owner. Files: dual migration + sync registration; name `cashSession` (avoid auth-session collision). Depends on: BIZ-0.x. Est: **L**.
- **BIZ-2.2 — Expected-cash calculator (domain core, both runtimes, unit-tested).** `float + Σ cash tenders after discounts + Σ IN − Σ OUT`. AC: heavy-discount shift shows zero variance when drawer correct. Depends on: BIZ-2.1, BIZ-1.3, BIZ-0.3. Est: **M**. Risk: the #1 integration bug (discounts-before-expected-cash).
- **BIZ-2.3 — `cash_movements` incl. EXPENSE→linked expense, OWNER_DRAW≠expense.** AC: SUPPLIER_PAYMENT appears in both shift reconciliation and P&L; OWNER_DRAW absent from P&L. Files: new table + `expenses` link column. Depends on: BIZ-2.1. Est: **M**.
- **BIZ-2.4 — Open/close UI: denomination grid + blind count.** AC: expected total not reachable in UI before submission; one re-count logged. Depends on: BIZ-2.2. Est: **L**.
- **BIZ-2.5 — Abandoned-session recovery** (client launch resume/close + server >72h ABANDONED job). Depends on: BIZ-2.1. Est: **M**.
- **BIZ-2.6 — Variance handling + per-cashier history + Z/X/daily reports** (reconcile with `daily_sale_summaries`, WhatsApp share). Depends on: BIZ-2.2. Est: **M**.

### Part B

- **BIZ-2.7 — Extend `audit_logs` (NO `audit_events` table).** Add `device_time`, `server_time`, `amount_xaf`, `shift_id`; map new events to `action`+`entity_type` (TS union — no enum migration). AC: no `CREATE TABLE audit_events`. Depends on: —. Est: **M**. Risk: name-collision trap.
- **BIZ-2.8 — DB-level append-only enforcement.** Trigger / `REVOKE UPDATE,DELETE` on `audit_logs` (+ `debt_payments`, `sale_payments`). AC: no API path updates/deletes an audit row; raw UPDATE rejected. Depends on: BIZ-2.7. Est: **M**.
- **BIZ-2.9 — Broaden emit coverage + device-time flagging.** Wire SALE*LINE_REMOVED, PRICE_CHANGED, STOCK_ADJUSTED, CASH_MOVEMENT, SHIFT*\*, PIN_FAILED, USER_ROLE_CHANGED, RECEIPT_REPRINTED, DEVICE_TIME_CHANGED; monotonic sequence. Depends on: BIZ-2.7. Est: **L**.
- **BIZ-2.10 — Desktop→server audit sync + 90-day prune + actor-type mapping.** AC: `local_audit_logs.synced_at` populated; local pruned; server retains all. Depends on: BIZ-2.7. Est: **M**.
- **BIZ-2.11 — "Activité" owner screen** on the already-wired `client.audit.list` (filter cashier/day, red high-signal items, per-cashier risk summary). Depends on: BIZ-2.9. Est: **L**.

---

## EPIC 3 — Offline PIN & Manager Authorization _(shared by Specs 01 & 02)_

- **BIZ-3.1 — PIN credential on the synced user record** (hash on device, `pinVersion`, never send the PIN for the check). Reuse the `offlineLogin` local-hash pattern. AC: PIN verifies fully offline (airplane-mode). Est: **L**. Risk: greenfield security surface — see `07-open-questions`.
- **BIZ-3.2 — Manager step-up flow** (modal PIN pad, no logout; rate-limit 5→lockout logged as PIN_FAILED; 30-day stale-sync cutoff). Depends on: BIZ-3.1, BIZ-2.7. Est: **M**.

---

## EPIC 4 — Owner Digest · Receivables · Stock Alerts (Spec 03) _(spec not in repo)_

- **BIZ-4.1 — Canonical profit definition + reconciliation.** Decide daily-summary vs P&L basis; document; make the digest use it. AC: digest profit === chosen report. Est: **M**. Risk: a decision (see `07-open-questions`).
- **BIZ-4.2 — Scheduled owner digest** (server BullMQ cron over synced data; email/WhatsApp/in-app). Depends on: BIZ-4.1. Est: **M**.
- **BIZ-4.3 — Wire `PAYMENT_REMINDER` to debts** + due-date reminder job. AC: reuses existing `NotificationType.PAYMENT_REMINDER` + WhatsApp provider. Est: **M**.
- **BIZ-4.4 — Receivables/payables digest widgets** over existing `debts` + `getAgeingReport`; guard against `restock_payments` double-count. Est: **S**.
- **BIZ-4.5 — Stock-alert surfacing** (largely done — `getAlerts` + `low-stock`); ship early. Est: **S**.

---

## EPIC 5 — Accounting Periods & Module Architecture (Spec 04)

- **BIZ-5.1 — `business_date` on every transaction, shift-derived.** Depends on: Epic 2 (shifts). Est: **M**.
- **BIZ-5.2 — `fiscal_years` + `accounting_periods` + state machine** (crash-safe CLOSING→OPEN). Est: **M**.
- **BIZ-5.3 — Idempotent (empty) close pipeline** + DB unique `(step_id, period_id, run_version)` + close snapshot + verify job. Est: **M**.
- **BIZ-5.4 — Dual `transaction_date`/`posting_date` + late-arrival redating** as a **domain apply-time rule** (sync already accepts stale records). AC: sale dated into a closed period is accepted, posted to earliest open period, flagged; operational reports use `transaction_date`, financial use `posting_date`. Est: **L**. Risk: highest-risk design in Spec 04.
- **BIZ-5.5 — Module registration framework** over the existing `@RequireResource` gating (posting rules, close steps, required accounts, reports, nav, vocabulary). Est: **L**.
- **BIZ-5.6 — Signed entitlement token** + local public-key verifier + grace period (extend `AuthPermissions` + `plan_state_cache`). Est: **M**.
- **BIZ-5.7 — Business profiles + profile-aware vocabulary** (profile axis in the single `useT()`; `profile` business setting; micro never sees "période"). Est: **M**.
- **BIZ-5.8 — Add nullable `currency_code` + `outlet_id` to transactions** (cheap now, unrecoverable later; keep product at micro→SME). Est: **S**.

---

## Dependency-ordered sequence

1. **Epic 0** (BIZ-0.1 → 0.2; 0.3 in parallel) — money + desktop tests. _Blocks Epics 1–2._
2. **Epic 3** (PIN) — can start in parallel with Epic 0; _blocks BIZ-1.4/1.5/1.6 and BIZ-2.x step-up._
3. **Epic 1** (Discounts) — after Epic 0; BIZ-1.7 (reports) parallel once BIZ-1.2 lands.
4. **Epic 2** (Cash + Audit) — Part B (BIZ-2.7/2.8) can run **in parallel with Epic 1** (independent of money). Part A after BIZ-1.3 (discounted expected-cash).
5. **Epic 4** (Digest/Receivables/Alerts) — BIZ-4.4/4.5 can ship **early** (existing data); BIZ-4.1/4.2 after a profit decision.
6. **Epic 5** (Periods/Modules) — **last**; BIZ-5.1 needs Epic 2 shifts. BIZ-5.8 (columns) can land anytime cheaply.

**Parallelizable now:** BIZ-0.3 (test harness), BIZ-2.7/2.8 (audit hardening), BIZ-4.5 (stock alerts), BIZ-5.8 (nullable columns), Epic 3 (PIN) — none depend on the money migration.
