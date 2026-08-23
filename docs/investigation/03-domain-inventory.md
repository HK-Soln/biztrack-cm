# 03 — Domain Inventory

Per-domain deep dives in the brief's fixed shape. All CONFIRMED unless marked.

---

## 6.1 Money handling _(investigated first, most carefully)_

**Status:** IMPLEMENTED — but inconsistent across layers, and **not integer XAF**.

- **Storage per layer:**
  - Postgres: `decimal/numeric(12,2)` for all money columns — `sales.*`, `sale_items.*` (`quantity` is `decimal(12,3)`), `sale_payments.amount`, `sale_discounts.amount numeric(12,2)`+`rate numeric(8,4)`, `sale_charges.amount numeric(12,2)`+`rate_value numeric(10,4)`, `products.price/cost_price`, `expenses.amount`, `debts.original_amount`. **Exception:** `product_variants.price_override` / `cost_price_override` are **`int`** with a comment "XAF is a zero-decimal currency" (`product-variant.entity.ts:8-12`).
  - SQLite (desktop): **all money columns `REAL`** (IEEE-754 float) — `0001_initial_schema.ts:78-132`; local variant overrides are `INTEGER`.
- **In-code type:** plain `number`. **No Money value object.** TypeORM `decimalTransformer` casts pg strings via `Number(value)` (`transformers.ts:6`).
- **Rounding:** duplicated, not centralized. API `roundMoney(v)=Math.round(v*100)/100` (`sales.service.ts:2372`), quantity `roundQuantity` 3dp; desktop `round2(n)=Math.round((n+EPSILON)*100)/100` (`sales.service.ts:1396`). `packages/utils/src/currency.ts` has only `formatCurrency`/`parseCurrency`/`calculateProfit`/`calculateMargin` — **no rounding helper**. Rounding to **2 decimals on a 0-decimal currency** allows sub-XAF residues.
- **Percentages:** `numeric` rate columns, **not** basis-point integers. Percent→amount resolution happens **client-side** (the `amount` is pre-computed and sent; the backend does not re-derive from `rate`).
- **Cash rounding (5/25/100 XAF):** **DOES NOT EXIST.** `changeGiven = round(amountPaid − total)` only.
- **Float on money paths:** intrinsic (all money is JS `number`): `lineTotal = unitPrice*qty − discount`. `Number(...)` casts throughout raw-SQL report aggregations. `toFixed` appears only on **display** paths (`apps/desktop-v2/.../lib/currency.ts:29`); `parseFloat` only in `parseCurrency` (display parsing), not in sale computation.
- **Formatting:** `Intl.NumberFormat` currency style, XAF forced to 0 fraction digits (`packages/utils/src/currency.ts`). **No calculation reads a formatted string** on the sale money path.

**Verdict:** Money is **NOT** whole-integer XAF. Safety for spec arithmetic is _marginal_: 2-dp half-up rounding after each op bounds drift, and desktop↔API parity is deliberately engineered, but (a) SQLite `REAL` produces values like `6499.999999` masked by `round2`; (b) 2-dp storage on a 0-dp currency lets sub-unit residues survive; (c) no single rounding source of truth; (d) variant `int` vs line `decimal` can disagree at sub-XAF during proration/splits. **Remediation** (prerequisite for Specs 01–02): a shared `packages/utils` money helper (integer-XAF, single rounding fn incl. cash unit), standardize storage toward integer/round-to-integer XAF end-to-end, reconcile variant-int vs line-decimal, migrate SQLite money off `REAL` — preserving the parity contract.

**Relevance:** Spec 01 §3 & §12 (integer XAF, no floats, rounding fn); Spec 02 A7 expected-cash arithmetic. Blocks both.

---

## 6.2 Sales / POS / cart

**Status:** IMPLEMENTED.

