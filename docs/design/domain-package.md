# The shared domain package (`@biztrack/domain`)

One implementation of every business rule, run by the API (REST), the server sync applier,
desktop and mobile. This is Phase A of the program plan; branches and mobile build on it.

## Rules

1. **Business logic lives in `packages/domain` and nowhere else.** A rule is anything that
   decides a number, a status, or whether something is allowed: totals, discounts, stock deltas,
   debt status, settlement, expected cash, due dates, period close, permissions, limits.
2. **The package is pure.** No I/O, no framework, no ambient state. Only relative imports and
   `@biztrack/types`. The clock (`now`), ids and random values are parameters. Enforced by
   `packages/domain/eslint.config.mjs` and by a tsconfig with no DOM or Node typings.
3. **Use cases take a command plus loaded state and return a decision.** The decision is plain
   data: rows to write, stock deltas, debts to open, audit events, or a rejection. They never
   read or write a database.
4. **Entry points are adapters.** A controller, IPC handler, sync handler or service method
   loads state, calls the domain, and applies the decision in ONE transaction. It contains no
   arithmetic and no rule of its own. SQLite adapters (desktop, mobile) are synchronous;
   the TypeORM adapter (API) is async. Pure functions work with both.
5. **Sync is the API path.** The sync applier and the REST controller call the same use case;
   the only differences are the idempotency key and the source tag. The server re-decides and
   never trusts a device-computed total, variance or authorization.
6. **`@biztrack/utils` displays, `@biztrack/domain` computes.** Formatting, phone, slug, routes
   and barcode shape stay in utils. A formatted value never feeds a calculation.
7. **Wording is not domain.** The domain returns codes and types (`OVERRIDE`, `NEGOTIATED`);
   adapters supply display text and translations.

## How a rule is moved (strangler, one rule per change)

1. Pin current behaviour with a test in each runtime that has the rule (characterization test).
2. Write the pure function and its tests in `packages/domain`.
3. Replace each runtime's copy with a call to it. Delete the copy.
4. Run type-check, lint and tests for `@biztrack/domain`, `@biztrack/api` and
   `@biztrack/desktop-v2`.
5. Where the runtimes disagreed, the server's behaviour wins unless it is the bug. Record the
   divergence below and state the behaviour change in the PR.

A new consumer needs the dependency in its `package.json` and, where it resolves workspace
packages from source, an alias. For desktop-v2 that is `electron.vite.config.ts`
(`BUNDLED_WORKSPACE_PKGS`, `MAIN_ALIASES`, renderer alias), `vite.config.web.ts` and
`tsconfig.web.json`.

## Layout

```
packages/domain/src
  money/         whole-XAF rounding, pro-rata allocation, minor units, profit and margin
  sales/         sale pricing, settlement and refund decision, discount policy
  cash/          expected cash and variance
  credit/        due dates, days past due
  inventory/     reorder velocity and digest
  calendar/      business date, fiscal periods, operating hours
  security/      manager PIN strength
  entitlements/  plan permissions, module entitlement
```

## Roadmap and status

