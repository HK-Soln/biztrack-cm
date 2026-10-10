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

| #   | Slice                                                                                                                                                                                                                                                             | Status                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Scaffold the package, purity guard rails, move the rules already shared in `packages/utils`, repoint API and desktop imports                                                                                                                                      | Done                                                                                                                                              |
| 2   | Sale pricing: `priceSale` (OVERRIDE model, cart-discount allocation, totals) used by API `computeSale` (REST and sync) and desktop `createSale`                                                                                                                   | Done                                                                                                                                              |
| 3   | Sale settlement: `settleSale`, `storedPaymentMethod`, `checkSaleCredit`, `settleSaleFromLedger`, `decideSaleRefund`; used by create, record-payment and refund on REST, sync create and desktop                                                                   | Done                                                                                                                                              |
| 4   | Sale use case: `decideSale`, `decideVoid`, `decideRefund` returning every write (items, payments, discounts, stock deltas, serial units, debt, audit, daily summary); server re-evaluates discount authorization on sync; desktop writes wrapped in a transaction | In progress: desktop create, void and refund run in one transaction (`DatabaseService.transaction`). Use cases and server re-decision not started |
| 5   | Stock ledger: one movement model; desktop stock moves off product rows into `inventory_levels`                                                                                                                                                                    |                                                                                                                                                   |
| 6   | Debts and payments: collapse the four copies of debt status; replace the SQLite debt triggers                                                                                                                                                                     |                                                                                                                                                   |
| 7   | Catalog: route sync product, variant, category and contact appliers through the domain                                                                                                                                                                            |                                                                                                                                                   |
| 8   | Cash sessions, expenses, income, savings, periods, POs and RFQs; replace the leftover two-decimal `round2` / `roundMoney` helpers with `toWholeXaf`                                                                                                               |                                                                                                                                                   |
| 9   | `DatabaseService` interface so `electron-core` stops importing `better-sqlite3` and Electron directly (unblocks mobile and the shared sync engine)                                                                                                                |                                                                                                                                                   |

## Divergences found

Each was read in the code. "Fixed" means both runtimes now run one function.

| Rule                                                      | Desktop                                                 | API                                                                                                           | State                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Line total of a bargained line with a fractional quantity | `charged × qty − discount`, rounded once                | `listed × qty − round(gap × qty) − discount`; can differ by 1 XAF (0.5 × 995 against listed 1000: 498 vs 497) | Fixed in slice 2: both use the API formula, which reconciles with the discount rows           |
| Negative line or cart discount                            | Clamped to 0                                            | Accepted on the sync path (REST validates `Min(0)`)                                                           | Fixed in slice 2: clamped to 0                                                                |
| Quantity precision                                        | Used as entered                                         | Rounded to 3 decimals                                                                                         | Open: `priceSale` takes the quantity as given; the API rounds before calling                  |
| `change_given` on a credit sale                           | 0                                                       | Negative (`amountPaid − total`, not clamped)                                                                  | Fixed in slice 3: 0 everywhere                                                                |
| Stored payment method                                     | `null` with no payments; `MIXED` for any two lines      | `MIXED` with no payments; de-duplicates methods first                                                         | Fixed in slice 3: the API rule everywhere. The UI shows "credit" for a sale with nothing paid |
| Returned quantity on refund                               | `Math.floor`                                            | Rounded to 3 decimals; REST accepted whole numbers only                                                       | Fixed in slice 3: 3 decimals everywhere, capped at the quantity sold                          |
| Refund applied through sync                               | Decided on the device                                   | `applyRefundFromSync` trusts the device refund amount, payment and status; unknown lines are dropped silently | Open, slice 4: the server should re-decide with `decideSaleRefund`                            |
| A second partial return that completes the sale           | Stays `PARTIALLY_REFUNDED`                              | Same: earlier returns are not counted                                                                         | Open, slice 4 (same on both sides today)                                                      |
| Insufficient stock                                        | Sale proceeds, stock goes negative                      | Rejects with `INSUFFICIENT_STOCK`                                                                             | Open, slice 4 or 5 (needs a product decision for offline tills)                               |
| Discount authorization on a synced sale                   | Evaluated on the device                                 | Not re-evaluated; flags trusted from the payload                                                              | Open, slice 4                                                                                 |
| Refund and the daily sales summary                        | No summary table                                        | Create and void adjust it; refund does not                                                                    | Open, slice 4                                                                                 |
| Savings on refund                                         | Not reversed                                            | Not reversed                                                                                                  | Open, slice 4 (decide the rule)                                                               |
| Cart preview in the renderer (`Sell.tsx`)                 | Rounds to 2 decimals                                    | n/a                                                                                                           | Open: the renderer should call `priceSale`                                                    |
| Money rounding outside sales                              | `round2` in debts, expenses, income, inventory, savings | `roundMoney` / `round` in the same modules                                                                    | Open, slice 8                                                                                 |

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

### Earlier rulings (slice 3, 2026-10-10)

- Change on a credit sale is 0, never negative.
- The stored payment method of a sale with no payment is `MIXED`; when every payment line
  uses one method, it is that method. The UI shows "credit" for a sale with nothing paid.
- A returned quantity may have up to three decimals, so part of a weighed line can come back.
