# Canonical profit basis (D7 / BIZ-4.1)

**Decision (owner sign-off 2026-08-23): the Income-Statement basis is canonical.**

## The one definition

> **Revenue = Σ `sale_items.line_total`** — net of line discounts _and_ allocated cart-level
> discounts, **excluding sale-level charges** (delivery, service fees, etc.).
>
> **Gross profit = Revenue − COGS**, where COGS = Σ (`cost_price` × `quantity`).

A sale-level charge is money the customer pays, but it is **not product revenue** and never enters
the profit line. It is settled through tenders and reconciled on the cash side (see below), not in
the P&L.

## Why not `sale.total_amount`

`sale.total_amount` = `subtotal − sale_discount + charges`. It diverges from Σ line_total on any sale
that carries a sale-level charge, and it is not the number that survives contact with SYSCOHADA.
Two shipped surfaces used to disagree because of this; they are now aligned.

## Where it is enforced

| Surface                                                 | Basis        | Source                                                      |
| ------------------------------------------------------- | ------------ | ----------------------------------------------------------- |
| `SalesService.getGrossProfit`                           | Σ line_total | `SUM(sale_items.line_total)` — always canonical             |
| Owner daily digest (`profit`)                           | Σ line_total | reads `getGrossProfit`                                      |
| Income statement report                                 | Σ line_total | reads `getGrossProfit`                                      |
| `daily_sale_summaries.total_revenue` / `gross_profit`   | Σ line_total | **aligned in BIZ-4.1** (writer + migration `1787300000000`) |
| `ExpensesService.getPnlSummary`                         | Σ line_total | reads `daily_sale_summaries` — aligned transitively         |
| Daily-summary endpoint (`SalesService.getDailySummary`) | Σ line_total | reads `daily_sale_summaries`                                |

**Acceptance:** the digest's profit number equals the P&L / income-statement number, exactly.

## The transaction total is preserved separately

`daily_sale_summaries` keeps `total_transacted` = Σ `sale.total_amount` (incl. charges). This is the
**tender-side** total and is what the cash-close reconciliation
(`CashSessionsService` daily report) compares a shift's `SUM(sales.total_amount)` against — so
re-basing `total_revenue` to the accounting figure does **not** produce false "sales rung outside a
session" flags. Reconciliation reconciles cash; the P&L reconciles accounting. They are different
numbers by design and must not be conflated.

## Operational vs financial dates

Independent of the revenue _basis_, financial reads bucket by `posting_date` (BIZ-5.4) and
operational reads by `business_date` (BIZ-5.1). Revenue basis (this doc) and date grain are
orthogonal — do not mix them up.