- **Entities:** `Sale`/`sales` (`sale.entity.ts:18`), `SaleItem`/`sale_items` (`sale-item.entity.ts:18`), plus `SaleCharge`/`sale_charges`, `SaleDiscount`/`sale_discounts`, `SalePayment`/`sale_payments`, `SaleReturn`/`sale_returns` + `SaleReturnItem`. Local SQLite mirrors all.
- **Key fields (Sale):** `saleNumber` (unique/business), `clientId` (idempotency), `status`, `subtotal`, `discountAmount`, `chargesAmount`, `taxAmount` (**always 0**), `totalAmount`, `amountPaid`, `creditAmount`, `changeGiven`, `paymentMethod` (denormalized single or `MIXED`), `customerId`, snapshot `customerName`/`customerPhone`, `priceDriftWarning`, `saleDate` (`date`), `soldAt` (`timestamptz`), `voidedAt`/`voidedById`/`voidReason`.
- **Key fields (SaleItem):** snapshots `productName`, `productSku`, `unitOfMeasure`, `variantName`, `serialNumber`; `quantity decimal(12,3)`, `unitPrice`, `discountAmount`, `lineTotal`, `totalPrice` (@deprecated mirror), `costPrice`.
- **State machine:** `SaleStatus = COMPLETED, VOIDED, REFUNDED, PARTIALLY_REFUNDED, CANCELLED` (`sale.types.ts:14`). Default `COMPLETED`. **No `DRAFT`** — a held/parked cart is client-side localStorage only, never a DB row. `CANCELLED` is defined but no writer sets it on the in-store sale path.
- **Business rules:** `computeSale` (`sales.service.ts:2132`): `lineTotal=max(0, round(unitPrice*qty − discount))`, `subtotal=Σ lineTotal`, `saleDiscount=min(dto.discount, subtotal)`, `totalAmount=max(0, round(subtotal − saleDiscount + charges))`. Line total **stored, not derived at read**. Price **snapshotted at cart-add** (client supplies `unitPrice`; server uses it, only checks drift vs `product.sellingPrice`).
- **Completed sales editable?** **No** — no update/edit endpoint exists. Post-creation mutation limited to void (status flip), `recordPayment` (append), `refund` (append). Line prices/qtys of a posted sale cannot change.
- **Void:** soft, role-gated **OWNER/MANAGER** (`sales.service.ts:1181`). Sets `status=VOIDED`+reason; reverses inventory (`reverseForVoidedSale`, writes `VOID_REVERSAL` movement), releases serials, decrements daily summary, writes off linked receivable, refunds SAVINGS. Desktop requires reason ≥10 chars.
- **Refund/return:** appends signed `REFUND` `SalePayment` + `SaleReturn`/`SaleReturnItem`, optional restock, status `REFUNDED`/`PARTIALLY_REFUNDED`. `amountPaid = Σ PAYMENT − Σ REFUND`. (API/cloud-only primitive; no desktop-local refund found.)
- **Existing discount/override (Spec 01 collision):** extensive — see `01-glossary §5` and `04-gap-analysis`. Per-line `sale_items.discountAmount`; sale-level `sales.discountAmount`; `SaleDiscount` rows (`discountType PERCENTAGE|FIXED_AMOUNT`, `rate`); `SaleCharge` rows; variant `price_override`; manual line price accepted with `priceDriftWarning` >10% flag (`hasPriceDrift` `sales.service.ts:2181`). `Sell.tsx` already has custom `addCustom('discount')` PERCENT/FIXED UI. Terms `promo`/`markdown`/`manualPrice` do not exist as identifiers.
- **Tests:** `apps/api/src/modules/sales/__tests__/sales.service.spec.ts`; inventory `deduct-for-sale.spec.ts`. Desktop sale path: **untested**.
- **Known issues:** `taxAmount` always written 0 (tax unused); deprecated `totalPrice` mirrors `lineTotal`.
- **Relevance:** Spec 01 (all), Spec 02 (void→audit, discounted expected-cash), Spec 03 (revenue), Spec 04 (`business_date` on sale).

