# Credit System — Integration Plan
## Debtors, Creditors & Debt Payment Tracking
**BizTrack CM · NestJS + TypeORM + PostgreSQL**
> Planning document — covers architecture decisions, schema changes, new modules, and integration points with Sales and Inventory (Restock) without breaking existing flows.

---

## 1. The Problem in Context

Credit is not an edge case in Cameroonian commerce — it is the default mode of operation for many transactions. Two distinct credit flows exist:

**Customer credit (Debtors):** A customer buys XAF 10,000 worth of goods and pays XAF 6,000 now. The remaining XAF 4,000 is owed to the business. The shop owner trusts them to come back and pay. This is extremely common with regular customers, especially at the end of the month before salaries arrive.

**Supplier credit (Creditors):** The shop owner restocks XAF 150,000 worth of goods from a supplier and pays XAF 80,000 upfront. The remaining XAF 70,000 is a debt owed to the supplier. This is how most small shops manage cash flow — goods come in before full payment goes out.

Both flows need:
1. A record of who the debtor or creditor is (the **Contact**)
2. A record of each credit event tied to a sale or restock (the **Debt**)
3. A way to record partial or full payments against that debt over time (the **Debt Payment**)
4. A running balance that the owner can check at any time

---

## 2. Architecture Decision: One Shared Contact Entity

Rather than building a separate `customers` table and a separate `suppliers` table, both debtors and creditors share a single **`contacts`** table with a `type` field.

**Why:**
- A real-world contact can be both. In Cameroon, a wholesale supplier might also be a customer who buys empty bottles back from you. Separate tables would force duplication.
- The debt payment tracking logic is identical for both sides — only the direction of money flow differs. One `debt_payments` table serves both.
- It reduces the total number of entities to reason about and maintain.

**Contact types:**
- `CUSTOMER` — someone who buys from the business (potential debtor)
- `SUPPLIER` — someone who sells to the business (potential creditor)
- `BOTH` — a contact that plays both roles

---

## 3. Core Concept: What Is a Debt?

A **Debt** is created automatically whenever a sale or restock is confirmed with a credit component. It is never created manually — it is always the consequence of a transaction.

A **Debt Payment** is a partial or full payment made against an existing debt. Multiple payments can be made against one debt until the balance reaches zero (fully settled).

```
Sale (XAF 10,000 total)
  ├── sale_payments: CASH XAF 6,000
  └── debt created: XAF 4,000 owed by customer
        ├── debt_payment: XAF 2,000 on Day 3
        └── debt_payment: XAF 2,000 on Day 7 → debt fully settled

Restock (XAF 150,000 total)
  ├── restock_payments: CASH XAF 80,000
  └── debt created: XAF 70,000 owed to supplier
        └── debt_payment: XAF 70,000 on Day 14 → debt fully settled
```

**Key rule: a debt's `outstanding_amount` is always computed, never stored.**

```
outstanding_amount = original_amount − SUM(debt_payments.amount)
```

Storing it would risk the cached value going stale. It is always derived on read.

---

## 4. Database Schema

### 4.1 `contacts`
Shared table for customers and suppliers.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses | INDEX — row-level tenancy |
| type | enum(ContactType) | `CUSTOMER` \| `SUPPLIER` \| `BOTH` |
| name | varchar(200) | Required. Full name or business name. |
| phone | varchar(30) NULLABLE | Primary phone — also used for WhatsApp receipt/reminder |
| phone_alt | varchar(30) NULLABLE | Secondary phone |
| address | text NULLABLE | Neighbourhood or district (e.g. "Akwa, Douala") |
| notes | text NULLABLE | Internal notes about the contact |
| is_active | boolean DEFAULT true | Soft disable without deleting |
| created_by | uuid FK → users | |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| | | INDEX(business_id, type) |

**No `email` field at this stage.** Email is not how small shop contacts communicate in Cameroon. Phone and WhatsApp are the relevant channels.

---

