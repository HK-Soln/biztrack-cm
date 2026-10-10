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
  sales/         sale pricing, discount policy
  cash/          expected cash and variance
  credit/        due dates, days past due
  inventory/     reorder velocity and digest
  calendar/      business date, fiscal periods, operating hours
  security/      manager PIN strength
  entitlements/  plan permissions, module entitlement
```

## Roadmap and status

| #   | Slice                                                                                                                                                                                                                                                             | Status |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Scaffold the package, purity guard rails, move the rules already shared in `packages/utils`, repoint API and desktop imports                                                                                                                                      | Done   |
| 2   | Sale pricing: `priceSale` (OVERRIDE model, cart-discount allocation, totals) used by API `computeSale` (REST and sync) and desktop `createSale`                                                                                                                   | Done   |
| 3   | Sale settlement: amount paid, credit, change, stored payment method, refund value and status; used by create, record-payment, refund on all three paths                                                                                                           | Next   |
| 4   | Sale use case: `decideSale`, `decideVoid`, `decideRefund` returning every write (items, payments, discounts, stock deltas, serial units, debt, audit, daily summary); server re-evaluates discount authorization on sync; desktop writes wrapped in a transaction |        |
| 5   | Stock ledger: one movement model; desktop stock moves off product rows into `inventory_levels`                                                                                                                                                                    |        |
| 6   | Debts and payments: collapse the four copies of debt status; replace the SQLite debt triggers                                                                                                                                                                     |        |
| 7   | Catalog: route sync product, variant, category and contact appliers through the domain                                                                                                                                                                            |        |
| 8   | Cash sessions, expenses, income, savings, periods, POs and RFQs; replace the leftover two-decimal `round2` / `roundMoney` helpers with `toWholeXaf`                                                                                                               |        |
| 9   | `DatabaseService` interface so `electron-core` stops importing `better-sqlite3` and Electron directly (unblocks mobile and the shared sync engine)                                                                                                                |        |

## Divergences found

Each was read in the code. "Fixed" means both runtimes now run one function.

| Rule                                                      | Desktop                                                 | API                                                                                                           | State                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Line total of a bargained line with a fractional quantity | `charged × qty − discount`, rounded once                | `listed × qty − round(gap × qty) − discount`; can differ by 1 XAF (0.5 × 995 against listed 1000: 498 vs 497) | Fixed in slice 2: both use the API formula, which reconciles with the discount rows |
| Negative line or cart discount                            | Clamped to 0                                            | Accepted on the sync path (REST validates `Min(0)`)                                                           | Fixed in slice 2: clamped to 0                                                      |
| Quantity precision                                        | Used as entered                                         | Rounded to 3 decimals                                                                                         | Open: `priceSale` takes the quantity as given; the API rounds before calling        |
| `change_given` on a credit sale                           | 0                                                       | Negative (`amountPaid − total`, not clamped)                                                                  | Open, slice 3                                                                       |
| Stored payment method                                     | `null` with no payments; `MIXED` for any two lines      | `MIXED` with no payments; de-duplicates methods first                                                         | Open, slice 3                                                                       |
| Returned quantity on refund                               | `Math.floor`                                            | Rounded to 3 decimals                                                                                         | Open, slice 3                                                                       |
| Insufficient stock                                        | Sale proceeds, stock goes negative                      | Rejects with `INSUFFICIENT_STOCK`                                                                             | Open, slice 4 or 5 (needs a product decision for offline tills)                     |
| Discount authorization on a synced sale                   | Evaluated on the device                                 | Not re-evaluated; flags trusted from the payload                                                              | Open, slice 4                                                                       |
| Refund and the daily sales summary                        | No summary table                                        | Create and void adjust it; refund does not                                                                    | Open, slice 4                                                                       |
| Savings on refund                                         | Not reversed                                            | Not reversed                                                                                                  | Open, slice 4 (decide the rule)                                                     |
| Cart preview in the renderer (`Sell.tsx`)                 | Rounds to 2 decimals                                    | n/a                                                                                                           | Open: the renderer should call `priceSale`                                          |
| Money rounding outside sales                              | `round2` in debts, expenses, income, inventory, savings | `roundMoney` / `round` in the same modules                                                                    | Open, slice 8                                                                       |