| #   | Slice                                                                                                                                                                                                                                                             | Status                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Scaffold the package, purity guard rails, move the rules already shared in `packages/utils`, repoint API and desktop imports                                                                                                                                      | Done                                                                                                                                                                                                                               |
| 2   | Sale pricing: `priceSale` (OVERRIDE model, cart-discount allocation, totals) used by API `computeSale` (REST and sync) and desktop `createSale`                                                                                                                   | Done                                                                                                                                                                                                                               |
| 3   | Sale settlement: `settleSale`, `storedPaymentMethod`, `checkSaleCredit`, `settleSaleFromLedger`, `decideSaleRefund`; used by create, record-payment and refund on REST, sync create and desktop                                                                   | Done                                                                                                                                                                                                                               |
| 4   | Sale use case: `decideSale`, `decideVoid`, `decideRefund` returning every write (items, payments, discounts, stock deltas, serial units, debt, audit, daily summary); server re-evaluates discount authorization on sync; desktop writes wrapped in a transaction | In progress. Done: desktop create, void and refund in one transaction; R1 to R7; review flags (`review_flags` table, `GET /review-flags`, owner notification, the "To review" screen). Open: `decideSale` / `decideVoid` use cases |
| 5   | Stock ledger: one movement model; desktop stock moves off product rows into `inventory_levels`                                                                                                                                                                    |                                                                                                                                                                                                                                    |
| 6   | Debts and payments: collapse the four copies of debt status; replace the SQLite debt triggers                                                                                                                                                                     | Done: `debtStanding` replaces the seven copies of debt status; the SQLite debt triggers are dropped and the till decides debts in code with the same domain rules as the server (R9 to R11)                                        |
| 7   | Catalog: route sync product, variant, category and contact appliers through the domain                                                                                                                                                                            |                                                                                                                                                                                                                                    |
| 8   | Cash sessions, expenses, income, savings, periods, POs and RFQs; replace the leftover two-decimal `round2` / `roundMoney` helpers with `toWholeXaf`                                                                                                               | Done, see "Slice 8 as built". The stock report rounding moves to slice 5                                                                                                                                                           |

Out of scope (owner, 2026-10-11): anything built for mobile. The mobile app will be written
from scratch in its own phase. This initiative makes the API, sync and the desktop run the
same domain functions, and keeps those functions usable by mobile exactly as the others use
them: pure, no SQLite, Electron or NestJS inside. The `DatabaseService` interface that was
slice 9 moves to the mobile phase.

## Divergences found

Each was read in the code. "Fixed" means both runtimes now run one function.

| Rule                                                      | Desktop                                                                            | API                                                                                                           | State                                                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Line total of a bargained line with a fractional quantity | `charged × qty − discount`, rounded once                                           | `listed × qty − round(gap × qty) − discount`; can differ by 1 XAF (0.5 × 995 against listed 1000: 498 vs 497) | Fixed in slice 2: both use the API formula, which reconciles with the discount rows                                              |
| Negative line or cart discount                            | Clamped to 0                                                                       | Accepted on the sync path (REST validates `Min(0)`)                                                           | Fixed in slice 2: clamped to 0                                                                                                   |
| Quantity precision                                        | Used as entered                                                                    | Rounded to 3 decimals                                                                                         | Fixed: `priceSale` prices at 3 decimals itself and the desktop moves stock by the same quantity                                  |
| `change_given` on a credit sale                           | 0                                                                                  | Negative (`amountPaid − total`, not clamped)                                                                  | Fixed in slice 3: 0 everywhere                                                                                                   |
| Stored payment method                                     | `null` with no payments; `MIXED` for any two lines                                 | `MIXED` with no payments; de-duplicates methods first                                                         | Fixed in slice 3: the API rule everywhere. The UI shows "credit" for a sale with nothing paid                                    |
| Returned quantity on refund                               | `Math.floor`                                                                       | Rounded to 3 decimals; REST accepted whole numbers only                                                       | Fixed in slice 3: 3 decimals everywhere, capped at the quantity sold                                                             |
| Refund applied through sync                               | Decided on the device                                                              | Trusted the device refund amount and status; dropped unknown lines and the whole return when no line matched  | Fixed (R1): the server applies what is left of each line, records the till's amount, and raises a review flag where it disagrees |
| A second partial return that completes the sale           | Stayed `PARTIALLY_REFUNDED`                                                        | Same: earlier returns were not counted                                                                        | Fixed (R5): status is decided by total quantity returned on every path                                                           |
| Insufficient stock                                        | Sale proceeds, stock goes negative                                                 | Rejected with `INSUFFICIENT_STOCK`, so a synced sale never reached the server                                 | Fixed (R3) for sales synced from a till: accepted and flagged `NEGATIVE_STOCK`. REST and online orders still reject              |
| Serial unit already sold elsewhere                        | Checked against local stock only                                                   | Rejected with `SERIAL_UNIT_UNAVAILABLE`                                                                       | Fixed (R3) for sales synced from a till: accepted and flagged `SERIAL_ALREADY_SOLD`; the unit stays with the sale that holds it  |
| Discount authorization on a synced sale                   | Evaluated on the device                                                            | Not re-evaluated; flags trusted from the payload                                                              | Fixed (R2): re-checked against the limits in force when the sale was made; a disagreement is a review flag                       |
| Refunds in profit                                         | Refunded and partially refunded sales dropped out of the Income Statement entirely | Same, while the daily summary kept their full revenue                                                         | Fixed (R4): one rule in `sale-profit.ts`, used by the Income Statement queries on both sides and by the daily summary            |
| Savings on refund                                         | Not reversed                                                                       | Not reversed                                                                                                  | Decided (R8): not reversed. Giving savings back goes through the savings flow                                                    |
| Cart preview in the renderer (`Sell.tsx`)                 | Rounds to 2 decimals                                                               | n/a                                                                                                           | Fixed: the sell screen totals come from `priceSale`                                                                              |
| Money rounding outside sales                              | `round2` in debts, expenses, income, inventory, savings                            | `roundMoney` / `round` in the same modules                                                                    | Fixed in slice 8: whole francs through `toWholeXaf`, except the stock reports (slice 5)                                          |

