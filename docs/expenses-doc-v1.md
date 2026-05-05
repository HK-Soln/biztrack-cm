# Expenses Module
## Complete Documentation — Business Logic, Architecture & Implementation Guide
**BizTrack CM · NestJS + TypeORM + PostgreSQL**

---

## 1. Purpose & Business Context

The Expenses module tracks money leaving the business — everything that is not the cost of goods already captured in inventory restocks. It answers the owner's most important financial question: **"After paying for everything, how much did I actually keep?"**

For a small shop owner in Douala, typical expenses fall into six categories:

- **Loyer** — monthly rent for the shop premises
- **Salaires** — staff wages (cashiers, cleaners, delivery helpers)
- **Électricité / Eau** — ENEO electricity and CDE water utility bills
- **Transport** — moto-taxi fees for supplier runs and deliveries
- **Entretien** — maintenance and repairs (refrigerator, shelving, generator)
- **Divers** — everything else (stationery, packaging, miscellaneous)

These categories are seeded system-wide but each business can also define custom categories for their specific context.

The Expenses module feeds directly into the **Profit & Loss summary**, which subtracts total expenses from gross profit (revenue minus cost of goods) to show net profit. Without accurate expense tracking, the P&L is incomplete and the owner cannot make informed decisions about pricing or staffing.

---

## 2. Key Concepts & Terminology

**Expense** — A single outgoing payment recorded by the business. An expense has a description, amount, date, category, and optionally a vendor name and notes. Expenses can be edited and deleted — unlike sales, they are not immutable.

**Expense Category** — A label that groups expenses for reporting. Categories are either system-wide (seeded, available to all businesses) or business-specific (created by the owner for custom needs). The system enforces that every expense belongs to exactly one category.

**Recurring Expense** — An expense marked as repeating monthly (e.g. rent, salaries). The system does not auto-generate recurring expenses — the `is_recurring` flag is purely informational and used for filtering and planning views. The owner still records each month's instance manually.

**Vendor** — The supplier or payee for an expense. Optional, free-text field. Not linked to any supplier entity at this stage — it is a plain string for display and search purposes.

**Monthly Summary** — A pre-aggregated view of total expenses per business per month, broken down by category. Powers the dashboard expense widget without running aggregate queries on the full `expenses` table.

**Net Profit** — Computed on demand by the reporting layer as:
```
net_profit = gross_profit (from sales) − total_expenses (from this module)
```
This computation is never stored — it is always derived from the two source tables.

---

## 3. Multi-Tenancy

The same rule from every other module applies here without exception:

**Every query on expenses tables must include `businessId` as a condition.**

`businessId` is embedded in the JWT via `Phase2Guard` and injected explicitly into every service method. It is never accepted from the request body — a client cannot claim to belong to a different business by sending a different `businessId` in the payload.

---

## 4. Expense Categories

### 4.1 System-Wide vs Business-Specific

The category model mirrors the `unit_of_measures` pattern established in the Products module:

- Rows where `business_id IS NULL` are **system-wide** — seeded, read-only, available to every business
- Rows where `business_id` is set are **business-specific** — created by the owner, editable and deletable

When fetching categories for a business, the query always returns the union:
```sql
WHERE business_id IS NULL OR business_id = :businessId
```

### 4.2 Seeded System Categories

| Name | Slug | Color |
|------|------|-------|
| Loyer | loyer | #378ADD |
| Salaires | salaires | #1D9E75 |
| Électricité & Eau | electricite-eau | #EF9F27 |
| Transport | transport | #D85A30 |
| Entretien | entretien | #7F77DD |
| Divers | divers | #888780 |

These cover the vast majority of small shop expenses in Cameroon. The owner can add custom categories on top (e.g. "Publicité", "Impôts", "Frais bancaires").

### 4.3 Category Deletion Rule

A system-wide category can never be deleted. A business-specific category can only be deleted if no expenses are currently assigned to it. If expenses exist under that category, the API returns a 422 with code `CATEGORY_IN_USE` and the count of affected expenses. The owner must reassign or delete those expenses first.

---

## 5. Database Schema

### 5.1 `expense_categories`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses NULLABLE | NULL = system-wide; set = business-specific |
| name | varchar(100) | e.g. "Loyer", "Salaires" |
| slug | varchar(110) | lowercase, hyphenated — auto-generated |
| color | varchar(7) | Hex color for UI display — required |
| icon | varchar(50) NULLABLE | Icon name for mobile UI |
| sort_order | int DEFAULT 0 | Display ordering |
| created_at | timestamptz | |
| | | UNIQUE(business_id, slug) NULLS NOT DISTINCT |