---

## 6.3 Tenders / payments

**Status:** IMPLEMENTED.

- **`PaymentMethod` (verbatim):** `CASH, MTN_MOMO, ORANGE_MONEY, CARD, SAVINGS, MIXED` (`sale.types.ts:5`). UI-only `'CREDIT'` pseudo-method is a list filter (unpaid balance), not stored.
- **Split tender:** supported — many `SalePayment` rows per sale; `sales.payment_method='MIXED'` when >1 method (`deriveStoredPaymentMethod` `sales.service.ts:2392`). Append-only signed ledger (PAYMENT/REFUND).
- **MoMo vs OM:** **distinguished** as separate enum values and separate daily-summary columns (`mtnMomoCollected`, `orangeMoneyCollected`), but **lumped** in some aggregations (`method IN ('MTN_MOMO','ORANGE_MONEY') AS momo`). Reference: `sale_payments.mobile_money_reference` + legacy `sales.momo_reference`.
- **Payments integration:** **none live.** `Campay*` types in `packages/types/src/payment.types.ts:1-34` are **dead code** (zero importers). PayTrack referenced only in comments/roadmap. MoMo refs are free-text; no gateway call.
- **Relevance:** Spec 02 A3 (reconcile per tender — the enum already supports this), Spec 01 §9 (split tender sums to discounted total).

---

## 6.4 Receivables (credit sales)

**Status:** PARTIAL (more built than expected).

- **Model:** unified `Debt`/`debts` (`debt.entity.ts:20`), `direction=RECEIVABLE`. Fields: `contact_id` (FK), `source_type` (`SALE|RESTOCK|OPENING_BALANCE`), `source_id` (**FK-less polymorphic**), `original_amount numeric(12,2)`, `status`, `due_date` (nullable), `settled_at`, `written_off_at/by/reason`. `paidAmount`/`outstandingAmount` **computed at read** by summing `debt_payments` (`debts.service.ts:974-986`). Enums: `DebtStatus = OUTSTANDING, PARTIALLY_PAID, SETTLED, WRITTEN_OFF`.
- **Due date / credit limit / aging:** `due_date` present but **passive** (sortable, drives nothing). **No credit limit** anywhere. **Aging exists** (`getAgeingReport`, `opening-balances.service.ts:268`) but buckets off **`created_at`, not `due_date`**: current ≤7, moderate ≤15, aged ≤30, overdue >30; opening-balance debts get their own column. Endpoints `GET /debtors/ageing`, `/creditors/ageing`; report `aged-recv` built.
- **Repayments:** `DebtPayment` rows (append-only, `ImmutableBaseEntity`) via `recordPayment` (`debts.service.ts:217`); each payment attaches to **one** `debtId`. **No lettrage** (payment→multiple-invoice allocation). Running balance; `recalculateStatus` sets SETTLED/PARTIALLY_PAID/OUTSTANDING. Partial payments supported (capped at outstanding, repeatable, deletable). `offsetBalances` contra-nets receivables vs payables oldest-first via synthetic `OFFSET` payments.
- **Reminders/notifications:** **none for debts.** `NotificationsService` (WhatsApp/SMS) exists but is wired to RFQ/PO/receipts; `NotificationType.PAYMENT_REMINDER` exists **unwired**.
- **Opening balance = debt:** confirmed — `ContactOpeningBalance` materializes a `debts` row (`source_type=OPENING_BALANCE`, `source_id=contactId`, `created_at=asOfDate`), read back by statement + ageing, no double-count.
- **Known issues:** `debts.service.ts:370` writes `method: 'OFFSET' as PaymentMethod` — `OFFSET` is not a `PaymentMethod` member (latent). No dedicated `debts` test dir.
- **Relevance:** Spec 03 Part B (receivables view, reminders, ageing — extend real ageing + wire `PAYMENT_REMINDER`), Spec 01 §11 (escompte belongs here, at payment time).

