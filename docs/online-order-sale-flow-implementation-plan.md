# Online Order → Sale Flow: Phased Implementation Plan

**Companion to:** `online-order-sale-flow-redesign.md` (the design). This is the build plan.
**Principle:** each phase is independently shippable and reversible. Phases 0–1 carry **no user-visible behaviour change** — they add schema + primitives behind the existing flow, de-risking the Phase 2 cutover.

---

## Guiding constraints (apply to every phase)

- **Server-authoritative money.** Online orders are online-only; all financial mutations happen on the API. Desktop is a **synced reader** — it never writes online-order sales locally. (In-store sales keep their existing local-write path untouched.)
- **Sale is the sync aggregate.** `sale_charges`, `sale_payments`, `sale_returns` are children. Any financial mutation bumps the sale's `updatedAt`; the pull path re-emits the whole sale with current child arrays; desktop **replaces** child rows on upsert. No independent per-child sync entities.
- **Desktop↔API parity.** Every new API write that desktop must reflect needs a sync path (column map + dependency-ordered apply), per the parity rule.
- **Migrations-only.** API: TypeORM migration in `apps/api/src/database/migrations/`. Desktop: new numbered migration in `packages/electron-core/src/migrations/` using `ensureColumn` / `CREATE TABLE` (precedent: `0008_sale_preorder_link.ts`). Never edit `0001_initial_schema.ts`.
- **Feature flag.** Gate the Phase 2 behaviour change behind a per-business/server flag (`ONLINE_SALE_AT_CONFIRM`) so it can ship dark and roll back without a redeploy.
- **Always** `git checkout -- apps/api/src/generated/i18n.generated.ts` before staging.

### Key files (verified)

- API online orders: `apps/api/src/modules/online/online-orders.service.ts` (`updateStatus`, `updatePayment`, `createSaleForOrder`, `assignSerialUnits`, `releaseReservedSerials`).
- API sales: `apps/api/src/modules/sales/services/sales.service.ts` (`createFromSync`, `void`; **no** `recordPayment` yet).
- API sync: `apps/api/src/modules/sync/sync.service.ts` + `sync.controller.ts` (pull-with-cursor, `changes` payload keyed by `SyncEntity`).
- Desktop sync apply: `packages/electron-core/src/services/sync.service.ts` — `applyGeneric(table, record, map)` + per-entity column maps + dependency-ordered `pushAll` (sales at ~L690).
- Shared: `packages/types/src/online.types.ts`; `SyncEntity` + `SYNC_ENTITY_DEPENDENCY_TIER` + `SYNC_ENTITY_STABLE_ORDER` (packages/types).
- Entities: `apps/api/src/entities/{sale,sale-payment,sale-item,online-order}.entity.ts`.

---

## Phase 0 — Schema & links (ships dark, no behaviour change) — ✅ IMPLEMENTED

**Goal:** every table/column/type the new flow needs exists and syncs, with historical data backfilled. Nothing reads the new fields yet.