---

### 5.2 `expenses`

The core record for each outgoing payment.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses | INDEX — row-level tenancy |
| category_id | uuid FK → expense_categories | INDEX |
| description | varchar(300) | Required. What the expense was for. |
| amount | decimal(12,2) | Must be > 0. In XAF. |
| currency | varchar(10) DEFAULT 'XAF' | Reserved for future multi-currency support |
| expense_date | date | The actual date the expense occurred (not necessarily when it was recorded) |
| vendor | varchar(200) NULLABLE | Who was paid — free text, not a FK |
| notes | text NULLABLE | Additional context from the owner |
| is_recurring | boolean DEFAULT false | Informational flag — does not auto-generate future entries |
| recorded_by | uuid FK → users | Who entered the expense into the system |
| created_at | timestamptz | When the record was created in the system |
| updated_at | timestamptz | When the record was last edited |
| | | INDEX(business_id, expense_date) — for monthly aggregation queries |
| | | INDEX(business_id, category_id) — for category breakdown queries |

**On `expense_date` vs `created_at`:**
These are deliberately separate. `expense_date` is the business date — the day rent was paid or the utility bill was settled. `created_at` is when the owner or manager typed it into the app. An owner might record last Tuesday's transport cost on Friday; `expense_date` will be Tuesday, `created_at` will be Friday. All reports and summaries aggregate by `expense_date`, not `created_at`.

**On `amount`:**
Stored as `decimal(12,2)`. XAF is a whole-unit currency (no cents in practice) but the column allows decimals for future multi-currency scenarios where conversion rates produce fractional values. Display should always round to the nearest whole XAF.

---

### 5.3 `monthly_expense_summaries` (Materialised Cache)

A pre-aggregated monthly summary per business, updated after every create, update, and delete operation on `expenses`.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses | |
| summary_year | int | e.g. 2025 |
| summary_month | int | 1–12 |
| total_amount | decimal(14,2) DEFAULT 0 | Total all categories |
| category_breakdown | jsonb | `{ "loyer": 85000, "salaires": 90000, ... }` keyed by category slug |
| expense_count | int DEFAULT 0 | Number of expense entries |
| recurring_amount | decimal(14,2) DEFAULT 0 | Total of is_recurring = true entries |
| updated_at | timestamptz | |
| | | UNIQUE(business_id, summary_year, summary_month) |

**Why JSONB for `category_breakdown`:**
The number of categories per business is small (6–15) and the breakdown is always read as a whole unit for the dashboard widget. A JSONB column avoids a join to a separate breakdown table and makes the dashboard query a single row fetch. The tradeoff — it cannot be indexed per-category — is acceptable because per-category filtering is done on the `expenses` table directly, not on this summary.

**Rebuild trigger:**
When an expense is created, updated (amount or category changed), or deleted, the affected month's summary row is rebuilt using a single aggregate query:

```typescript
async rebuildMonth(businessId: string, year: number, month: number) {
  const expenses = await this.expenseRepo.find({
    where: {
      businessId,
      expenseDate: Between(
        new Date(year, month - 1, 1),
        new Date(year, month, 0),    // last day of month
      ),
    },
    relations: ['category'],
  })

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const recurring = expenses.filter(e => e.isRecurring).reduce((s, e) => s + Number(e.amount), 0)
  const breakdown: Record<string, number> = {}
  for (const e of expenses) {
    const slug = e.category.slug
    breakdown[slug] = (breakdown[slug] || 0) + Number(e.amount)
  }

  await this.summaryRepo.upsert({
    businessId, summaryYear: year, summaryMonth: month,
    totalAmount: total,
    categoryBreakdown: breakdown,
    expenseCount: expenses.length,
    recurringAmount: recurring,
    updatedAt: new Date(),
  }, ['businessId', 'summaryYear', 'summaryMonth'])
}
```

---

## 6. Business Rules

### 6.1 Create & Edit Rules

