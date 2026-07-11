# Online Order → Sale → Payment → Return: Flow Redesign

**Status:** Draft for review
**Scope:** `apps/api` (online + sales modules), `packages/types`, `apps/desktop-v2` (read/sync side), `packages/electron-core` (local schema)
**Related:** `online-store-initiative`, `payment-methods-plan` (online = COD-only today), `credit-system-plan-v1`, OHADA accounting (deferred)

---

## 1. Why we're changing this

Today the online-order money model is **deferred and lossy**. The Sale record is only born at _completion_ (`DELIVERED` / `PICKED_UP`), always as a single fully-paid `COMPLETED` sale. Everything before that — confirmation, "mark paid", COD expectation — is tracked only as loose flags on the order and never touches the sales/payments ledger. Returns don't reverse anything.

### Current behaviour (verified in code)

Source: `apps/api/src/modules/online/online-orders.service.ts` (`updateStatus`, `updatePayment`, `createSaleForOrder`) and `apps/api/src/modules/sales/services/sales.service.ts` (`createFromSync`, `void`).

| Transition                   | Sale row                             | SalePayment                   | Inventory / Serials                 | Order fields                         |
| ---------------------------- | ------------------------------------ | ----------------------------- | ----------------------------------- | ------------------------------------ |
| CONFIRM                      | —                                    | —                             | serials → `RESERVED`                | `confirmedAt`, items expanded        |
| Mark Paid (`updatePayment`)  | —                                    | —                             | —                                   | `paymentStatus=PAID` + event only    |
| CANCEL (pre-completion)      | —                                    | —                             | serials → `IN_STOCK`                | `cancelledAt`                        |
| **DELIVERED / PICKED_UP**    | **CREATE** `COMPLETED`, paid-in-full | **CREATE** 1 row = full total | deduct stock, serials → `SOLD`      | `saleId`, force `paymentStatus=PAID` |
| RETURNED                     | unchanged                            | unchanged                     | unchanged                           | `returnedAt` only                    |
| Sale void (manual, unlinked) | → `VOIDED`                           | kept                          | restore stock, serials → `IN_STOCK` | not linked back                      |

### The three structural gaps

1. **No payment ledger for orders.** The order's payment axis (`OnlinePaymentStatus`) and the real money ledger (`SalePayment`) are disjoint until completion, then collapsed into one lump sum. A deposit, a COD collection on delivery, or a refund cannot be represented as actual money movement. "Mark Paid" before delivery moves **zero** money into the books.

2. **The order↔sale link is one-directional and weak.** `OnlineOrder.saleId → Sale.id`, joined only by `Sale.clientId = order.id` (idempotency string). **`Sale` has no `online_order_id` column** in the API entity _or_ the desktop SQLite schema. You cannot go Sale → Order.

3. **Returns and voids are decoupled.** `RETURNED` is a fulfillment note with zero financial effect (sale stays `COMPLETED`, stock not restored, serials stay `SOLD`). The void is a manual, unlinked sales action. There is no refund concept.

### The business reality that should drive the design

Per `payment-methods-plan`, **online orders are COD-only today** (Paytrack/prepaid deferred). So the dominant real case is: _customer orders, merchant accepts, goods go out unpaid, cash/MoMo is collected on delivery._ That is textbook **credit sale settled on delivery** — which the current "always paid-in-full at the end" model cannot represent honestly. The redesign's headline is therefore:

> **Post a real sale when the merchant confirms the order. If COD, it's a credit (receivable) sale. Collect payment as an actual ledger entry. Refund on return.**

---

## 2. Design principles

1. **One ledger, one source of truth.** All money lives in `SalePayment` (append-only, signed). The order's `paymentStatus` becomes a _derived projection_ of the sale's `amountPaid` / `creditAmount`, never an independent store of truth.
2. **Recognize the sale at the commitment point.** The merchant confirming the order **is** the commercial commitment. That's when the Sale is posted, inventory is committed, and (for COD) a receivable is opened.
3. **Two axes, explicitly reconciled.** Keep _fulfillment_ and _financial_ as separate state machines, but define exactly how each fulfillment transition maps to a financial event.
4. **Every reversal is a first-class event.** Cancel-after-post, return, and refund each produce real ledger + inventory movements and a linked audit record — never silent no-ops.
5. **Server-authoritative for online money; desktop is a synced reader.** Online orders require connectivity (online-only proxy). All financial mutations happen on the API; the resulting sale aggregate (with payments + returns) syncs down to desktop via pull/applyChanges. This sidesteps offline double-spend on shared online inventory.
6. **Bidirectional, explicit links.** `Sale.online_order_id` ↔ `OnlineOrder.saleId`, plus `source = ONLINE`, so either side is reachable and reportable.
7. **Reuse, don't fork.** The new `recordPayment` / `refund` primitives are built on the sales module so in-store credit sales can eventually use the same paths (aligns with `credit-system-plan-v1`).