### 4.2 `debts`
One row per credit event — created automatically from a sale or restock.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses | INDEX |
| contact_id | uuid FK → contacts | INDEX |
| direction | enum(DebtDirection) | `RECEIVABLE` (customer owes us) \| `PAYABLE` (we owe supplier) |
| source_type | enum(DebtSource) | `SALE` \| `RESTOCK` |
| source_id | uuid | FK to `sales.id` or `restock_records.id` depending on `source_type` — not a FK constraint (polymorphic reference) |
| source_reference | varchar(30) | Snapshot of sale_number or restock reference at time of creation — for display without joins |
| original_amount | decimal(12,2) | The credit portion at time of transaction. Immutable once set. |
| status | enum(DebtStatus) | `OUTSTANDING` \| `PARTIALLY_PAID` \| `SETTLED` \| `WRITTEN_OFF` |
| due_date | date NULLABLE | Optional — owner can set a date by which payment is expected |
| notes | text NULLABLE | |
| created_at | timestamptz | When the debt was created (= when the sale/restock was confirmed) |
| settled_at | timestamptz NULLABLE | When status moved to SETTLED |
| written_off_at | timestamptz NULLABLE | When status moved to WRITTEN_OFF |
| written_off_by | uuid FK → users NULLABLE | |
| written_off_reason | text NULLABLE | Required when writing off |
| | | INDEX(business_id, status) |
| | | INDEX(business_id, direction) |
| | | INDEX(business_id, contact_id) |
| | | INDEX(source_type, source_id) — for looking up debt from a sale or restock |

**On `status`:**

| Status | Meaning |
|--------|---------|
| `OUTSTANDING` | No payments made yet. Full amount still owed. |
| `PARTIALLY_PAID` | One or more payments made but outstanding balance > 0. |
| `SETTLED` | All payments received. Outstanding balance = 0. |
| `WRITTEN_OFF` | Owner has decided the debt will not be collected/paid. Excluded from outstanding totals. Audit record retained. |

Status is **always computed and set by the service layer** — never sent by the client. After any payment is recorded, the service recalculates the outstanding amount and updates the status accordingly.

**On `written_off`:**
Writing off a debt is the mechanism for dealing with a customer who will never pay, or a supplier dispute that has been resolved informally. It is distinct from deletion — the original transaction and the debt record remain in the system for audit purposes. Written-off debts are excluded from the "money we expect to receive/pay" totals but are visible in a separate report.

---

### 4.3 `debt_payments`
Immutable payment records against a debt. Each row represents one payment event.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| business_id | uuid FK → businesses | INDEX — denormalised for query performance |
| debt_id | uuid FK → debts | INDEX |
| amount | decimal(12,2) | Must be > 0 and ≤ current outstanding balance |
| method | enum(PaymentMethod) | `CASH` \| `MTN_MOMO` \| `ORANGE_MONEY` |
| mobile_money_reference | varchar(100) NULLABLE | MoMo reference if applicable |
| payment_date | date | The actual date the payment was received/made |
| notes | text NULLABLE | e.g. "Paid via cousin, partial" |
| recorded_by | uuid FK → users | Who recorded this payment |
| created_at | timestamptz | |

**Debt payments are immutable** — they cannot be edited once recorded. If a payment was entered in error, it must be deleted (by owner/manager only), which triggers a status recalculation on the parent debt. Deletion is allowed because a payment entry is a manual act by the owner, not a system-generated event, unlike sales which are immutable.

---

### 4.4 Schema Changes to Existing Tables

#### Changes to `sales`

Three columns are added:

```sql
ALTER TABLE sales
  ADD COLUMN credit_amount    decimal(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN customer_id      uuid REFERENCES contacts(id) NULLABLE,
  ADD COLUMN has_credit       boolean GENERATED ALWAYS AS (credit_amount > 0) STORED;
```

| New Column | Notes |
|------------|-------|
| `credit_amount` | The portion of `total_amount` that was not paid at time of sale. `credit_amount = total_amount − amount_paid`. Computed by the server; default 0. |
| `customer_id` | FK to `contacts`. Required when `credit_amount > 0`. Optional otherwise — the existing `customer_name` free-text field remains for quick anonymous sales. |
| `has_credit` | PostgreSQL generated column — computed automatically. Used as an index filter for the debtors report. |

**Existing rule that changes:**
The current rule states `amount_paid >= total_amount`. This rule is **relaxed** to `amount_paid >= 0 AND amount_paid <= total_amount`. The gap becomes `credit_amount`. When `credit_amount > 0`, the sale requires a `customer_id`.

**`amount_paid` can now be 0** — a fully-on-credit sale where the customer pays nothing upfront. This is valid.

