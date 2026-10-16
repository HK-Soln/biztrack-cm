---
name: domain-logic
description: Where business logic goes in BizTrack. Use BEFORE writing or changing any business rule in apps/api, the sync applier, apps/desktop-v2, apps/mobile or packages/electron-core — anything that computes money, totals, discounts, stock, debt or sale status, settlement, cash variance, due dates, period rules, limits or permissions — and whenever adding a feature, endpoint, IPC handler or sync handler that needs such a rule. All of it is implemented once in packages/domain and called from the entry points.
---

# Business logic lives in `@biztrack/domain`

BizTrack runs the same rules in four places: the API (REST), the server sync applier, desktop
and mobile. A rule written in an entry point gets written again in the others and drifts. So:

**Implement every business rule once, as a pure function in `packages/domain`. Entry points
only load state, call the domain, and persist what it returns.**

Read `docs/design/domain-package.md` first. It has the rules, the layout, the roadmap and the
list of known divergences between runtimes.

## What counts as business logic

Anything that decides a number, a status, or whether something is allowed:

- money: line totals, discounts, allocation, charges, totals, rounding, profit, margin
- settlement: amount paid, credit, change, refund value, payment status
- stock: quantities to deduct or restore, movement types, reorder rules
- debts: status, balance, due dates, ageing
- cash sessions: expected cash, variance
- calendar: business date, fiscal periods, period-close rules
- authorization rules: discount limits, below-cost, PIN strength, plan and module entitlement
- validation that is a rule of the business ("credit needs a customer", "void needs a reason")

Not business logic, so it stays where it is: SQL and ORM queries, transactions, HTTP and IPC
plumbing, DTO shape validation, sync transport, display formatting, translations and wording.

## Before writing code

1. Search `packages/domain/src` for the rule. If it exists, call it. Never re-implement it,
   and never copy its arithmetic inline "just here".
2. If it does not exist, add it to `packages/domain` first, with tests, then call it.
3. If you find the rule already written inline in an entry point, move it: do not add a
   second inline copy next to it, and do not leave the old one behind.

## Writing a domain function

- Pure TypeScript. Imports: relative paths and `@biztrack/types` only. No `typeorm`,
  `@nestjs/*`, `better-sqlite3`, `electron`, `node:*`, `@biztrack/utils`, HTTP or logger.
- No ambient state: no `new Date()` without arguments, `Date.now()`, `Math.random()`,
  `process`, `fetch`. Take `now`, ids and random values as parameters.
- A use case takes a command plus the state it needs and returns a decision as plain data
  (rows to write, stock deltas, debts to open, audit events, or a rejection). It does not
  read or write anything.
- Money is whole XAF: round through `toWholeXaf`. Never write a local `round2` or `roundMoney`.
- Return codes and types, not display text. Adapters add wording and translations.
- Tests sit beside the file as `*.test.ts` (vitest). Export from `src/index.ts`.

## Writing the entry point (adapter)

- Load state, call the domain function, apply the decision in ONE transaction.
- No arithmetic and no rule in the controller, service method, IPC handler or sync handler.
- The sync applier and the REST path call the same domain function. The server re-decides:
  never trust a total, variance or authorization flag computed on a device.
- Desktop and mobile adapters are synchronous SQLite; the API adapter is async TypeORM.

## Moving an existing rule

1. Pin current behaviour with a test in each runtime that has the rule.
2. Write the domain function and its tests.
3. Replace every copy with a call, and delete the copies.
4. If the runtimes disagreed, the server's behaviour wins unless it is the bug. Record the
   divergence in `docs/design/domain-package.md` and say what changed in the PR.
5. Update the roadmap table in that doc.

## Verify

```
pnpm --filter @biztrack/domain run build
pnpm --filter @biztrack/domain run lint
pnpm --filter @biztrack/domain run test
pnpm --filter @biztrack/api run type-check
pnpm --filter @biztrack/api run test
pnpm --filter @biztrack/desktop-v2 run type-check
pnpm --filter @biztrack/desktop-v2 run test
```

Build the domain package before the app checks: the API and the desktop tests resolve it
from `dist`. A lint warning in `packages/domain` about a restricted import, global or clock
means the function is not pure. Fix the function; do not disable the rule.