---

## 6.5 Payables (suppliers)

**Status:** PARTIAL — shares receivables' abstraction.

- **Model:** a payable is a `debts` row with `direction=PAYABLE`. **No separate payables table.** Same `DebtsService`, `debt_payments`, ageing, statement, write-off — all parameterized by `direction`. Discriminator index `idx_debts_business_id_direction`.
- **Second representation (collision risk):** supplier credit is **also** recorded on `restock_records` (`total_amount`, `amount_paid`, `credit_amount`, generated `has_credit`, `supplier_id`) + a dedicated **`restock_payments`** table that duplicates `debt_payments`. So a restock-on-credit writes **both** ledgers. `RestockRecord` also carries `discount_amount`/`charges_amount`/`invoice_*` + child `restock_charges`/`restock_discounts`.
- **Contacts:** one `contacts` entity, `type = CUSTOMER|SUPPLIER|BOTH`; direction↔type enforced in `matchesRequiredContactType`. Fields incl. KYC (`id_type`, `id_number`, `id_documents jsonb`, `selfie_url`), `email`.
- **Relevance:** Spec 03 §B4 (payables extends the same abstraction — good; beware the `restock_payments` double-count when totaling payables).

---

## 6.6 Audit trail _(known partial, high collision risk)_

**Status:** PARTIAL — foundation sound, coverage thin, append-only unenforced.

- **Table:** `audit_logs` / `AuditLog` (`audit-log.entity.ts`, migration `1780200000000-audit_logs.ts`). Columns: `id, business_id, actor_id, actor_type, actor_name, actor_role, action, entity_type, entity_id, entity_label, changes jsonb, ip_address, device_id, device_type, device_info jsonb, request_id, created_at`. 3 indexes (business+time, entity, actor). **Plain non-partitioned table** — the doc `AUDIT_AND_EVENTS_SPEC.md`'s partitioning/PK/CHECK/INET design did **not** ship.
- **Types (TS unions, not DB enums):** `AuditAction = CREATE|UPDATE|DELETE|HARD_DELETE|RESTORE|VOID|EXPORT|LOGIN|LOGOUT|FAILED_LOGIN|PLAN_CHANGE|PERMISSION_CHANGE`; `AuditActorType = BUSINESS_USER|AGENT|SYSTEM|PUBLIC`; `AuditDeviceType = DESKTOP_APP|MOBILE_APP|WEB_BROWSER|API|SYSTEM`. `changes` = `{ before, after }`. `entity_type` is free-form string. → **All widenable without migration** (good for adding cash-session events).
- **Emission:** explicit `auditService.log(ctx, data)` at the end of write methods → BullMQ `AUDIT_QUEUE` (fire-and-forget + direct-write fallback). **Not** an interceptor/subscriber/trigger. Early-returns if `businessId` is null (silently drops SYSTEM/PUBLIC-only events).
- **Actual emit sites (~8 write paths):** products (create/update/delete), product-variants, product-serial-units, sales (CREATE/VOID/EXPORT), brands (+models), rfqs, purchase-orders, business (update). **Emit NOTHING:** debts, debt_payments, contacts, expenses, categories, attributes, auth (LOGIN/LOGOUT/FAILED_LOGIN), roles/permissions (PLAN_CHANGE/PERMISSION_CHANGE defined-but-never-emitted), online orders, savings, inventory adjustments, restocks. → The financially sensitive paths are exactly the uncovered ones.
- **Append-only:** **by convention only.** No trigger, no `REVOKE`, no CHECK. A raw `UPDATE`/`DELETE` is possible. Same for `debt_payments` (and `deletePayment` deletes them).
- **Parallel mechanisms:** `audit_logs`; `online_order_events` (curated order timeline); `subscription_events` (de-facto plan/subscription audit — where PLAN_CHANGE history actually lives); `sync_logs`; `notifications`; global `LoggingInterceptor` (stdout, ephemeral); desktop `local_audit_logs`.
- **Desktop `local_audit_logs`:** **more active** than the server trail — injected into ~15 desktop services incl. debts/contacts/expenses. But `synced_at` stays NULL (**no push to server yet**), and `actor_type` is hardcoded `'USER'` (not a server `AuditActorType`). **No UI reads it** — `client.audit.list` is wired end-to-end but no route/component calls it.
- **Verdict:** **EXTEND `audit_logs`, do not build `audit_events`.** The plumbing (polymorphic entity ref, typed context, fire-and-forget queue, `GET /audit`, desktop mirror) is reusable; add cash-session `entity_type`/`AuditAction` values (no schema change). Real work: (1) DB-level append-only guard; (2) broaden emit coverage to money paths; (3) build desktop→server sync + actor-type mapping; (4) build the "Activité" UI; (5) reconcile the `businessId`-null drop.
- **Relevance:** Spec 02 Part B (this is the core collision surface).