## Rulings

Decisions the owner made on how the rules behave. Each records the reasoning so it stays with
the code. Sales and refunds made at an offline till are facts that already happened: the
server records them and raises a flag for the owner; it does not reject or rewrite them.

### R1. Refund synced from a till (2026-10-11)

Record the till's refund amount as it is, and flag the sale when the server would have
computed a different amount. The cash has already left the drawer, so overriding the amount
would make the books disagree with the drawer. Raise the flag to high severity when the
refund is more than what was paid on the sale: that is either a typo or theft, and the owner
should see it first.

### R2. Discount authorization on a synced sale (2026-10-11)

The server re-checks the discount; it never rejects the sale, it flags it as unauthorized.

- Check against the cashier's limits as they were when the sale happened, not today's.
  Limits can change between the sale and the sync, and a sale that was valid when it was made
  must not be flagged later.
- When the till recorded a manager PIN approval, check that the approving manager's own limit
  covered the discount. The sale is flagged only if the manager's limit did not.
- The server keeps every version of a role's limits (a versions table). It is seeded with
  the limits in force on the day it is deployed, so recorded history starts on day one and
  not at the first edit. For a sale older than the history, the till's own verdict stands.
- The till sends which limit version it used. Roles only reach a till when it syncs, so a
  till can sell under old limits for a while after they change. With the version on the
  sale the server can tell "the till had old limits" (low severity) from "this went over the
  limit" (the real flag). Without it, every limit change would set off a burst of false
  alarms. (Added 2026-10-11.)

### R3. Selling stock the server does not have (2026-10-11)

Accept the synced sale and flag the negative stock. A till cannot know the true stock while
offline, and rejecting the sale loses a real sale, which is worse than negative stock. The
same rule applies to serial-numbered items: when the serial was already sold elsewhere,
accept the sale and flag the conflict. The flag carries the place the stock belongs to, so
it can be raised per branch once branches exist.

### R4. Refunds in the daily summary and the Income Statement (2026-10-11)

A refund reduces the revenue of the day the refund happens.

- Subtract the goods value actually charged after discounts, not the list price.
- Reverse the cost of goods for items put back into stock; otherwise the day's profit comes
  out too low. Items not restocked keep their cost.
- The Income Statement uses the same rule as the daily summary, so there is one definition
  of profit (decision D7).