---

## 3. The new model

### 3.1 Two reconciled axes

**Fulfillment axis** (largely unchanged — `ONLINE_ORDER_TRANSITIONS` in `packages/types/src/online.types.ts`):

```
DELIVERY: PENDING → CONFIRMED → PREPARING → READY_FOR_DISPATCH → OUT_FOR_DELIVERY → DELIVERED → RETURNED
PICKUP:   PENDING → CONFIRMED → PREPARING → READY_FOR_PICKUP → PICKED_UP → RETURNED
(CANCELLED reachable pre-completion; DELIVERY_FAILED ⇄ OUT_FOR_DELIVERY)
```

**Financial axis** (new, derived from the sale):

```
NONE  →  POSTED(unpaid|partial|paid)  →  SETTLED(paid)  →  REFUNDED(partial|full)
                    ↘ VOIDED (post-confirm cancellation of an unpaid/erroneous sale)
```

`OnlinePaymentStatus` values are **kept** but become derived:

| Sale state                       | Derived `paymentStatus`                                |
| -------------------------------- | ------------------------------------------------------ |
| No sale yet (PENDING order)      | `PENDING`                                              |
| Posted, `amountPaid = 0`         | `PENDING` (COD awaiting) / `AUTHORIZED` (prepaid held) |
| Posted, `0 < amountPaid < total` | `PARTIALLY_PAID` _(new value — see §9 decision)_       |
| Posted, `amountPaid ≥ total`     | `PAID`                                                 |
| Refunded in full                 | `REFUNDED`                                             |
| Refunded in part                 | `PARTIALLY_REFUNDED`                                   |

### 3.2 When is the sale posted? — **at CONFIRM** (recommended)

| Option              | Post point     | Pros                                                                                                                           | Cons                                                      |
| ------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| **A (recommended)** | **CONFIRM**    | Sale exists the moment merchant commits; COD becomes a true receivable; payments recordable any time; reports reflect pipeline | Must reverse (void/refund) if later cancelled             |
| B (today)           | Completion     | No reversal needed for cancels                                                                                                 | Dishonest money model; no receivable; "mark paid" is fake |
| C                   | Dispatch/Ready | Compromise                                                                                                                     | Still no receivable during prep; two reversal windows     |

**Recommendation: Option A.** Confirmation is the commitment; it already reserves serial units. We extend it to _post the sale_.

### 3.3 Confirm-time posting logic

At `CONFIRM`, `postSaleForOrder(order)` creates the Sale with the financial shape that matches reality:

```
paid  = sum of payments already captured at checkout (0 for pure COD)
total = order.totalAmount
sale.amountPaid   = paid
sale.creditAmount = total - paid           // > 0 ⇒ receivable opened
sale.status       = COMPLETED              // "posted"; financial state lives in amountPaid/creditAmount
sale.source       = ONLINE
sale.online_order_id = order.id
```