---

## 6.7 Cash / till

**Status:** NOT IMPLEMENTED (greenfield).

- **Till/drawer/session/shift/float:** **DOES NOT EXIST** anywhere in `apps/api`, `apps/desktop-v2`, `packages/electron-core`. `Role` has no `tracksCashDrawer`/`systemKey`. Concept exists only as roadmap copy in `apps/web/src/app/roadmap/RoadmapContent.tsx`.
- **Daily-close / X / Z report:** none. Closest analogue = materialized `daily_sale_summaries` (`(business_id, summary_date)`; totals incl. `cashCollected`, `mtnMomoCollected`, `orangeMoneyCollected`, `cardCollected`, `creditIssued`, `voidedSales`) — **not reconciled against a counted drawer** (no counted-cash input).
- **Expenses↔cash:** `Expense` (`expenses` table) has a free nullable `paymentMethod` string; **no FK to a till/cash-session**, no cash-balance ledger — an expense doesn't decrement any cash account.
- **Owner-draw:** **DOES NOT EXIST** (roadmap OHADA "Drawings" line only).
- **Relevance:** Spec 02 Part A (build from zero); Spec 02 A5 `EXPENSE` movement must **create a linked expense** — the link column is new; Spec 04 needs the shift as the `business_date` source.

---

## 6.8 Inventory

**Status:** IMPLEMENTED.

- **Stock quantity:** stored (not derived) per (product, variant) in `inventory_levels` (`quantity decimal(12,3)`, `lowStockThreshold`, `reorderPoint`, `quantityReserved`, `lastRestockAt`; `quantityAvailable = max(0, quantity − reserved)`). One row per non-variant product (`variant_id IS NULL`), one per variant. **Serialized goods:** on-hand derived by counting `product_serial_units` with `status='IN_STOCK'` (`stockExpr()` `stock-stats.ts:23`).
- **Movement ledger:** active = `InventoryMovement`/`inventory_movements` (`ImmutableBaseEntity`), `MovementType = SALE, RESTOCK_IN, MANUAL_ADJUSTMENT, VOID_REVERSAL, OPENING_STOCK, TRANSFER_IN, TRANSFER_OUT`, with `variant_id` (migration `1784200000000` / local `0059`). Legacy `stock_movements` is effectively **dead** (not written by `InventoryService`).
- **Adjustment flow:** exists (`adjust()` `inventory.service.ts:535`), `StockAdjustmentType = ADD|REMOVE|SET`, writes a `MANUAL_ADJUSTMENT` movement with `quantityBefore/After`, a **free-text `notes`** (required), and `performedById`. **No enumerated reason code.**
- **Negative stock:** **blocked** on both `adjust()` and `deductForSale()` (`INSUFFICIENT_STOCK`).
- **Valuation / COGS:** **not** weighted-average or FIFO — **current stored cost**. Effective cost = `costExpr()` = `AVG(COALESCE(pv.cost_price_override, p.cost_price))` for variant products, else `p.cost_price`. **No `lastCostPrice` field.** Restock records per-receipt `unit_cost` on `restock_items` (used only for the Supplier-Price-Trend report) but **does not recompute** product cost. COGS is **snapshotted** onto `sale_items.cost_price` at sale time (`input.costPrice ?? product.costPrice`).
- **Reorder / low-stock:** `lowStockThreshold` + `reorderPoint` on `inventory_levels`; `setThreshold()`; `getAlerts()` + `inventory-alerts` scheduler (daily 08:00 Douala) + `buildLowStockAlertDigest`. **Expiry / batch / lot:** **DOES NOT EXIST** (serial units ≠ batch).
- **Multi-outlet:** **DOES NOT EXIST** — one business = one location (no `outlet`/`branch`/`warehouse`/`location_id`).
- **Relevance:** Spec 01 §6.4 margin floor (uses this cost basis — do **not** invent a second); Spec 02 B3 `STOCK_ADJUSTED` audit (adjust exists, reason is free-text today); Spec 03 stock alerts (**already built**).