1. **`businessId` is always injected from JWT** — never accepted from the request body.
2. **`amount` must be > 0** — zero and negative amounts are rejected with a 422.
3. **`expense_date` must not be in the future** — owners record past or today's expenses. Future-dated expenses are rejected with a 422 (`FUTURE_DATE_NOT_ALLOWED`).
4. **`category_id` must belong to the business** — the category must either be system-wide (`business_id IS NULL`) or belong to the requesting business. A category from another business is rejected with a 422 (`CATEGORY_NOT_FOUND`).
5. **`description` is required** — an expense without a description is meaningless for reporting. Minimum 3 characters.
6. **`recorded_by` is set from JWT on create** and never changes on edit — the system records who originally entered the expense, not who last edited it.
7. **Editing an expense that changes `expense_date`** triggers a rebuild of the old month's summary AND the new month's summary.
8. **Editing an expense that changes `amount` or `category_id`** triggers a rebuild of the affected month's summary.

### 6.2 Delete Rules

1. Expenses can be deleted by `OWNER` and `MANAGER` roles only.
2. Deletion is a **hard delete** — there is no soft delete or void mechanism for expenses. Expenses are owner-entered records, not system-generated events. If an expense was entered in error, deleting it is the correct action.
3. Deleting an expense triggers a rebuild of that month's summary.
4. There is no cascade concern — expenses have no child records.

### 6.3 Recurring Expenses

The `is_recurring` flag is informational only. It:
- Appears as a "Recurring" badge in the UI
- Is available as a filter in the list endpoint
- Is included in `monthly_expense_summaries.recurring_amount`
- Does **not** cause the system to auto-generate next month's entry

This is a deliberate design decision for v1. Auto-generation would require: a scheduler, a mechanism to handle months where the amount changes (rent increase, salary adjustment), and a way to handle months where the expense should be skipped. These edge cases add complexity without proportional value for the target user. A future `v2` feature could offer "duplicate last month's recurring expenses" as a one-tap action.

---

## 7. Expense Categories Endpoints

### 7.1 List Categories

#### GET /expense-categories
**Permission:** `EXPENSES_VIEW`

Returns system-wide categories plus the business's custom categories, ordered by `sort_order` then `name`.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Loyer",
    "slug": "loyer",
    "color": "#378ADD",
    "icon": null,
    "isSystem": true,
    "expenseCount": 4
  },
  {
    "id": "uuid",
    "name": "Salaires",
    "slug": "salaires",
    "color": "#1D9E75",
    "icon": null,
    "isSystem": true,
    "expenseCount": 8
  },
  {
    "id": "uuid",
    "name": "Publicité",
    "slug": "publicite",
    "color": "#D4537E",
    "icon": null,
    "isSystem": false,
    "expenseCount": 2
  }
]
```

`isSystem` is `true` when `business_id IS NULL`. `expenseCount` is the number of expenses currently assigned to this category for this business — used to block deletion in the UI before the API call.

---

### 7.2 Create Custom Category

#### POST /expense-categories
**Permission:** `EXPENSES_CREATE` (owner/manager only)

```
name      string    required    e.g. "Publicité"
color     string    required    Hex color, e.g. "#D4537E"
icon      string    optional
```

Business rules:
- `slug` is auto-generated from `name` (same `SlugService` used by products)
- `businessId` is injected from JWT — this is always a business-specific category
- `sort_order` defaults to `MAX(sort_order) + 1` for the business, placing new categories at the end

---

### 7.3 Update Custom Category

#### PATCH /expense-categories/:id
**Permission:** `EXPENSES_CREATE`

Only `name`, `color`, `icon`, and `sort_order` are editable. System categories (`isSystem: true`) cannot be updated — returns 403 `SYSTEM_CATEGORY_IMMUTABLE`.

---

### 7.4 Delete Custom Category

#### DELETE /expense-categories/:id
**Permission:** `EXPENSES_CREATE`

Business rules:
- System categories return 403 `SYSTEM_CATEGORY_IMMUTABLE`
- If any expenses are assigned to this category, returns 422 `CATEGORY_IN_USE` with `{ "expenseCount": N }`
- On success, returns 204 No Content

---

## 8. Expense Endpoints

### 8.1 List Expenses

#### GET /expenses
**Permission:** `EXPENSES_VIEW`

Query params:
```
page            int         default 1
limit           int         default 20, max 100
dateFrom        date        filter by expense_date >=
dateTo          date        filter by expense_date <=
categoryId      uuid        filter by category
isRecurring     boolean     filter by recurring flag
search          string      search in description and vendor (case-insensitive)
sortBy          enum        expense_date | amount | created_at    default: expense_date
sortOrder       enum        ASC | DESC    default: DESC
```

**CASHIER visibility rule:** A cashier does not have `EXPENSES_VIEW` permission. Expenses are financial information visible only to owners, managers, and accountants.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "description": "Loyer mensuel",
      "amount": 85000,
      "expenseDate": "2025-04-01",
      "category": {
        "id": "uuid",
        "name": "Loyer",
        "slug": "loyer",
        "color": "#378ADD"
      },
      "vendor": "Propriétaire Akwa",
      "isRecurring": true,
      "notes": "Bail commercial mensuel",
      "recordedBy": { "id": "uuid", "name": "Patron Joseph" },
      "createdAt": "2025-04-01T08:12:00Z",
      "updatedAt": "2025-04-01T08:12:00Z"
    }
  ],
  "meta": {
    "total": 10,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "totalAmount": 227500
  }
}
```

