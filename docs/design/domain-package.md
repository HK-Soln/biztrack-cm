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
| 6   | Debts and payments: collapse the four copies of debt status; replace the SQLite debt triggers                                                                                                                                                                     | In progress. Done: `debtStanding` replaces the seven copies of debt status. Open: the SQLite debt triggers, waiting on the questions under "Debts: open questions"                                                                 |
| 7   | Catalog: route sync product, variant, category and contact appliers through the domain                                                                                                                                                                            |                                                                                                                                                                                                                                    |
| 8   | Cash sessions, expenses, income, savings, periods, POs and RFQs; replace the leftover two-decimal `round2` / `roundMoney` helpers with `toWholeXaf`                                                                                                               |                                                                                                                                                                                                                                    |

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
| Money rounding outside sales                              | `round2` in debts, expenses, income, inventory, savings                            | `roundMoney` / `round` in the same modules                                                                    | Open, slice 8                                                                                                                    |

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

### Debts: open questions

On the till, SQLite triggers create and update a sale's receivable and a restock's payable
(`0001_initial_schema`). The server does it in code. What each does, read from the code and
confirmed on the till by `sales-debt-characterization.test.ts`:

| Path                               | Till (triggers)                                          | Server                                     |
| ---------------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| Sale with a balance on credit      | Creates the receivable for the balance                   | Same                                       |
| Sale voided                        | Writes the receivable off, even one already paid in full | Writes it off unless it is already settled |
| Everything returned                | Written off (in code, not by the trigger)                | Same                                       |
| Part returned, sale had a balance  | Receivable is set to the sale's new balance              | Receivable is left as it was               |
| Part returned, sale was fully paid | Creates a receivable for the cash handed back            | No receivable                              |
| Restock with a balance on credit   | Creates the payable                                      | Same                                       |
| Sale or restock arriving by sync   | Trigger creates or updates the debt from the pulled row  | n/a: the debt is pulled as its own record  |
| Debt payment added or removed      | Trigger recomputes status; the code now does it too      | In code                                    |

Two of these are wrong on the till today and need a ruling before the triggers are replaced:

1. After a partial return, a sale's balance is worked out as total minus what is still paid,
   without taking off the goods that came back (`settleSaleFromLedger`, on both sides). A
   10,000 sale paid in full, with 2,000 of goods returned for cash, shows a balance of 2,000.
   On the till the trigger turns that balance into a 2,000 receivable for the customer who
   was just refunded. On a part-paid sale the receivable grows by the cash handed back.
2. Voiding a sale whose receivable was already paid in full: the till writes the debt off,
   the server leaves it settled.

Until ruled, nothing here is changed and the triggers stay.

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