**`change_given` remains** `amount_paid − total_amount` but is now only meaningful when `amount_paid > total_amount` (i.e. the customer overpaid in cash and received change). When `credit_amount > 0`, `change_given` will always be 0.

---

#### Changes to `restock_records`

```sql
ALTER TABLE restock_records
  ADD COLUMN total_amount     decimal(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN amount_paid      decimal(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN credit_amount    decimal(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN supplier_id      uuid REFERENCES contacts(id) NULLABLE,
  ADD COLUMN has_credit       boolean GENERATED ALWAYS AS (credit_amount > 0) STORED;
```

| New Column | Notes |
|------------|-------|
| `total_amount` | Sum of all `restock_items.quantity × unit_cost`. Computed at confirmation. |
| `amount_paid` | Amount paid to supplier at time of restock. May be 0 (full credit), partial, or equal to `total_amount` (fully paid). |
| `credit_amount` | `total_amount − amount_paid`. 0 means fully paid. |
| `supplier_id` | FK to `contacts` (type SUPPLIER or BOTH). Required when `credit_amount > 0`. Optional otherwise. |
| `has_credit` | Generated column — filter for the creditors report. |

A new `restock_payments` table is also needed (mirrors `sale_payments`):

#### New: `restock_payments`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| restock_record_id | uuid FK → restock_records CASCADE | INDEX |
| business_id | uuid FK → businesses | Denormalised |
| method | enum(PaymentMethod) | `CASH` \| `MTN_MOMO` \| `ORANGE_MONEY` |
| amount | decimal(12,2) | |
| mobile_money_reference | varchar(100) NULLABLE | |
| created_at | timestamptz | |

Previously, restocks had a single `total_cost` field. This is now replaced by the `total_amount` / `amount_paid` / `credit_amount` structure, and actual payment methods are tracked in `restock_payments`.

---

## 5. How Credit Integrates Into Existing Flows

### 5.1 Sale Flow With Credit

**No change to the offline-first architecture.** The credit fields are part of the sale payload the client sends. The `debt` record is created server-side when the sale syncs.

**New sale payload fields:**
```
customerId      uuid      required if credit_amount > 0
payments: [...]           same as before — sum of payment amounts = amount_paid
                          credit_amount is computed: total_amount − amount_paid
```

**Server-side sequence (additions to existing §10.1 flow):**

After step 8 (write sale + items + payments), two new steps:

```
9.  If credit_amount > 0:
      a. Validate customer_id exists and belongs to business
      b. Validate contact.type is CUSTOMER or BOTH
      c. Create debt record:
           direction       = RECEIVABLE
           source_type     = SALE
           source_id       = sale.id
           source_reference = sale.saleNumber
           original_amount = credit_amount
           status          = OUTSTANDING
           contact_id      = customer_id
10. Continue with inventory deduction (unchanged)
```

**`daily_sale_summaries` additions:**
```sql
ALTER TABLE daily_sale_summaries
  ADD COLUMN credit_issued    decimal(12,2) DEFAULT 0,   -- total credit given out today
  ADD COLUMN credit_sales     int DEFAULT 0;              -- count of credit sales today
```

The dashboard can now show: "Today: XAF 245,000 revenue — XAF 18,000 on credit (3 sales)."

---

### 5.2 Restock Flow With Credit

**Server-side sequence (additions to existing §9.3 restock flow):**

```
After inventory levels updated:
  If credit_amount > 0:
    a. Validate supplier_id exists and belongs to business
    b. Validate contact.type is SUPPLIER or BOTH
    c. Create debt record:
         direction       = PAYABLE
         source_type     = RESTOCK
         source_id       = restock_record.id
         source_reference = restock_record.referenceNumber
         original_amount = credit_amount
         status          = OUTSTANDING
         contact_id      = supplier_id
```

---

### 5.3 Void Sale With Credit

When a sale with an associated debt is voided:

1. The sale is voided as before (status = VOIDED, inventory reversed)
2. The associated `debt` is **written off automatically** with `written_off_reason = 'Sale voided: {void_reason}'`
3. Any existing `debt_payments` against that debt are **not reversed** — if the customer already paid part of the debt back, that money was real and must be handled manually. The owner is notified via an alert: *"This sale had a partial debt payment of XAF X. Please resolve the balance manually."*
4. If no debt payments exist, the debt is simply written off cleanly.