- Stored summaries from before this rule ignore every past refund. A one-time rebuild
  corrects them and reports how much each total changed.

### R5. When a sale becomes "refunded" (2026-10-11)

A sale is refunded when the total quantity returned across all its returns equals the
quantity sold on every line; otherwise it is partially refunded. The decision compares
quantities, never amounts, so charges and rounding cannot leave a sale stuck as partially
refunded.

### R6. Voiding a sale that has refunds (2026-10-11)

A void cancels what is still sold.

- A fully refunded sale cannot be voided: nothing of it is left to cancel.
- A partly refunded sale is voided only for the balance left after its refunds. Only the
  quantity not yet returned goes back into stock, and only the revenue and cost not already
  taken off by the refunds are removed, so no refund is subtracted twice.

`decideSaleVoid` in `packages/domain/src/sales/sale-settlement.ts` makes the decision for
REST, sync and desktop. A void synced from a till for a fully refunded sale is left as it
is.

### R7. The day a refund is booked (2026-10-11)

A refund is booked on the trading day it is made, not the day of the sale and not the day
it reaches the server. The return carries its own `business_date`; a till sends it with the
time of the return, and the server uses the till's time for the refund payment and the
daily summary.

### R8. Savings used on a refunded sale (2026-10-11)

A refund does not give back customer savings that were used to pay for the sale. Returning
savings to a customer is its own action in the savings flow, with its own record; a refund
only decides the goods and the money handed back at the till.

### R9. What a customer owes after a partial return (2026-10-11)

Goods that came back are no longer owed for. A sale's balance is (total less the value of the
goods returned) less (what was paid less what was refunded), never below zero. Before, the
goods were not taken off, so a sale paid in full and partly refunded showed a balance, and on
the till that balance became a debt for the customer who had just been refunded.

### R10. Returning goods on a sale that still has a balance (2026-10-11)

The returned goods reduce the debt first. Money is handed back only for the value beyond
what is still owed. A customer who owes 6,000 and returns 2,000 of goods gets no cash and
owes 4,000.

### R11. Voiding a sale whose debt was paid in full (2026-10-11)

The debt stays settled: the money was received. Only a debt with something still owed is
written off by a void. The till used to write off a settled debt; the server did not.

### R12. A catalog record that breaks a rule (2026-10-16)

The till enforces the same catalog rules as the server before it saves, and the server's
sync path enforces them too and refuses what fails. Unlike a sale at the counter, a catalog
record (product, variant, category, unit, contact) is not a fact that already happened, so
refusing it loses nothing; checking on the till first means a current till never produces
one the server will refuse.

### R13. Stock tracking by product type (2026-10-16)

The server's rule: a service or a bundle (composite) holds no stock, a product sold by
quantity (variable quantity) is always tracked, and a simple product follows its own
"track stock" setting, which may be off.

### R14. Variant products (2026-10-16)

A variant product needs at least one variant. More can be added later.

### R15. Prices (2026-10-16)

A selling price can never be negative, on every path: the form, the till, the server and
the sync. Zero is allowed.

### R16. Contacts (2026-10-16)

- Only the name is required. A phone number is optional; when given it must be a valid
  number from any country.
- The name is unique in the business, compared by its slug (so "Kemi Stores" and
  "kemi-stores" are the same name). A database constraint holds it on both sides.
- A new contact whose phone number or email is already on another contact is refused by
  default with `CONTACT_DUPLICATE`, on the server and the till alike. The screen then asks:
  merge into the existing contact (and take the new name if it differs), create it anyway
  as a separate contact, or cancel.
- As built: `packages/domain/src/contacts/contact-rules.ts`; `contacts.name_key` with
  index `unq_contacts_business_name_key` (API migration 1790700000000, device 0086; names
  already shared get a numbered key). Sync refuses a name already taken but accepts a shared
  phone or email (the till already asked). A merge keeps the existing contact’s opening
  balance; one typed on the form applies only to a new contact.