---

## 6.9 Reporting

**Status:** IMPLEMENTED (15 built + ~5 deferred OHADA/tax).

- **Where computed:** both client and server via a shared **neutral model** — data fetched → mapped to typed shape (`packages/types/src/report.types.ts`) → shared builders (`packages/templates/src/report-builders.ts`) → `ReportDocument` → on-screen HTML + PDF/CSV. Catalogue/loaders in `apps/desktop-v2/.../reports/registry.ts`. **No `apps/api` reports module** — the API exposes underlying aggregation endpoints (in sales/inventory/expenses/debts services); desktop assembles reports from them (or computes offline). Aggregation is **per-report**, kept in FE/BE parity by convention ("mirrors the desktop … so both tie out"). Shared SQL fragments only for stock (`stock-stats.ts`).
- **Reports:** Sales (`daily-sales`, `sales-product`, `sales-payment`, `cashier`, `sales-category`, `refunds`); Inventory (`stock-val`, `low-stock`, `stock-moves`, `supplier-price`, `inv-turnover`, `dead-stock`); Financial (`cr` = Income Statement built; `bilan`/`balance`/`tft` deferred); Tax/Receivables (`expense`, `aged-recv`, `aged-pay` built; `tva` deferred).
- **"Profit" — two definitions (reconcile before any digest):**
  1. **Daily summary** (`daily-sales-summary.service.ts:159`): `grossProfit = sale.totalAmount − Σ(costPrice×qty)`, where `totalAmount` includes sale-level charges and is net of **all** discounts. Margin% = `grossProfit / Σ totalAmount`.
  2. **Income Statement** (`getGrossProfit` `sales.service.ts:1149`): `revenue = Σ sale_items.line_total` (net of **line** discounts only, excludes sale-level discount/charges); `cogs = Σ cost_price×qty`; builder then `grossMargin = revenue − cogs`, `operating = grossMargin − totalExpenses`.
     Same snapshot COGS, **different revenue base** → they diverge on sales with sale-level discounts/charges.
- **Period-over-period:** only the Expense Breakdown report (`previousTotal`, `changePct`). No general trend engine.
- **Ageing / low-stock in reports:** both built (`aged-recv`/`aged-pay`, `low-stock`).
- **Relevance:** Spec 03 (digest leads with profit — must pick one definition), Spec 01 §10 (discount reports — new), Spec 02 A10 (Z/X/daily — reconcile with `daily_sale_summaries`).

---

## 6.10 Notifications & messaging

**Status:** PARTIAL (infra real; some channels placeholder).