- **Pure COD (today's default):** `paid = 0` → full receivable. `paymentStatus = PENDING`.
- **Deposit + COD balance:** `paid = deposit` → partial. `paymentStatus = PARTIALLY_PAID`.
- **Prepaid (future Paytrack):** `paid = total` → `paymentStatus = PAID`.

Inventory is **committed** at confirm (deduct stock; serials `RESERVED` — see §5). If `creditAmount > 0` and the order has a resolvable customer, open a receivable debt (§6).

### 3.4 Payment collection is a real ledger append

`updatePayment` (and delivery-time COD collection) call the new `SalesService.recordPayment(saleId, { id, method, amount, reference })`:

- Appends a **positive** `SalePayment` row.
- Recomputes `amountPaid = Σ payments`, `creditAmount = max(0, total − amountPaid)`.
- Settles/reduces the linked receivable debt.
- Recomputes and pushes the order's derived `paymentStatus`.
- Idempotent by payment `id`.

So "Mark Paid" now _actually books the money_. COD collected on delivery is just a `recordPayment` at the `DELIVERED`/`PICKED_UP` step (no new sale is created there anymore).

### 3.5 Returns and refunds become first-class

`RETURNED` (or a dedicated "Refund" action) calls `SalesService.refund(saleId, { items?, amount?, restock, reason })`:

- Appends a **negative** `SalePayment` (signed ledger) for the refunded amount → `amountPaid` drops.
- Writes a linked `sale_returns` record (which items/qty, restock flag, reason, actor).
- If `restock`: restores inventory and returns serials to `IN_STOCK` (optionally `QUARANTINE` — §9).
- Sets sale `status` = `REFUNDED` (full) or `PARTIALLY_REFUNDED` (partial).
- Pushes order `paymentStatus` = `REFUNDED` / `PARTIALLY_REFUNDED`.

Supports **partial** returns (some lines / some quantity) — not possible today.

### 3.6 Cancel after posting

`CONFIRMED…READY → CANCELLED` on a _posted_ sale:

- If unpaid → `SalesService.void()` (existing path: status `VOIDED`, restore stock, release serials, write off receivable).
- If (partially) paid → `refund()` the collected amount + restock + release serials, then `VOIDED`.
- Release any still-`RESERVED` serials.

---

## 4. Sale as the sync aggregate

`SalePayment` and `sale_returns` are **children of the sale aggregate**. On any financial mutation (post, recordPayment, refund, void) the API bumps the sale's `updatedAt`; the pull/applyChanges path re-syncs the **whole sale with its current payments + returns arrays**, and desktop upserts the sale and **replaces** its child rows. This avoids partial-ledger races and keeps one idempotent unit.

- Do **not** introduce independent per-payment sync entities (races on order of arrival).
- Keep the embedded `payments` array in the sale sync payload; **add** `charges` and `returns` arrays.
- Idempotency: sale by `clientId`/`id`; charges/payments/returns by their own ids within the replace.

---

## 5. Inventory & serial units

| Event                                   | Stock                     | Serial unit                    |
| --------------------------------------- | ------------------------- | ------------------------------ |
| CONFIRM (post sale)                     | **deduct** (committed)    | `IN_STOCK → RESERVED`          |
| DELIVERED / PICKED_UP                   | no change                 | `RESERVED → SOLD`              |
| CANCEL (posted) / full return + restock | **restore**               | `→ IN_STOCK` (or `QUARANTINE`) |
| Partial return + restock                | restore returned qty only | returned serials `→ IN_STOCK`  |

Note the shift: stock is **committed at confirm**, not at completion. This is more correct (accepting an order commits the goods) and makes online availability trustworthy. `RESERVED` is retained as the physical in-transit state; `SOLD` marks handover.

---

## 6. Receivables (COD as credit)

COD posts `creditAmount > 0`. To keep debts/reports honest we open a **source receivable** (as `sales.service.ts` already does for in-store credit via `debtsService.createSourceDebt()`), settled by `recordPayment`.

**Locked (§9.1):** resolve the customer by **email or phone** — if a `Contact` already exists (returning customer), **use it**; otherwise create a lightweight guest contact from `customerName`/`customerPhone`/email. Open the receivable against that contact so repeat customers accrue history and debtors reports stay honest.

---

## 7. Fees & charges (delivery, COD, service)

Online orders carry fees on top of goods. They must land in the ledger **by who pays them**.

### 7.1 Two buckets — do not mix

| Fee                                        | Who pays | Where it goes                     | Effect                                                        |
| ------------------------------------------ | -------- | --------------------------------- | ------------------------------------------------------------- |
| Delivery fee — kept as revenue _(current)_ | Customer | Sale **charge** line (`DELIVERY`) | +revenue, part of `totalAmount` → `amountPaid`/`creditAmount` |
| COD surcharge                              | Customer | Sale **charge** line (`COD`)      | +revenue                                                      |
| Service/handling fee                       | Customer | Sale **charge** line (`SERVICE`)  | +revenue                                                      |
| Courier cost — _future, delivery agencies_ | Business | **Expense** linked to order       | −margin, **never** on the sale                                |
| Payment-gateway fee — _future prepaid_     | Business | **Expense**                       | −margin, not on the sale                                      |

Rule: **customer-facing fees are sale charges; business-incurred costs are expenses.** A 1 000 XAF delivery charge to the customer plus an 800 XAF courier cost = a 1 000 charge on the sale **and** an 800 expense against the order (net margin 200). Putting the courier cost on the sale would fake revenue and hide margin.

> **Decided (2026-07):** for now the **delivery fee is revenue the business keeps** — self-delivery, no third-party split. So it is a plain `DELIVERY` charge line on the sale and there is **no `courierCost` expense** yet. This is deliberately parked: when we integrate delivery agencies (multiple couriers, per-agency rates), the fee may become partly or wholly a **pass-through**, at which point we add `courierCost` as an order-linked expense and reconcile margin. The model below already isolates the customer charge (`DELIVERY` line) from any future business cost, so that change is additive — no rework of the ledger.

### 7.2 Current gap (must fix)

`OnlineOrder` persists only a scalar `totalAmount` — no `subtotal` / `deliveryFee` / `codFee` (delivery fee lives on store config, applied at checkout). `createSaleForOrder` passes goods items **and a payment of `order.totalAmount`** (goods + delivery) with **no charges**. So `createFromSync` computes sale `totalAmount` from items = goods-only, while `amountPaid` = goods + delivery → **the delivery fee currently leaks out as overpayment / change-given, not revenue.** The redesign carries the breakdown end-to-end.

### 7.3 Mapping into the sale

Persist the breakdown on the order and map fees into **typed charge lines**:

```
order.subtotal      = Σ(item.unitPrice × qty)      // goods
order.deliveryFee   = from store config / zone
order.codFee        = COD surcharge (0 if none)
order.otherCharges  = optional
order.totalAmount   = subtotal + deliveryFee + codFee + otherCharges

sale.subtotal       = order.subtotal
sale.chargesAmount  = deliveryFee + codFee + otherCharges     // scalar rollup (existing field)
sale.charges[]      = [{type:DELIVERY, amount}, {type:COD, amount}, ...]  // typed lines (new)
sale.totalAmount    = subtotal − discount + chargesAmount + tax
amountPaid / creditAmount computed against this correct total
```

Typed `sale_charges` child rows let reports split delivery/COD revenue from goods; the scalar `chargesAmount` stays as the compatibility rollup. Charges sync inside the sale aggregate (like payments/returns, §4). Tax-on-fees is out of scope for now (configurable later).

### 7.4 Fees on refund/return

Fees are **non-refundable by default** (service was rendered). `refund()` defaults its `refundAmount` to the **goods** portion of returned lines and **excludes** delivery/COD/service charges unless the merchant explicitly opts to refund a fee. `sale_returns.refundAmount` therefore need not equal the returned goods’ share of `totalAmount`.

---

## 8. Schema changes

### 8.1 `packages/types` (`src/online.types.ts`, sales types)

- Add `PARTIALLY_PAID` to `OnlinePaymentStatus` (decision §9).
- Add `SaleSource = 'IN_STORE' | 'ONLINE'` and `SaleChargeType = 'DELIVERY' | 'COD' | 'SERVICE' | 'OTHER'`.
- Extend `OnlineOrder`: persist the fee breakdown — `subtotal`, `deliveryFee`, `codFee`, `otherCharges` (so `totalAmount` is decomposable, §7).
- Extend `SaleSyncPayload`: `source`, `onlineOrderId`, `charges[]`, `returns[]`, and make `payments[]` support signed/`kind` entries.
- New `SaleCharge`, `SaleReturn` / `SaleReturnItem` shapes (shared, per shared-types rule).

### 8.2 API entities (`apps/api/src/entities`)

- `sale.entity.ts`: add `source` (enum, default `IN_STORE`), `onlineOrderId` (uuid, nullable, indexed, FK → online_orders, `SET NULL`). Keep scalar `chargesAmount` as the rollup. Reuse existing `status` (`REFUNDED`/`PARTIALLY_REFUNDED` already present).
- **New** `sale-charge.entity.ts`: `saleId`, `businessId`, `type` (`DELIVERY`/`COD`/`SERVICE`/`OTHER`), `label`, `amount`. Append-only child; `Σ amount == sale.chargesAmount`. Lets reports split delivery/COD revenue from goods.
- `online-order.entity.ts`: add persisted `subtotal`, `deliveryFee`, `codFee`, `otherCharges` columns (backfill `subtotal = totalAmount − deliveryFee` for history).
- `sale-payment.entity.ts`: add `kind` (`PAYMENT` | `REFUND`) **or** allow signed `amount`; add `recordedAt`, `recordedById`, `note`. Stays append-only.
- **New** `sale-return.entity.ts` (+ `sale-return-item.entity.ts`): `saleId`, `onlineOrderId`, `businessId`, `reason`, `restock`, `refundAmount`, `createdById`, items(`saleItemId`, `quantity`, `serialUnitId`).
- Migration in `apps/api/src/database/migrations/` (migrations-only). Backfill: set `source=ONLINE` + `onlineOrderId` on existing sales by joining `sales.client_id = online_orders.id`.
- **Business-cost seam (deferred):** delivery fee is kept revenue for now, so **no `courierCost` yet** (§7.1). When delivery agencies land, add an order-linked **expense** (`courierCost`) + gateway-fee expense for prepaid; never a sale charge.

### 8.3 Desktop SQLite (`packages/electron-core/src/migrations`)

- New migration (do not edit `0001_initial_schema.ts`): add `sales.source`, `sales.online_order_id`; new `sale_charges` table; add `sale_payments.kind`/signed + `recorded_at`/`recorded_by`; new `sale_returns` + `sale_return_items` tables.
- `applyChanges` handlers: upsert sale + **replace** child charges, payments and returns from the synced aggregate.

### 8.4 `OnlineOrder` entity

- Keep `saleId`, `paymentStatus`. Add the fee breakdown fields (§8.2). Optionally add derived `amountDue` convenience (or compute from sale). Refine `updatePayment`/`updateStatus` to delegate to the sale.

---

## 9. Decisions

### 9.1 Locked (2026-07) — Phase 2 gate

1. **Post point → at CONFIRM.** The sale is posted the moment the merchant accepts the order. COD is a real receivable from confirm; cancel-after-post reverses via void/refund.
2. **Inventory commit → at CONFIRM.** Stock deducts and serials go `RESERVED` at confirm (not at completion); `SOLD` at handover; restored on cancel. Keeps online availability trustworthy and the ledger consistent with the posted sale.
3. **`PARTIALLY_PAID` → add the explicit value.** `paid=0 → PENDING`, `0<paid<total → PARTIALLY_PAID`, `paid≥total → PAID`; derived from the sale ledger.
4. **COD receivable → guest contact, reuse-or-create.** Resolve the customer by **email or phone**; if a Contact already exists (returning customer) **use it**, else create a lightweight guest contact from `customerName`/`customerPhone`/email. Open a normal source receivable against that contact so debtors reports and cross-order history stay honest.

### 9.2 Still open (later phases)

5. **Refund representation:** signed `SalePayment` rows (single ledger) vs a separate refund entity. _(recommend signed rows + `sale_returns` for item/restock metadata)_
6. **Partial returns at launch** or full-only first? _(recommend model supports partial; UI can ship full-only first)_
7. **Restock default** on return (per-item toggle, default on/off?) and **returned serial state** (`IN_STOCK` vs `QUARANTINE`).
8. **Fees on refund:** confirm delivery/COD/service fees are non-refundable by default (refund goods only). _(recommended)_
9. **Typed charge lines vs scalar only:** ship `sale_charges` child table for delivery/COD revenue reporting, or start with scalar `chargesAmount` + a `chargesBreakdown` JSON? _(recommend the child table)_
10. **Prepaid capture semantics** for future Paytrack (auth+capture vs instant capture) — affects `AUTHORIZED` handling.
11. **Revenue recognition timing** for OHADA/accounting (posted-at-confirm vs delivered) — flag for the deferred accounting work.

---

## 10. Phased rollout

- **Phase 0 — Schema & links (no behaviour change).** Add columns/tables (nullable), backfill `source`/`online_order_id`, sync the bidirectional link + `source` down to desktop. Ship dark.
- **Phase 1 — Ledger primitives.** `SalesService.recordPayment()` and `refund()` (signed ledger + `sale_returns`), aggregate re-sync, desktop applyChanges. Unit-tested; not yet wired to orders.
- **Phase 2 — Post at confirm.** `postSaleForOrder` at CONFIRM as COD credit sale; commit inventory at confirm; `updatePayment` → `recordPayment`; delivery-time COD collection → `recordPayment`; derive `paymentStatus`. Remove the completion-time `createSaleForOrder`.
- **Phase 3 — Returns/refunds.** `RETURNED` → `refund` + restock; cancel-after-post → void/refund; desktop + storefront reflect refunded state.
- **Phase 4 — UI & reporting.** Desktop order view shows the financial ledger (paid, balance due, refunds), receivables surface COD, reports split online vs in-store via `source`.

Each phase is independently shippable; Phase 0/1 carry no user-visible change and de-risk the cutover in Phase 2.

---

## 11. Edge cases to cover in tests

- Double-confirm (idempotent post by `clientId`).
- `recordPayment` idempotency by payment id; over-payment clamps `creditAmount` at 0.
- Refund exceeding `amountPaid` rejected; partial refund math.
- Cancel of a partially-paid posted sale → refund collected portion + void + release serials.
- Serial unit never double-sold across confirm→deliver→return→resell.
- Concurrent status updates (optimistic guard on order + sale version).
- Backfill correctness for historical completed orders (already-paid sales stay paid; link populated).
- Sync replace: appended payment/return on API reflects on desktop without dropping prior rows.
