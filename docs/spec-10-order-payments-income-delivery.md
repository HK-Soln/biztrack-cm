# Spec 10 — Online‑order prepayments, Other Income & delivery zones

Three linked initiatives that emerged while hardening the online‑order payment flow. Built as three
slices, in dependency order: **① Other Income + general payment link → ② Order prepayments/COD →
③ Address‑driven delivery zones**. Slice ③'s "arrange delivery separately" path depends on the general
payment link from ①, so ① lands first.

Currency is XAF throughout (exponent 0 — minor == major). No Claude attribution in commits.

---

## Slice ① — Other Income ledger + general payment link

**Why.** The income statement (management P&L, `@biztrack/templates` `buildIncomeStatementReport`,
assembled on desktop from sales + expenses + *other income*) sources "other income" from exactly one
place today: deposit‑cancellation charges (`savings_transactions type='charge'`, summed in
`ExpensesService.getPnlSummary`). There is **no** general income entity. We need one so an arbitrary
payment can be booked as income.

**Model** (mirrors the expense/expense‑category pair):
- `income_categories` — `business_id` nullable (null = system/global, shared), `name`, `slug`, `color`,
  `icon`, `sort_order`. Seed system rows: **Delivery fees**, **Miscellaneous**.
- `other_incomes` — `business_id`, `recorded_by_id`, `category_id`, `description`, `amount` decimal(12,2),
  `currency`, `payment_method` (nullable), `reference` (provider ref, nullable), `source`
  (`MANUAL` | `PAYMENT_LINK` | `DEPOSIT_CHARGE`), `source_id` (nullable link/txn id), `note`, plus the
  BIZ‑5.x financial‑grain columns `date` / `business_date` / `posting_date` / `is_late_arrival` /
  `original_period_id` (same as `expenses`).

**General payment link.** New `PayableType.GENERAL` (partial‑capable). The link is not tied to any
existing row — like `SALE_DRAFT` it self‑describes via `draft_payload`: `{ label, note, incomeCategoryId }`.
Handler `applyPayment` writes an `other_incomes` row (`source='PAYMENT_LINK'`, `source_id=link.id`,
`payment_method`/`reference` from the confirmed attempt). `resolve` returns the link's own amount
(fixed, or 0 = payer chooses). Register in `PayableHandlerRegistry` + `payment-links.module.ts`.

**Income‑statement repoint + deposit‑charge migration.**
- Migration backfills `other_incomes` from every existing `savings_transactions type='charge'`
  (`source='DEPOSIT_CHARGE'`, `source_id=txn.id`, preserving business/posting dates).
- Going forward the deposit‑cancellation flow (`SavingsService`) writes the savings `charge` row (deposit
  ledger movement — unchanged) **and** an `other_incomes` row (income recognition).
- The income‑statement "other income" total now reads from `other_incomes` **only** (repoint
  `getPnlSummary`'s subquery + the desktop `deposits.otherIncome(range)` call → income module), so no
  double‑count.
- Extend the fiscal close snapshot (`FiscalPeriodsService.computeSnapshot`) to also freeze other‑income
  total (today it freezes only sales + expenses).

**Surface.** `IncomeModule` (service + controller + DTOs): create/list (paginated) other income,
list income categories, other‑income‑over‑range summary. Desktop: a "General payment link" generator in
Settings → Payments (amount or open + label + income category + note → create link → `CopyLinkRow`);
reuse the existing link realtime + settlement. Desktop↔API parity: every desktop write has a REST
endpoint + sync metadata.

---

## Slice ② — Online‑order prepayments & COD eligibility

New columns on `online_stores` (+ published snapshot + `PublicStore` + `UpdateOnlineStoreDto` + desktop
order‑config editor):

```
allow_partial_payment      bool default false
partial_min_percent        int  default 50     -- deposit floor, % of order total (1..100)
partial_min_order_amount   int  default 0      -- deposit option only for orders >= this
deposit_required           bool default false  -- when deposit applies, HIDE full COD
cod_min_order_amount       int  default 0      -- below this: no COD
cod_max_order_amount       int  null           -- above this: no COD (null = uncapped)
```

**Eligibility resolver** for order total T:
- **Full online** — any online method enabled.
- **Deposit + rest on delivery** — `allow_partial_payment && T >= partial_min_order_amount`; deposit is a
  free amount in `[ceil(T*min%), T]`.
- **Full COD** — COD enabled `&& cod_min <= T <= cod_max` `&& !(deposit_applies && deposit_required)`.

The `deposit_required` clause resolves the COD/deposit conflation: a required deposit removes full‑COD so
the customer can't bypass it, while "deposit now, rest on delivery" still works. Online‑order links gain
`allow_partial=true` when a deposit is taken; settlement already supports `PARTIALLY_PAID`. Remainder is
collected on delivery via the existing order mark‑paid path (records the true tender onto the order).

---

## Slice ③ — Address‑driven delivery zones (multi‑country)

**Geography reference data** (new tables, seeded from the open **dr5hn countries‑states‑cities** dataset):
`countries` (iso2, name, …), `regions`/`states` (country_id, name), optionally `cities` (region_id, name).
Load countries + regions fully; cities pragmatically (per‑region on demand or a subset). Checkout collects
a structured address: **country (default CM) → region (select) → city (select if available else free text)
→ full street address**.

**Zones** are match‑rules, not a picklist, on `online_stores`:
```
delivery_zones jsonb: [{ id, name, fee, match: { countryIso2?, region?, city? } }]
free_delivery_over_amount int null
unlisted_area_behavior 'BLOCK' | 'DEFAULT_FEE' | 'ARRANGE'
unlisted_default_fee int default 0
```
Fee = most‑specific matching zone (city > region > country); none → `unlisted_area_behavior`.
`free_delivery_over_amount` zeroes the fee. `ARRANGE` lets checkout proceed with the delivery fee "to be
communicated", then the business sends a **general payment link** (slice ①) for it → other income.
Structured address columns are added to `OnlineOrder` + `CheckoutRequest` + `CheckoutView`; the flat
`delivery_fee` + free‑text `delivery_cities` are migrated into the zone model.

---

## Status

- [ ] Slice ① — Other Income + general payment link
- [ ] Slice ② — Prepayments & COD eligibility
- [ ] Slice ③ — Delivery zones (multi‑country)