---

### 5.4 Debt Status Lifecycle

```
OUTSTANDING
    │
    ├──[payment recorded, balance > 0]──→ PARTIALLY_PAID
    │                                          │
    ├──[payment recorded, balance = 0]─────────┴──→ SETTLED
    │
    └──[owner writes off]──→ WRITTEN_OFF

PARTIALLY_PAID
    │
    ├──[payment recorded, balance > 0]──→ PARTIALLY_PAID (stays)
    ├──[payment recorded, balance = 0]──→ SETTLED
    └──[owner writes off]──→ WRITTEN_OFF
```

Status transitions are computed by `DebtService.recalculateStatus()` and called after every payment creation or deletion.

```typescript
async recalculateStatus(debtId: string): Promise<void> {
  const debt = await this.debtRepo.findOne({ where: { id: debtId } })
  const totalPaid = await this.paymentRepo.sum('amount', { debtId })
  const outstanding = Number(debt.originalAmount) - (totalPaid ?? 0)

  let status: DebtStatus
  if (outstanding <= 0) {
    status = DebtStatus.SETTLED
  } else if (totalPaid > 0) {
    status = DebtStatus.PARTIALLY_PAID
  } else {
    status = DebtStatus.OUTSTANDING
  }

  await this.debtRepo.update(debtId, {
    status,
    settledAt: status === DebtStatus.SETTLED ? new Date() : null,
  })
}
```

---

## 6. New Modules Overview

### 6.1 Contacts Module

Manages the shared `contacts` table. Endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | /contacts | List with filters: type, search (name/phone), isActive |
| GET | /contacts/:id | Full contact detail with debt summary |
| POST | /contacts | Create contact |
| PATCH | /contacts/:id | Update contact |
| DELETE | /contacts/:id | Soft delete (is_active = false). Blocked if contact has OUTSTANDING or PARTIALLY_PAID debts. |
| GET | /contacts/:id/debts | All debts for this contact |
| GET | /contacts/:id/statement | Full debt statement: all debts + payments, running balance |

**`GET /contacts/:id` response includes a live debt summary:**
```json
{
  "id": "uuid",
  "name": "Marie Ekotto",
  "type": "CUSTOMER",
  "phone": "+237 6XX XXX XXX",
  "totalReceivable": 24000,
  "totalPayable": 0,
  "openDebts": 2,
  "lastTransactionDate": "2025-04-13"
}
```

---

### 6.2 Debtors Module

A read-oriented module that aggregates receivables (customer debts). Primarily used for the Debtors dashboard and reports.

| Method | Path | Description |
|--------|------|-------------|
| GET | /debtors | All RECEIVABLE debts — filterable by status, contact, date range |
| GET | /debtors/summary | Total outstanding, partially paid, settled this month |
| GET | /debtors/:debtId | Debt detail with full payment history |
| POST | /debtors/:debtId/payments | Record a payment against a receivable debt |
| DELETE | /debtors/:debtId/payments/:paymentId | Delete a misrecorded payment (owner/manager only) |
| POST | /debtors/:debtId/write-off | Write off a receivable debt |

---

### 6.3 Creditors Module

Mirrors the Debtors module for payables (supplier debts).

| Method | Path | Description |
|--------|------|-------------|
| GET | /creditors | All PAYABLE debts — filterable by status, contact, date range |
| GET | /creditors/summary | Total outstanding, partially paid, settled this month |
| GET | /creditors/:debtId | Debt detail with full payment history |
| POST | /creditors/:debtId/payments | Record a payment against a payable debt |
| DELETE | /creditors/:debtId/payments/:paymentId | Delete a misrecorded payment |
| POST | /creditors/:debtId/write-off | Write off a payable debt |

**Note on module separation:** Debtors and Creditors are presented as separate modules in the API and UI because they represent opposite financial directions and are managed by different mental models (chasing money in vs. tracking money owed out). However, they share the same `debts` and `debt_payments` tables — the separation is at the service and controller layer, not the data layer.

---

## 7. Debt Payment Recording

### POST /debtors/:debtId/payments (and /creditors equivalent)

**Permission:** `DEBTS_RECORD_PAYMENT`

**Request body:**
```
amount          number    required    Must be > 0 and ≤ outstanding balance
method          enum      required    CASH | MTN_MOMO | ORANGE_MONEY
paymentDate     date      required    Must not be before the debt's created_at date
mobileMoneyRef  string    optional
notes           string    optional
```