- Real `NotificationsModule`: `EMAIL` (Resend), `WHATSAPP` (WAHA), `SMS` (**routed via WAHA placeholder** pending a real SMS contract), `IN_APP`. `NotificationType = INVITE, OTP, PAYMENT_REMINDER, MARKETING`; status `PENDING/QUEUED/SENT/DELIVERED/FAILED`. Persisted `Notification` entity. **No push.**
- **Scheduled jobs:** BullMQ + Redis cron server-side (`inventory-alerts` daily 08:00 Douala; `subscriptions.scheduler`). **No client-side scheduler.**
- **Templating:** `packages/templates` HTML/PDF + `order-status-email`; SMS/WhatsApp bodies = plain strings; short strings from API i18n JSON.
- **In-app bell + realtime:** `NotificationItem` feed + `RealtimeService` (Socket.IO) fairly built.
- **Relevance:** Spec 03 (digest delivery + receivables reminders — reuse `PAYMENT_REMINDER`, WhatsApp, in-app bell; a **client scheduler or server cron** is needed for a scheduled digest).

---

## 6.11 Dates, timezones, business day

**Status:** UTC-only; **no business-day / period model** (greenfield for Spec 04).

- **Timezone:** everything **UTC**. Business entity has **no timezone column**. The only tz string is `INVENTORY_LOW_STOCK_TIMEZONE='Africa/Douala'` — cron scheduling only, not day-bucketing.
- **Day-bucketing rule (load-bearing):** a sale's day = **UTC calendar date of `soldAt`** via `soldAt.toISOString().slice(0,10)` → stored `sale_date` column (`sales.service.ts:179` API; `:104,326` desktop). Identical desktop/server so they reconcile. **Trap:** a 23:30 Douala (UTC+1) sale lands on the **next** UTC day.
- **Daily reports:** `GROUP BY sale_date`; materialized `daily_sale_summaries` keyed `(business_id, summary_date=sale.saleDate)`.
- **Timestamp conventions:** Postgres `timestamptz` (snake_case cols, `Date` in code via `dateTransformer`); SQLite **TEXT ISO-8601** (`sale_date` = `YYYY-MM-DD`, `sold_at` = full ISO).
- **Date library:** essentially **none** — native `Date` + `Intl`. Shared `packages/utils/src/date.ts` is thin and **device-local** (`getStartOfDay` uses `setHours(0,0,0,0)` — local, not UTC) — **mismatches** the UTC bucketing. No date-fns/dayjs/luxon/moment in scope.
- **Period / fiscal / lock:** **DOES NOT EXIST.**
- **Relevance:** Spec 04 (all of Part A) — `business_date` (shift-derived), dual `transaction_date`/`posting_date`, periods, close pipeline are entirely new; must resolve UTC-vs-local and the day-boundary source.

---

## 6.12 i18n

**Status:** IMPLEMENTED (FR primary), not shared across apps.

- **Bilingual FR/EN, French primary/fallback.** API: `nestjs-i18n@^10.6.0`, JSON in `apps/api/src/i18n/{en,fr}/` (namespaces auth/errors/notifications/plans/validation), fallback `fr`. Desktop-v2: **hand-rolled** — flat message catalogs (`renderer/src/i18n/messages.ts`, "en is source of truth; fr mirrors every key"), Zustand `useLangStore` + `useT()` hook, default `'fr'`, lookup `catalogs[lang][key] ?? en[key] ?? key`. Not shared with `apps/web`/`apps/mobile` (each reimplements i18n).
- **Strings centralized:** yes — desktop via `useT()` (e.g. 138 call sites in `Sell.tsx`); API via JSON namespaces.
- **Profile-aware vocabulary (Spec 04 §B4):** **not supported today** — lookup is a static `(lang, key)` map with no profile axis and no interpolation layer (`{n}` tokens interpolated manually at call sites). Feasible centrally: add a profile axis to the single `useT()` (`i18n/index.ts:31-34`) — every consumer already routes through it — but it is new work.
- **Relevance:** Spec 04 §B4 (profile-aware terms, e.g. "Clôture du jour" vs "Clôture de période") — route accounting strings through a profile-aware lookup from day one.