`meta.totalAmount` is the sum of `amount` for all matching records across all pages — not just the current page. This lets the UI show "Total filtered: XAF 227,500" without a separate request.

---

### 8.2 Get Expense

#### GET /expenses/:id
**Permission:** `EXPENSES_VIEW`

Returns the full expense record. The `id` must belong to the requesting business — returns 404 if not found or belongs to another business.

---

### 8.3 Create Expense

#### POST /expenses
**Permission:** `EXPENSES_CREATE`

**Request body:**
```
description     string    required    Min 3 chars, max 300
amount          number    required    Must be > 0
expenseDate     date      required    Must not be in the future (ISO 8601: YYYY-MM-DD)
categoryId      uuid      required    Must be system-wide or belong to this business
vendor          string    optional    Max 200 chars
notes           string    optional
isRecurring     boolean   optional    default false
```

**Business logic sequence:**
1. Validate all fields per rules in §6.1
2. Verify `categoryId` is accessible to this business
3. Write the `expenses` record with `recordedBy = userId` from JWT
4. Call `MonthlySummaryService.rebuildMonth(businessId, year, month)` for the expense's month
5. Return the created expense record (201)

**Response:** Full expense object (same shape as GET /expenses/:id)

---

### 8.4 Update Expense

#### PATCH /expenses/:id
**Permission:** `EXPENSES_EDIT`

All fields from the create body are patchable. Only include fields that are changing — omitted fields are not modified.

**Business logic sequence:**
1. Fetch the existing expense — must belong to `businessId`
2. Apply and validate the patch
3. Detect if `expense_date`, `amount`, or `category_id` changed
4. Save the updated record
5. Rebuild affected month summaries:
   - If `expense_date` changed: rebuild both the old month and the new month
   - If `amount` or `category_id` changed (but not date): rebuild the single affected month
   - If only `description`, `vendor`, `notes`, or `is_recurring` changed: no rebuild needed

**`recorded_by` is never updated on edit** — only set at creation.

---

### 8.5 Delete Expense

#### DELETE /expenses/:id
**Permission:** `EXPENSES_DELETE`

**Business logic sequence:**
1. Fetch the expense — must belong to `businessId`
2. Hard delete the record
3. Rebuild the affected month's summary
4. Return 204 No Content

---

### 8.6 Monthly Summary

#### GET /expenses/summary/monthly
**Permission:** `EXPENSES_VIEW`

Query params:
```
year    int    required    e.g. 2025
month   int    required    1–12
```

Returns from `monthly_expense_summaries` — no aggregate query on the full `expenses` table.

**Response:**
```json
{
  "year": 2025,
  "month": 4,
  "totalAmount": 227500,
  "expenseCount": 10,
  "recurringAmount": 175000,
  "oneOffAmount": 52500,
  "categoryBreakdown": {
    "loyer": 85000,
    "salaires": 90000,
    "electricite-eau": 24700,
    "transport": 6000,
    "entretien": 17000,
    "divers": 4800
  }
}
```

If no summary exists yet for the requested month (no expenses have been entered), returns a zeroed response rather than a 404 — an empty month is valid.

---

### 8.7 Date Range Summary

#### GET /expenses/summary/range
**Permission:** `EXPENSES_VIEW`

Query params:
```
dateFrom    date    required
dateTo      date    required    max range: 12 months
groupBy     enum    MONTH | CATEGORY    default: MONTH
```