**Business logic sequence:**
1. Fetch the debt — must belong to `businessId`, must not be `SETTLED` or `WRITTEN_OFF`
2. Compute current outstanding: `original_amount − SUM(existing payments)`
3. Validate `amount ≤ outstanding`
4. Write `debt_payments` record
5. Call `DebtService.recalculateStatus(debtId)` — updates debt status to `PARTIALLY_PAID` or `SETTLED`
6. Return updated debt with new outstanding balance and status

**Overpayment is rejected.** If a customer pays more than they owe, the cashier should record only the owed amount and handle the overpayment (change) separately. The system does not model credit balances — that is a future feature.

---

## 8. Contact Statement

`GET /contacts/:id/statement` returns a chronological ledger — the most useful view for an owner trying to understand the full history of a contact.

**Response:**
```json
{
  "contact": { "id": "uuid", "name": "Marie Ekotto", "phone": "..." },
  "openingBalance": 0,
  "entries": [
    {
      "date": "2025-04-01",
      "type": "DEBT_CREATED",
      "reference": "VTE-20250401-0012",
      "description": "Sale on credit",
      "debit": 8000,
      "credit": 0,
      "balance": 8000
    },
    {
      "date": "2025-04-05",
      "type": "PAYMENT",
      "reference": null,
      "description": "Cash payment",
      "debit": 0,
      "credit": 5000,
      "balance": 3000
    },
    {
      "date": "2025-04-13",
      "type": "DEBT_CREATED",
      "reference": "VTE-20250413-0038",
      "description": "Sale on credit",
      "debit": 4000,
      "credit": 0,
      "balance": 7000
    }
  ],
  "closingBalance": 7000,
  "direction": "RECEIVABLE"
}
```

`debit` = amount owed (new debt created). `credit` = amount paid (debt payment). `balance` = running outstanding. This is the format the owner can print or share via WhatsApp with a customer to show them their balance.

---

## 9. Impact on Existing Modules — Change Summary

### Sales Module Changes
| What | Change | Breaking? |
|------|--------|-----------|
| `sales.amount_paid >= total_amount` rule | Relaxed to `amount_paid >= 0` | No — existing sales have `credit_amount = 0` |
| `sales` table | Add `credit_amount`, `customer_id`, `has_credit` | No — new columns with defaults |
| `sale_payments.method` enum | Add `CREDIT` as a value? | **No** — `CREDIT` is NOT a payment method. Credit is modelled as a gap between `total_amount` and `amount_paid`, not as a payment method. This keeps payment reporting clean. |
| `daily_sale_summaries` | Add `credit_issued`, `credit_sales` | No — additive columns |
| Void flow | Add debt write-off step + conditional alert | No — existing voided sales unaffected |
| Sale creation payload | Add optional `customerId` | No — optional field |

### Inventory / Restock Module Changes
| What | Change | Breaking? |
|------|--------|-----------|
| `restock_records` table | Add `total_amount`, `amount_paid`, `credit_amount`, `supplier_id`, `has_credit` | No — new columns with defaults |
| New `restock_payments` table | Tracks payment methods for restocks | No — new table |
| Restock creation payload | Add `supplierId`, `payments[]` array | No — optional fields; existing restocks treated as fully paid |

### No Changes To
- `sale_items` — unaffected
- `inventory_movements` — unaffected
- `inventory_levels` — unaffected
- Products module — unaffected
- Expenses module — unaffected; supplier credit is not an expense
- `sale_payments` enum — `CREDIT` is not added here

---

## 10. RBAC — Permission Requirements

| Action | Permission |
|--------|-----------|
| View contacts | `CONTACTS_VIEW` |
| Create / edit contacts | `CONTACTS_MANAGE` |
| View debtors / creditors | `DEBTS_VIEW` |
| Record debt payment | `DEBTS_RECORD_PAYMENT` |
| Delete misrecorded payment | `DEBTS_DELETE_PAYMENT` |
| Write off a debt | `DEBTS_WRITE_OFF` |

**Role defaults:**