> **Deviations found during build (design corrected):**
>
> - **Sale charges already exist end-to-end.** `SaleCharge` entity + `sale_charges` table (API migration `1779000000000`, desktop `0009_charge_types`), persisted in `createFromSync`/`createSale`, with `SaleSyncChargeLinePayload`/`CreateSaleChargeRequest` already in shared types. So fees **reuse `SaleCharge`** (name + `rateType`/`amount`); the design's proposed new `SaleChargeType` enum + parallel table are **dropped**.
> - **Sale children are pull-only, not `SyncEntity` push entities.** `saleItems`/`salePayments`/`saleCharges`/`saleReturns` are emitted in the pull `ChangeSet` and applied via `applyGeneric` column maps — they are **not** added to `SyncEntity`/tiers (P0.1's registration point was wrong).
> - **The real gap was the pull path:** the API pull emitted no charges, so server-side (online) sale charges never reached desktop. Phase 0 adds `saleCharges` (+ `saleReturns`/`saleReturnItems`) to the pull + desktop apply.
>
> **Shipped:** `Sale.source`/`onlineOrderId`; `OnlineOrder` fee breakdown; `sale_payments.kind`/`recordedAt`/`recordedById`/`note`; `sale_returns`/`sale_return_items` (API entities + desktop tables); pull emit + desktop apply for `saleCharges`/`saleReturns`/`saleReturnItems`; `PARTIALLY_PAID`; `SaleSource`/`SalePaymentKind` enums; backfill (`source=ONLINE` + `online_order_id` from `client_id` join; `online_orders.subtotal`). API migration `1783200000000`, desktop migration `0050`. Typecheck clean across types/api/electron-core/desktop-v2; brands unit test green.

### Tasks

- **P0.1 Shared types** (`packages/types`)
  - `SaleSource = 'IN_STORE' | 'ONLINE'`; `SaleChargeType = 'DELIVERY' | 'COD' | 'SERVICE' | 'OTHER'`.
  - `SaleCharge`, `SaleReturn`, `SaleReturnItem` interfaces.
  - Extend `OnlineOrder`: `subtotal`, `deliveryFee`, `codFee`, `otherCharges`.
  - Extend `SaleSyncPayload`: `source`, `onlineOrderId`, `charges[]`, `returns[]`; allow `payments[]` entries to carry `kind: 'PAYMENT' | 'REFUND'` (or signed amount).
  - Add `PARTIALLY_PAID` to `OnlinePaymentStatus` (pending §9 decision — safe to add the value now).
  - Register new sync entities: `saleCharges`, `saleReturns`, `saleReturnItems` in `SyncEntity` + tiers (`saleCharges`/`saleReturns` after `sales` tier; `saleReturnItems` after `saleReturns`) + `SYNC_ENTITY_STABLE_ORDER`.
- **P0.2 API entities + migration**
  - `sale.entity.ts`: add `source` (default `IN_STORE`), `onlineOrderId` (uuid nullable, indexed, FK → `online_orders`, `ON DELETE SET NULL`). Keep scalar `chargesAmount`.
  - New `sale-charge.entity.ts` (`saleId`, `businessId`, `type`, `label`, `amount`).
  - New `sale-return.entity.ts` + `sale-return-item.entity.ts`.
  - `sale-payment.entity.ts`: add `kind` + `recordedAt`, `recordedById`, `note` (append-only preserved).
  - `online-order.entity.ts`: add `subtotal`, `deliveryFee`, `codFee`, `otherCharges`.
  - **Migration + backfill:** `sales.source = 'ONLINE'`, `sales.online_order_id = online_orders.id` where `sales.client_id = online_orders.id`; `online_orders.subtotal = totalAmount - COALESCE(deliveryFee,0)` for history; existing sales get `source='IN_STORE'`.
- **P0.3 API sync emit**
  - Pull query includes new entities in `changes`; sale pull re-emits `charges`/`returns` arrays alongside `payments`. Bump sale `updatedAt` participates in cursor.
- **P0.4 Desktop migration + apply**
  - New migration: `ensureColumn(sales, source)`, `ensureColumn(sales, online_order_id)`; `ensureColumn(sale_payments, kind/recorded_at/recorded_by/note)`; `CREATE TABLE sale_charges`, `sale_returns`, `sale_return_items`.
  - `sync.service.ts`: add `SALE_CHARGE_MAP`, `SALE_RETURN_MAP`, `SALE_RETURN_ITEM_MAP`; `pushAll(changes.saleCharges, …)` etc. in dependency order (after `sales`/`saleItems`); add `online_order_id`/`source` to `SALE_MAP`.

### Tests / acceptance

- API + desktop typecheck clean; both migrations run forward on a seeded DB.
- Backfill unit test: a historical completed online order → its sale now has `source='ONLINE'` + `onlineOrderId`.
- Sync round-trip test: a sale with a `sale_charges` row pulls to desktop and lands in `sale_charges` (empty in practice this phase, but path proven).
- **No behaviour change**: existing confirm/complete/return flow byte-identical.

**Rollback:** columns/tables are additive and nullable; drop-column migration if needed. Nothing reads them.

---

## Phase 1 — Ledger primitives (API, tested, not wired to orders) — ✅ IMPLEMENTED

**Goal:** `recordPayment`, `refund`, and typed-charge writes exist and are unit-tested via direct calls, but the online-order flow still uses the old `createSaleForOrder`. Reusable by in-store later.

> **Shipped:**
>
> - `SalesService.recordPayment(id, businessId, user, input)` — appends a signed `PAYMENT` row (idempotent by payment id), recomputes `amountPaid`/`creditAmount` from the ledger, and settles any open receivable.
> - `SalesService.refund(id, businessId, user, input)` — full or partial; appends a signed `REFUND` row (capped at `amountPaid`, fees excluded by default), writes `sale_returns` + `sale_return_items`, optionally restocks inventory + releases serials, sets `REFUNDED`/`PARTIALLY_REFUNDED`, and writes off the receivable on a full return.
> - `SalesService.recomputeSaleSettlement` — the signed-ledger core (`Σ(PAYMENT) − Σ(REFUND)`, clamped), with 6 unit tests (partial/paid/refund/over-refund/overpay/kindless).
> - `DebtsService.settleSourcePayment(manager, …)` — manager-composable receivable settlement by `(sourceType, sourceId)`, capped at outstanding.
> - **P1.1 was already done** (createFromSync persists `payload.charges`). **P1.5 replace-on-upsert** is unnecessary: ledger children are append-only, so Phase 0's upsert-by-id converges.
> - Typecheck clean (api); 22 sales unit tests green. Not wired to the order flow yet (Phase 2). Daily-summary reconciliation for refunds deferred to Phase 3/4.

### Tasks (all in `sales.service.ts` unless noted)

- **P1.1 Typed charges on create.** In `createFromSync`, write `sale_charges` rows from a new `charges[]` on the payload; ensure `Σ charges.amount == chargesAmount`. (No caller passes charges yet.)
- **P1.2 `recordPayment(saleId, businessId, { id, method, amount, reference, kind })`.**
  - Append a `sale_payments` row (idempotent by `id`); recompute `amountPaid = Σ signed payments`, `creditAmount = max(0, total − amountPaid)`; update `status` if fully paid; reduce/settle linked receivable via `debtsService`.
  - Reject overpayment beyond `total` (or clamp + `changeGiven`, per decision).
  - Bump sale `updatedAt` → re-sync aggregate.
- **P1.3 `refund(saleId, businessId, { items?, amount?, restock, reason, actorId })`.**
  - Append a **negative/`REFUND`** `sale_payments` row; write `sale_returns` (+ items); set `status` `REFUNDED`/`PARTIALLY_REFUNDED`.
  - If `restock`: `inventoryService.reverseForVoidedSale`-style restore for the returned lines + serials → `IN_STOCK` (or `QUARANTINE`).
  - Default refund target = goods portion (fees non-refundable) unless overridden.
- **P1.4 Aggregate emit.** Ensure `recordPayment`/`refund`/`void` all bump `updatedAt` and the pull path serializes current `payments`+`charges`+`returns`.
- **P1.5 Desktop apply.** Replace-on-upsert semantics for child arrays (delete existing children for the sale, insert incoming) so appended/negative rows converge.

### Tests / acceptance

- Unit: partial payment → `PARTIALLY_PAID` math; full payment settles receivable; idempotent repeat by payment id.
- Unit: partial refund → `PARTIALLY_REFUNDED`, negative ledger entry, `sale_returns` row, optional restock; full refund → `REFUNDED`.
- Unit: refund > paid rejected; fees excluded from default refund amount.
- Sync: append a payment on API → desktop reflects new `amountPaid` and the extra `sale_payments` row without dropping prior rows.

**Rollback:** methods are new and unreferenced by the live flow; safe to leave dormant.

---

## Phase 2 — Post the sale at CONFIRM (the cutover; feature-flagged) — ✅ IMPLEMENTED

**Goal:** flip online orders to post a real (COD credit) sale at confirm and reconcile payments through the ledger. Old completion-time `createSaleForOrder` is removed.

> **Shipped (behind `ONLINE_SALE_AT_CONFIRM=true`; flag off = byte-identical legacy behaviour):**
>
> - **`postSaleForOrder`** at CONFIRM — posts a real sale via `createFromSync` with `source=ONLINE`, `onlineOrderId`, fee **charge lines** reconciled so `goods + charges = order total`, `payments=[]` for pure COD → a real receivable. Idempotent by order id.
> - **Guest contact** (`resolveGuestContact`) — reuse-or-create by email/phone (locked §9.1) so the COD receivable attaches; supplier-only contacts promoted to BOTH.
> - **`createFromSync`** now persists `source`/`onlineOrderId` and honours `deferSerialSold` (serials stay RESERVED at confirm).
> - **Completion** (`DELIVERED`/`PICKED_UP`) — collects any COD balance via `recordPayment` and flips serials RESERVED→SOLD; **no** new sale. Legacy deferred path retained as fallback when the flag is off or no sale exists.
> - **`updatePayment`** — "Mark Paid" routes through `recordPayment` (books real money) when a posted sale exists; `paymentStatus` derived.
> - **Cancel-after-post** — `reversePostedSale` (`void`: restore stock, release serials, write off receivable) + release reserved serials. Actor now carries `role` (threaded from the controller) so the void authorises.
> - Typecheck clean; **29 online+sales tests** (added a post-at-confirm test asserting `source=ONLINE`/`deferSerialSold`/charge lines/guest contact).
>
> **Deviations / deferred:** serial `saleItemId` linkage at handover is best-effort (sets `saleId`+SOLD; not per-line); daily-summary reconciliation for refunds still deferred (Phase 3/4); cancel-after-post uses `void` (no partial-refund-on-cancel yet — Phase 3); flag read from `process.env` (not the Zod config schema). **Checkout persisting the fee breakdown (P2.7) is NOT done** — `buildOrderCharges` reconciles from `totalAmount` so it's correct even without it, but new orders should persist `subtotal`/`deliveryFee`/`codFee` for clean reporting.

### Tasks (`online-orders.service.ts`)

- **P2.1 `postSaleForOrder(order)`** at `CONFIRM` (behind `ONLINE_SALE_AT_CONFIRM`): builds `SaleSyncPayload` with `source='ONLINE'`, `onlineOrderId`, goods items, **typed `charges[]`** (delivery/COD/service from the order breakdown), and payments = prepaid amount (0 for pure COD). `amountPaid`/`creditAmount` computed correctly. Idempotent by `clientId` (order.id).
- **P2.2 Commit inventory at confirm.** Stock deducts at confirm; serials `IN_STOCK → RESERVED` (already reserved today — align so the sale reflects the commitment).
- **P2.3 Receivable.** If `creditAmount > 0`, open a source receivable. Resolve the customer by **email or phone**: reuse an existing `Contact` (returning customer) if found, else create a lightweight guest contact from `customerName`/`customerPhone`/email. Receivable is owned by that contact (locked §9.1).
- **P2.4 `updatePayment` → `recordPayment`.** "Mark Paid" now books real money; `order.paymentStatus` becomes a **derived** projection of the sale.
- **P2.5 Completion (`DELIVERED`/`PICKED_UP`).** No new sale. If COD balance outstanding, `recordPayment` the collected amount; serials `RESERVED → SOLD`. Remove the old deferred-sale block.
- **P2.6 Cancel-after-post.** `CONFIRMED…READY → CANCELLED`: unpaid → `void()`; (partially) paid → `refund()` + `void()`; release still-`RESERVED` serials.
- **P2.7 Fee breakdown persistence.** Checkout/order creation persists `subtotal`/`deliveryFee`/`codFee`/`otherCharges` so `totalAmount` is decomposable (fixes the current delivery-fee-as-overpayment leak).

### Tests / acceptance

- COD order: confirm → sale `COMPLETED` with `creditAmount = total`, `paymentStatus='PENDING'`, receivable opened, delivery fee present as a `DELIVERY` charge (not overpayment).
- Mark Paid → `sale_payments` row, `creditAmount → 0`, receivable settled, `paymentStatus='PAID'`.
- Deliver COD unpaid → payment collected at delivery, serials `SOLD`.
- Cancel a confirmed unpaid order → sale `VOIDED`, stock restored, serials released.
- Flag OFF → identical to today's behaviour (old path intact until removal).

**Rollback:** toggle `ONLINE_SALE_AT_CONFIRM` off → falls back to deferred-sale path (keep it until Phase 2 soaks, then delete).

---

## Phase 3 — Returns & refunds (fulfillment-linked) — ✅ IMPLEMENTED (full-return)

**Goal:** `RETURNED` and cancellations drive real reversals through Phase 1 primitives.

> **Shipped — reversal is FLAG-INDEPENDENT** (fix: reversing a real sale must never be legacy-gated):
>
> - `RETURNED` on **any order that has a `saleId`** (posted at confirm _or_ at completion/legacy) → `salesService.refund({ restock: true })` — money back (signed REFUND row), inventory restored, serials → `IN_STOCK`, receivable written off, sale → `REFUNDED`. Order `paymentStatus` → `REFUNDED` + a customer-visible `PAYMENT_REFUNDED` event. Only orders with no sale keep status-only behaviour.
> - `CANCELLED` on any order with a `saleId` → `void` (restore stock, release serials, write off receivable) + release reserved serials. (Under flag-off a cancellable/pre-completion order has no sale yet, so nothing to void — correct.)
> - Legacy completion-path sales are now tagged `source=ONLINE` + `onlineOrderId` for correct attribution/reporting.
> - Sale `status`/`sale_returns`/`paymentStatus` all sync to desktop (Phase 0 pull), so the admin reflects the refunded state; `REFUNDED`/`PARTIALLY_PAID` are valid `OnlinePaymentStatus` values (no UI compile break).
> - Test: RETURNED calls `refund(restock:true)` + sets `paymentStatus=REFUNDED`. **30 online+sales tests green.**
>
> **Deferred (P3 gate still open):** **partial returns by line are NOT wired** — `refund` supports partial (`items[]`), but the online-admin order-line → `sale_item` mapping + UI is a follow-up; RETURNED currently does a **full** return. Serial returned state = `IN_STOCK` (QUARANTINE not implemented). Restock defaults to on.

### Tasks

- **P3.1** `RETURNED` (`online-orders.service.ts`) → `salesService.refund({ restock: true, reason })`; set `order.paymentStatus` from sale.
- **P3.2** Partial returns: accept returned line/qty selections in the return request (`UpdateOrderStatusRequest` or a dedicated refund DTO/endpoint).
- **P3.3** Storefront/tracking + desktop reflect `REFUNDED`/`PARTIALLY_REFUNDED` and returned lines.
- **P3.4** Serial returned state per §9 (`IN_STOCK` vs `QUARANTINE`).

### Tests / acceptance

- Full return after delivery → negative ledger entry, stock restored, serials released, `status='REFUNDED'`.
- Partial return → correct partial amounts + restock only returned lines.
- Fees excluded from refund by default; explicit fee refund path works.

---

## Phase 4 — UI & reporting — ✅ IMPLEMENTED

> **P4.2 (COD receivables):** already satisfied — the confirm-time COD sale opens a source receivable (`createSourceDebt`) that syncs down as a `debt` and appears in the debtors/receivables list (source ref = order number). No extra work needed; an order→debt deep-link is deferred polish.
>
> **P4.3 (channel split):** `Sale.source` now flows end-to-end for filtering — desktop local `sales.list` accepts a `source` filter (null = in-store); the Sales screen has an **All channels / Online / In-store** dropdown (query keys + reset wired). API `ListSalesQueryDto` accepts `source` (+ `SalesQuery` type) and filters the list; the raw `Sale` rows already carry `source`, so the cloud/browser build maps + filters it too (added to `ApiSale` + the whitelist). Typecheck clean across api + desktop node/web; **39 tests** green.
>
> **P4.4 (storefront tracking):** payment/refund state already reflects on the public tracking timeline via the customer-visible `PAYMENT_RECEIVED` / `PAYMENT_REFUNDED` events (Phase 2/3).
>
> **Deferred polish (non-blocking):** order→debt deep-link; a dedicated channel column/badge in the sales table; delivery/COD revenue as its own report line (the data is there via `sale_charges`, but a report view is a separate build).

**Goal:** surface the richer financial model to merchants.

> **Shipped (P4.1):**
>
> - API `getOrder` returns an `OnlineOrderFinancials` block (from the linked sale): `saleNumber`, sale `status`, `totalAmount`, `amountPaid`, `balanceDue`, `refundedAmount`, `chargesAmount`, and the signed **payments timeline** (PAYMENT/REFUND). Null when no sale posted.
> - Desktop `OnlineOrders.tsx` order drawer renders a **Sale ledger** card: amount paid, balance due (warning colour), refunded (danger), and the per-payment timeline (refunds shown negative).
> - **Cache invalidation:** status/payment mutations now refetch `online`, **`sales`**, `inventory`, `contacts`, `reports` (a status change posts/collects/refunds a sale, moving all of these) — was only invalidating `online`.
> - Types (`OnlineOrderFinancials`/`OnlineOrderPaymentEntry`) in packages/types. Typecheck clean; **11 online + sales tests** (added getOrder-financials + null-financials tests); eslint clean.
>
> **Still pending:** P4.2 receivables/debtors surfacing COD balances with an order↔debt deep-link; P4.3 reports split by `Sale.source` (online vs in-store) + delivery/COD revenue via `sale_charges`; P4.4 storefront tracking payment/refund state (partly covered — the `PAYMENT_REFUNDED`/`PAYMENT_RECEIVED` events are already customer-visible on the tracking timeline).

### Tasks

- **P4.1** Desktop `OnlineOrders.tsx`: order view shows the **financial ledger** — total, charges breakdown, paid, **balance due**, payments timeline, refunds.
- **P4.2** Receivables/debtors surface COD balances (link order ↔ debt).
- **P4.3** Reports split **online vs in-store** via `Sale.source`; delivery/COD revenue via `sale_charges` types.
- **P4.4** Storefront order-tracking reflects payment/refund state where customer-visible.

### Tests / acceptance

- Order screen balance-due matches ledger; refunds visible.
- Reports segment revenue by source and charge type.

---

## Cross-cutting: idempotency matrix

| Operation            | Idempotency key            | Guard                            |
| -------------------- | -------------------------- | -------------------------------- |
| Post sale at confirm | `clientId` (order.id)      | existing-sale short-circuit      |
| Record payment       | payment `id`               | dedupe append; recompute is pure |
| Refund               | return `id` / payment `id` | dedupe; cap at `amountPaid`      |
| Void                 | sale `id` + status         | no-op if already `VOIDED`        |
| Sync apply           | child row ids within sale  | replace-on-upsert converges      |

---

## Sequencing & dependencies

```
P0 (schema+sync, dark) ──▶ P1 (primitives, dark) ──▶ P2 (cutover, flagged) ──▶ P3 (returns) ──▶ P4 (UI/reports)
```

- P0 blocks everything (nothing to write without columns/tables).
- P1 depends only on P0; can land while P2 UI/flow is designed.
- P2 requires P0+P1; ships behind the flag.
- P3 requires P1 (`refund`) + P2 (posted sales to refund).
- P4 is additive on top of P2/P3 data.

**Rough sizing** (relative): P0 M, P1 M–L, P2 L (highest risk), P3 M, P4 M. Suggest one PR per phase (P0/P1 splittable into API vs desktop sub-PRs).

---

## Definition of done (per phase)

- Typecheck + ESLint (max-warnings 0) clean across `apps/api`, `packages/types`, `packages/electron-core`, `apps/desktop-v2`.
- API unit tests for new service methods; migration forward-run verified on seeded DB.
- Sync round-trip verified API → desktop for any new child entity.
- No regression to in-store sales path.
- Phase 2+: feature flag documented; rollback path exercised once.

---

## Decisions

### Phase 2 gate — LOCKED (2026-07, design §9.1)

- **Post point → at CONFIRM.**
- **Inventory commit → at CONFIRM** (stock −qty, serials `RESERVED`; `SOLD` at handover; restored on cancel).
- **`PARTIALLY_PAID` → add the explicit status value.**
- **COD receivable → guest contact, reuse-or-create by email/phone** (returning customer reused), receivable owned by the contact.

Phase 2 is unblocked.

### Still open (do not block P0/P1; resolve before their phase)

- **P1 (assumed, confirm before merge):** refund via signed `SalePayment` rows; typed `sale_charges` child table.
- **P3 gate:** partial-return at launch vs full-only; restock default; serial returned state (`IN_STOCK` vs `QUARANTINE`).
- **Later:** prepaid capture semantics (Paytrack); OHADA revenue-recognition timing; delivery-fee pass-through (courier costs) when delivery agencies land.