**When `groupBy = MONTH`:**
Returns an array of monthly totals, assembled from `monthly_expense_summaries`. Used for the trend chart on the expenses dashboard.

```json
[
  { "year": 2025, "month": 1, "totalAmount": 198000 },
  { "year": 2025, "month": 2, "totalAmount": 211500 },
  { "year": 2025, "month": 3, "totalAmount": 220000 },
  { "year": 2025, "month": 4, "totalAmount": 227500 }
]
```

**When `groupBy = CATEGORY`:**
Returns a flat category breakdown across the entire date range, aggregated from `expenses` directly (not the summary cache, since the cache is month-granular):

```json
[
  { "categoryId": "uuid", "name": "Salaires", "slug": "salaires", "color": "#1D9E75", "totalAmount": 360000, "percentage": 40.2 },
  { "categoryId": "uuid", "name": "Loyer",    "slug": "loyer",    "color": "#378ADD", "totalAmount": 340000, "percentage": 38.0 },
  { "categoryId": "uuid", "name": "Électricité & Eau", "slug": "electricite-eau", "color": "#EF9F27", "totalAmount": 98800, "percentage": 11.0 }
]
```

`percentage` is each category's share of the total across the range, rounded to 1 decimal place.

---

### 8.8 Profit & Loss Summary

#### GET /expenses/summary/pnl
**Permission:** `EXPENSES_VIEW`

Query params:
```
year    int    required
month   int    required
```

This is a cross-module endpoint that combines data from the expenses module and the sales module to produce a net profit figure. It is owned by the expenses module because expenses are the final input needed to complete the P&L picture.

**Response:**
```json
{
  "year": 2025,
  "month": 4,
  "revenue": 245000,
  "costOfGoods": 148000,
  "grossProfit": 97000,
  "grossMarginPercent": 39.6,
  "totalExpenses": 227500,
  "expenseBreakdown": {
    "loyer": 85000,
    "salaires": 90000,
    "electricite-eau": 24700,
    "transport": 6000,
    "entretien": 17000,
    "divers": 4800
  },
  "netProfit": -130500,
  "netMarginPercent": -53.3,
  "isProfitable": false
}
```

**How the numbers are derived:**
- `revenue` and `costOfGoods` come from `daily_sale_summaries` aggregated across the month
- `grossProfit = revenue − costOfGoods`
- `totalExpenses` comes from `monthly_expense_summaries`
- `netProfit = grossProfit − totalExpenses`
- `netMarginPercent = (netProfit / revenue) * 100`, rounded to 1 decimal
- `isProfitable = netProfit > 0`

**On a negative `netProfit`:**
This is not an error state — it is valid and common, especially in early months or months with large one-off expenses. The UI should display it clearly without alarming the owner unnecessarily. The negative value is shown with a minus sign and a warning-coloured badge, not a red error screen.

**Implementation:**
```typescript
async getPnl(businessId: string, year: number, month: number) {
  const [salesSummary, expenseSummary] = await Promise.all([
    this.salesSummaryService.getMonthlyAggregate(businessId, year, month),
    this.expenseSummaryService.getMonthly(businessId, year, month),
  ])

  const revenue = salesSummary.totalRevenue
  const cogs = salesSummary.totalCost
  const grossProfit = revenue - cogs
  const totalExpenses = expenseSummary.totalAmount
  const netProfit = grossProfit - totalExpenses

  return {
    year, month,
    revenue, costOfGoods: cogs, grossProfit,
    grossMarginPercent: revenue > 0 ? round1((grossProfit / revenue) * 100) : 0,
    totalExpenses,
    expenseBreakdown: expenseSummary.categoryBreakdown,
    netProfit,
    netMarginPercent: revenue > 0 ? round1((netProfit / revenue) * 100) : 0,
    isProfitable: netProfit > 0,
  }
}
```

---

## 9. Integration With Sales Module

The expenses module integrates with the sales module in a read-only capacity — it reads from `daily_sale_summaries` to build the P&L endpoint. It never writes to sales tables. The sales module has no knowledge of expenses.

The dependency graph is:

```
daily_sale_summaries (owned by Sales)
        ↓ read-only
GET /expenses/summary/pnl
        ↑ read-only
monthly_expense_summaries (owned by Expenses)
```

This unidirectional dependency keeps the modules cleanly separated. If the expenses module is disabled, sales continues to function. If the sales module is disabled, the P&L endpoint returns partial data (expenses only, revenue = 0) rather than failing entirely.