### R17. SKUs and barcodes (2026-10-16)

- A product created on the till gets its SKU on the till, by the same rule the server uses.
- A barcode is optional. When given it is any non-empty text, unique in the business; it
  does not have to follow a barcode standard or carry a check digit.
- No barcode is made up: a product created without one, on the server or the till, has
  none (owner, 2026-10-16). Barcodes the server generated earlier are kept.

### R18. Deletions arriving by sync (2026-10-16)

A product, variant or serial unit deleted on a till is deleted on the server exactly as the
server's own delete does it, including writing off its remaining stock.

### R19. Partly refunded sales in the sales reports (2026-10-16)

Every sales report counts a partly refunded sale, net of its refunds, as the income
statement does (R4): the period summary, the cashier figures and the discount reports, not
only profit.

### R20. Online buyers are not contacts (2026-10-16)

An online order no longer creates a contact. The order keeps the buyer’s details, and a
per-business list of online customers, matched by phone or email, remembers returning
buyers (orders, addresses, amount spent) with no rule on unique names. A buyer becomes a
contact only when the shop adds them, through the normal contact rules (R16). The unpaid
part of a cash-on-delivery order is money with the courier, not credit: it stays on the
order until it is collected at delivery or pickup, so a sale from an online order may carry
an unpaid balance with no contact, and receivables remain for real credit customers. Login
is not required to check out.

As built: `packages/domain/src/online/online-customers.ts` (onlineBuyerKeys,
findOnlineCustomer) and, in sale-settlement, `checkSaleCredit` with `collectedOnDelivery`
plus `saleOpensDebt`. The server grants `collectedOnDelivery` only to a sale for a real
online order of the business, so a till cannot use it. API: `online_customers`,
`online_orders.online_customer_id` (migration 1790800000000 files existing orders under
their buyers and keeps any contact an old order’s sale was charged to),
`GET /online-store/customers`, `POST /online-store/customers/:id/contact`. Desktop and
browser: Online → Customers screen and an Add to contacts action on the order drawer.
Contacts and debts that earlier orders created are left as they are.

### How the rulings are implemented

Which flag to raise and how serious it is, is decided in `packages/domain/src/review`
(`reviewSyncedRefund`, `reviewStockAfterSyncedSale`, `reviewSerialAlreadySold`). The API
stores the drafts in `review_flags` inside the same transaction as the sale
(`ReviewFlagsService.raise`, idempotent on business, code and dedupe key), then notifies the
owner once it commits; a HIGH flag is sent as urgent. `GET /review-flags` lists them most
serious first, `GET /review-flags/count` gives the open count, and
`POST /review-flags/:id/resolve` closes one.

#### The review screen

"To review" (`/activity/review`, under Organization in the sidebar) lists the flags, open
or resolved, filtered by level and kind. A row opens a drawer with what happened in a
sentence, what to do about it, the numbers, a link to the sale (and to the other sale for a
serial sold twice) and a note to resolve it with. The sidebar entry carries the open count,
the activity page shows a line when something is waiting, and the owner's notification
opens the screen.

- Who may see it is one rule, `canReviewFlags` in `packages/domain/src/review`: the owner,
  an active member whose assigned role can authorize, or a built-in manager with no role
  assigned. The API enforces it on all three endpoints (`REVIEW_FLAGS_FORBIDDEN`); the
  screen only hides itself for everyone else.
- The list returns each flag with the sale number and the name of who resolved it.
- Flags stay on the server. The desktop reads them through the main process
  (`review-flags.service.ts`) and the browser build through `cloudReviewFlags`, so the
  screen needs a connection on both; offline it says so and the rest of the app is
  unaffected.
- The wording for each kind of flag is in the renderer
  (`components/activity/review-flag-format.ts`). A new flag code needs a title, a sentence
  and a next step there, in both languages. `DISCOUNT_UNAUTHORIZED` has one of each per
  reason (`OVER_LIMIT`, `APPROVER_LIMIT`, `TILL_OLD_LIMITS`).