| Role | CONTACTS_VIEW | CONTACTS_MANAGE | DEBTS_VIEW | DEBTS_RECORD_PAYMENT | DEBTS_DELETE_PAYMENT | DEBTS_WRITE_OFF |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| `OWNER` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `MANAGER` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `CASHIER` | ✅ view only | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ACCOUNTANT` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |

**Cashier contact visibility:** A cashier needs to look up a customer's name and phone when recording a credit sale — they have `CONTACTS_VIEW` to enable the contact picker in the sell screen. They cannot create or edit contacts, and cannot see the debt ledger.

**Write-off is owner-only** — writing off a debt is a financial decision with real consequences. Managers can record payments but cannot forgive debts.

---

## 11. Key Design Decisions & Rationale

### Why not a `CREDIT` payment method?
Adding `CREDIT` as a `PaymentMethod` enum value would make payment reporting confusing. The payment breakdown on the sales dashboard (Cash / MTN MoMo / Orange Money collected) would need to exclude `CREDIT` entries to show actual cash received. It is cleaner to model credit as the arithmetic gap (`total_amount − amount_paid`) rather than a payment type. The `sale_payments` table records only real money that changed hands.

### Why is `outstanding_amount` computed, not stored?
Storing a cached `outstanding_amount` would require updating it after every payment — a two-step operation that risks getting out of sync if a payment write succeeds but the update fails. Computing it as `original_amount − SUM(payments)` is always accurate, and the query is fast because `debt_payments` is indexed on `debt_id`. The `status` field is the only cached derived value — it is kept because filtering by status (`WHERE status = 'OUTSTANDING'`) is a critical query path and we do not want a subquery in every list request.

### Why one `debts` table for both directions?
The `direction` column (`RECEIVABLE` / `PAYABLE`) is the only structural difference between a customer debt and a supplier debt. All the logic — payments, status transitions, write-offs, statements — is identical. One table, one service, two controller facades. This is the same principle used for `contacts`.

### Why no auto-generation of recurring debts?
For the same reason recurring expenses are not auto-generated in the expenses module: the edge cases (supplier changes terms, debt is renegotiated, partial write-off) outweigh the automation benefit in v1. Every debt is a direct consequence of a sale or restock — there are no standalone debts created outside of a transaction.

### Why soft-delete for contacts (not hard delete)?
A contact may have historical debts that are SETTLED — the payment history needs to remain meaningful even after the contact stops doing business with the shop. Soft delete (`is_active = false`) hides them from the contact picker in new transactions but preserves the full history.

---

## 12. Implementation Order

### Sprint 10 — Contacts & Schema Migrations
- Migration: `contacts` table
- Migration: add `credit_amount`, `customer_id`, `has_credit` to `sales`
- Migration: add `total_amount`, `amount_paid`, `credit_amount`, `supplier_id`, `has_credit` to `restock_records`
- Migration: `restock_payments` table
- Migration: `debts` table
- Migration: `debt_payments` table
- Migration: add `credit_issued`, `credit_sales` to `daily_sale_summaries`
- Contacts CRUD: `POST`, `GET`, `PATCH /contacts`, soft delete
- `GET /contacts/:id` with live debt summary
- Unit tests: contact type validation, soft delete blocked on open debts

### Sprint 11 — Credit in Sales & Restocks
- Update `POST /sales` — relax `amount_paid` rule, add `customerId`, auto-create debt when `credit_amount > 0`
- Update `POST /sales/:id/void` — add debt write-off step + conditional alert
- Update `daily_sale_summaries` increment to include `credit_issued`, `credit_sales`
- Update `POST /inventory/restock` — add `supplierId`, `payments[]`, auto-create debt when `credit_amount > 0`
- Integration tests: credit sale creates debt, void sale writes off debt, fully-paid sale creates no debt

### Sprint 12 — Debtors & Creditors
- `GET /debtors` — list RECEIVABLE debts with filters
- `GET /debtors/summary` — outstanding totals
- `GET /debtors/:debtId` — detail with payment history
- `POST /debtors/:debtId/payments` — record payment + recalculate status
- `DELETE /debtors/:debtId/payments/:paymentId` — delete misrecorded payment + recalculate status
- `POST /debtors/:debtId/write-off`
- Mirror all of the above for `/creditors`
- `GET /contacts/:id/debts`
- `GET /contacts/:id/statement` — running balance ledger
- Integration tests: overpayment rejected, status transitions, write-off excludes from totals, void with partial payment alert