---

## 10. RBAC — Permission Requirements

| Action | Required Permission |
|--------|-------------------|
| View expenses list | `EXPENSES_VIEW` |
| View expense detail | `EXPENSES_VIEW` |
| View monthly summary | `EXPENSES_VIEW` |
| View date range summary | `EXPENSES_VIEW` |
| View P&L summary | `EXPENSES_VIEW` |
| Create expense | `EXPENSES_CREATE` |
| Edit expense | `EXPENSES_EDIT` |
| Delete expense | `EXPENSES_DELETE` |
| List expense categories | `EXPENSES_VIEW` |
| Create custom category | `EXPENSES_CREATE` |
| Edit custom category | `EXPENSES_CREATE` |
| Delete custom category | `EXPENSES_CREATE` |

**Role defaults:**

| Role | VIEW | CREATE | EDIT | DELETE |
|------|:----:|:------:|:----:|:------:|
| `OWNER` | ✅ | ✅ | ✅ | ✅ |
| `MANAGER` | ✅ | ✅ | ✅ | ✅ |
| `CASHIER` | ❌ | ❌ | ❌ | ❌ |
| `ACCOUNTANT` | ✅ | ❌ | ❌ | ❌ |

Cashiers have no access to expenses — financial outgoings are not their concern. Accountants have read-only access for auditing and reporting. Only owners and managers can create, edit, and delete expenses.

---

## 11. Error Responses

| Scenario | HTTP | Code | Message |
|----------|------|------|---------|
| `amount` is zero or negative | 422 | `INVALID_AMOUNT` | "Amount must be greater than 0" |
| `expenseDate` is in the future | 422 | `FUTURE_DATE_NOT_ALLOWED` | "Expense date cannot be in the future" |
| `categoryId` not found or not accessible | 422 | `CATEGORY_NOT_FOUND` | "Category not found" |
| `description` too short | 422 | `DESCRIPTION_TOO_SHORT` | "Description must be at least 3 characters" |
| Expense not found | 404 | `EXPENSE_NOT_FOUND` | "Expense not found" |
| Delete category with active expenses | 422 | `CATEGORY_IN_USE` | "Category has N expenses assigned. Reassign or delete them first." |
| Edit or delete system category | 403 | `SYSTEM_CATEGORY_IMMUTABLE` | "System categories cannot be modified" |
| Insufficient permission | 403 | `FORBIDDEN` | "You do not have permission to perform this action" |
| `dateFrom` > `dateTo` | 422 | `INVALID_DATE_RANGE` | "dateFrom must be before dateTo" |
| Date range exceeds 12 months | 422 | `DATE_RANGE_TOO_LARGE` | "Date range cannot exceed 12 months" |

---

## 12. Implementation Order

### Sprint 8 — Expenses Foundation
- Migrations: `expense_categories`, `expenses`, `monthly_expense_summaries`
- Seed system-wide categories (6 default entries with `business_id = NULL`)
- `MonthlySummaryService` — `rebuildMonth()`, `getMonthly()`, `getRange()`
- `GET /expense-categories` — list system + business categories with `expenseCount`
- `POST /expense-categories` — create custom category with slug generation
- `PATCH /expense-categories/:id` — update custom category (block system categories)
- `DELETE /expense-categories/:id` — delete with `CATEGORY_IN_USE` guard
- `POST /expenses` — create with all business rules + summary rebuild
- `GET /expenses` — list with all filters, sorting, and `meta.totalAmount`
- `GET /expenses/:id` — detail
- Unit tests: summary rebuild correctness, amount validation, future date rejection

### Sprint 9 — Expenses Operations & Reporting
- `PATCH /expenses/:id` — update with multi-month rebuild logic
- `DELETE /expenses/:id` — hard delete + summary rebuild
- `GET /expenses/summary/monthly` — single month from cache
- `GET /expenses/summary/range` — multi-month trend (MONTH grouping) from cache
- `GET /expenses/summary/range?groupBy=CATEGORY` — cross-range category breakdown from raw table
- `GET /expenses/summary/pnl` — P&L cross-module endpoint
- Integration tests: edit changing date triggers two-month rebuild, delete updates summary, P&L combines sales + expenses correctly
- RBAC enforcement tests: cashier blocked on all expense endpoints, accountant blocked on create/edit/delete