#### R2 as built

`reviewSyncedDiscount` (`packages/domain/src/review/sync-review.ts`) decides the flag;
`discountNeedsAuthorization` (`sales/discount-policy.ts`) is the one rule for "this discount
needs a manager", used by REST create, the till and the re-check.

- History: `role_limit_versions` holds every version of a role's four discount fields;
  `roles.limits_version` is the current one. `RolesService` writes a version when a role is
  created and when an edit really changes the policy (`sameDiscountPolicy`), in the same
  transaction. The migration seeds one version per role, effective from the moment it runs.
- The till: the role arrives with `limitsVersion`. Each sale stores the role and version it
  was checked against (`sales.discount_role_id`, `sales.discount_limits_version`) and sends
  them as `discountPolicy`. A sale pushed again for a refund or void sends the same values
  and the same discount rows; before, that payload dropped the till's verdict.
- The server, for a sale synced from a till that has discount rows
  (`sales-discount-review.query.ts` loads, the domain decides):

  | What the server finds                                                         | Result                                                   |
  | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
  | Within the cashier's limits in force when the sale was made                   | Nothing                                                  |
  | The till already recorded the discount as unauthorized                        | Nothing: both agree                                      |
  | No version of the role reaches back to the sale                               | Nothing: the till's verdict stands                       |
  | Over the limits, a manager approved, within that manager's limits at the time | Nothing                                                  |
  | Over the limits, a manager approved, over that manager's limits too           | `DISCOUNT_UNAUTHORIZED`, medium, reason `APPROVER_LIMIT` |
  | Over the limits, nobody approved, within the limits the till still had        | `DISCOUNT_UNAUTHORIZED`, low, reason `TILL_OLD_LIMITS`   |
  | Over the limits, nobody approved, otherwise                                   | `DISCOUNT_UNAUTHORIZED`, medium, reason `OVER_LIMIT`     |

Choices made while building it:

- The till's discount rows are stored as sent. The server's disagreement is the flag; it
  does not rewrite `unauthorized` on the rows.
- A till that names no version (an older build, or a role it pulled before versions
  existed) is taken to have had the version before the one in force.
- The cashier's role is the one the till names when it belongs to the business, otherwise
  the role the cashier holds now. The approving manager's role is the one held now; only
  the limits are taken as at the sale. Role assignments have no history.
- A manager's approval covers a below-cost sale whatever the manager's own below-cost
  setting; only the percentage and amount limits are checked against the manager.
- A sale with no discount rows is not re-checked, so a line sold at its listed price below
  cost is not covered.
- REST and online sales are decided by the server at the time, so nothing is re-checked.

R4 is one rule, `packages/domain/src/sales/sale-profit.ts` (`refundProfitImpact`,
`netSalesProfit`, `PROFIT_SALE_STATUSES`):

- The API loads revenue and cost of goods in one place,
  `apps/api/src/modules/sales/services/sales-profit.query.ts`, used by both
  `GET /sales/gross-profit` and the P&L summary. Desktop `grossProfit` applies the same rule
  to SQLite.
- `DailySalesSummaryService.applyRefund` subtracts a refund from the summary of the day it is
  recorded, on REST refunds and synced refunds, and adds it to the new `total_refunds`.
- Migration `1790400000000-daily_summary_refunds_rebuild` rebuilds revenue, cost and gross
  profit of every stored summary from source, writes one row per changed summary to
  `daily_sale_summary_rebuilds` (before and after), and prints the totals in the deploy log.

The by-product and by-payment reports follow the same rule on both sides
(`netSalesByProduct`; payments net of refund payments). A refunded or partly refunded sale
stays in them; a voided one never does.

Limits, as built:

- The daily summary is keyed by UTC day (as it is for sales), while the Income Statement
  uses the return's trading day. Returns recorded before R7 have no trading day and fall
  back to the UTC day they were recorded.
- The cash side of the daily summary (`total_transacted` and the tender columns) is
  unchanged; refund payments are netted in cash-session reconciliation, as before.
- The other desktop sales reports (range summary, cashier roster, discount reports) still
  count completed sales only.
- By-product totals round per product and return, so they can differ from the Income
  Statement by a franc or two.
- Voiding a partly refunded sale that was paid from a customer deposit still gives the
  whole deposit payment back. Not handled.

Release blockers for this branch (owner, 2026-10-11):

1. A screen for the review flags. Done: see "The review screen" below. Not yet looked at
   on a running app.
2. A test harness for sync writes. Done: see "Integration tests" below.
3. Both new migrations run against a real Postgres. Done: the owner ran them, and the
   integration tests apply every migration to a fresh database on each run.
4. R2, with the role-limit versions table and the version sent by the till. Done: see
   "R2 as built" above. Migration `1790500000000-role_limit_versions` has to run on
   deploy, and tills need the new build to send the version.

### Debts as built (slice 6)

One set of rules in `packages/domain`, called by the API and the till:

- `debtStanding` / `debtSettledAt` (`credit/debt-status.ts`): where a debt stands from what
  was owed and what was paid, in whole francs; the date it was first settled is kept.
- `settleSaleFromLedger` takes the value of the goods returned (R9).
- `decideSaleRefund` takes what is still owed and returns `debtReduction` with the money to
  hand back; `returnDebtReduction` is the same sum for a refund a till already made (R10).
- `reduceDebt` brings a debt down, never below what was paid against it (R10).
- `debtCanBeWrittenOff`: a settled debt stays settled (R11).

On the till, SQLite triggers used to create and update a sale's receivable and a restock's
payable, and recompute a debt when a payment row changed. Desktop migration `0085` drops
them. What each path does now:

| Path                             | Now                                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| Sale with a balance on credit    | `DebtsService.createSourceDebt`, id `debt:sale:<sale id>`, with the due date and trading day    |
| Restock with a balance on credit | The same, id `debt:restock:<restock id>`                                                        |
| Sale voided                      | `writeOffSourceDebt`, unless the debt is settled (R11)                                          |
| Everything returned              | `writeOffSourceDebt`                                                                            |
| Part returned                    | `reduceSourceDebt` by the decision's `debtReduction` (R10)                                      |
| Debt payment added or removed    | `debtStanding` in the payment, offset and sync-pull code                                        |
| Sale or restock arriving by sync | No debt is derived from the pulled row; the debt arrives as its own record and lands on that id |

The debt of a sale or restock is still not pushed by the till: the server creates its own
when the sale or restock syncs, as before.

Repairs for what the old behaviour left behind:

- Desktop migration `0085` works out the balance of every partly returned sale again and
  sets its receivable to it, or removes the receivable when nothing was ever owed and nothing
  was paid against it.
- API migration `1790600000000-sale_balance_after_returns` recomputes `credit_amount` of
  sales with returns. Server debts are not touched: the server never changed a receivable on
  a partial return. `updated_at` is left alone so the sales are not re-sent to every till.

Limits, as built:

- Money paid on a sale's debt counts as received when a return is decided, so it can be
  refunded. The refund is recorded on the sale's payments; when it is more than was paid at
  the till, the sale's own "paid" figure stops at zero and its balance can differ from the
  debt by that amount. The debt is the figure to trust.
- A till on an older build still hands the money back on a partial return of a credit sale.
  The server keeps that amount and leaves the debt as it was; no flag is raised for it.
- The API migration's value of returned goods is rounded once per sale; the domain rounds
  per return, so a balance can differ by a franc on sales with several returns of weighed
  goods.

### Slice 8 as built

Each rule below used to be written separately on the API, the till and, in places, the
screen. Each is now one function in `packages/domain`, in whole francs:

| Area                         | Domain                                                                                                                              | Called by                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Receiving stock              | `settleRestock`, `restockTotals`, `restockAdjustmentAmount`, `checkRestockCredit`                                                   | API receive (REST and sync), till receive, receive screen totals                  |
| Purchase orders              | `priceOrderLines`, `checkPurchaseOrder`                                                                                             | API and till create/convert, order documents on both sides, order form            |
| Expense and income summaries | `summarizeAmounts`, `comparisonPeriod`, `roundPercent`                                                                              | API expense summary, new `GET /income/summary`, till expense and income summaries |
| Income statement             | `incomeStatement`                                                                                                                   | API P&L, the report builder in `@biztrack/templates`                              |
| Customer savings             | `savingsDeposit`, `savingsPurchase`, `savingsPurchaseReversal`, `decideSavingsClose`, `savingsRefundable`, `savingsRunningBalances` | API and till savings services, the deposit-close screen                           |
| Debt payments and offsets    | `checkDebtPayment`, `planDebtOffset`                                                                                                | API and till debt services                                                        |
| Cash drawer                  | `countDrawer`, `computeCashVariance`                                                                                                | API and till close of a cash session                                              |

What changed for a user:

- The till refuses a receipt whose payments are more than the invoice total. Before, it
  saved it and the server rejected it on sync, leaving it stuck.
- A receipt on credit made through the API needs the supplier invoice, as the screen and the
  till already required. Receipts synced from a till only need a supplier, as before.
- The till refuses a sale paid from more savings than the customer has, or from a closed
  session. Before, it saved the sale as paid from savings without taking anything off.
- Category shares show one decimal on the till (they were whole percents) and the change
  against the previous period one decimal (it was two), as the server showed them.
- The browser build's income summary comes from the server: it now has the change against
  the previous period and the average per day, and is no longer limited to 1,000 entries.
- Quote totals, expense and income amounts, and money arriving through sync are stored in
  whole francs.

Not done here: the stock reports (stock value, supplier price history) still round to two
decimals; they move with slice 5. Unit costs keep their decimals: a cost per unit can be a
fraction of a franc, the totals built from it cannot.

### Integration tests

`pnpm --filter @biztrack/api run test:integration` runs the real sales write path against a
real Postgres: `SalesService` with the real inventory, debts, daily-summary and review-flag
services (`apps/api/src/testing/sales-sync-harness.ts`). Only notifications, the audit
queue, documents, the calendar, posting periods and customer deposits are stand-ins.

- The database is `TEST_DATABASE_URL`, or the `DATABASE_URL` server with
  `_integration_test` added to the database name. It is created on first use and every
  migration is applied. The name must end in `_test`, so the tests cannot touch real data.
- Each test seeds its own business, so tests do not see each other's rows.
- Tests live in `__integration__` folders as `*.int-spec.ts`; the unit run does not pick
  them up. CI runs them in the migrations job, which already has a Postgres.
- `sales-sync.int-spec.ts` covers a synced sale, a repeated push, negative stock, an
  already-sold serial, synced refunds (the day booked, cost kept when not restocked, a
  refund above the amount paid, above the goods value, with an unknown line, a second
  return completing the sale) and voids after refunds, on REST and through sync.

Add a case here whenever a rule changes what the server writes for a synced sale.

Accepted for now: `review_flags.outlet_id` stays empty until the branch work in Phase B
fills it. The desktop does not store review flags; it reads them from the server when
the screen is open.

### Earlier rulings (slice 3, 2026-10-10)

- Change on a credit sale is 0, never negative.
- The stored payment method of a sale with no payment is `MIXED`; when every payment line
  uses one method, it is that method. The UI shows "credit" for a sale with nothing paid.
- A returned quantity may have up to three decimals, so part of a weighed line can come back.
