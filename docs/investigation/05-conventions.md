# 05 — Conventions (how to add a feature here)

Written so a new implementer can add a feature in the house style without re-deriving it. All CONFIRMED.

---

## Adding a table / entity

### Server (`apps/api`, Postgres/TypeORM)

- **Migration:** `apps/api/src/database/migrations/<epochMillis>-<Name>.ts` (~86 files). The prefix is a **hand-assigned monotonic epoch**, not wall-clock — pick the next number above the current max (recent ones step by `100000000000`). Suffix casing varies (PascalCase or snake_case — both exist). Class name embeds the timestamp and sets `name = '...'`. Both `up(queryRunner)` **and** `down(queryRunner)` are required (reversible). Raw SQL via `queryRunner.query(...)`, with idempotent guards (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP ... IF EXISTS`). **Template:** `1784200000000-inventory_movement_variant.ts`. Scripts: `pnpm -C apps/api migration:create|generate|run|revert|show`.
- **Entity:** `apps/api/src/entities/<name>.entity.ts`, registered in `entities/index.ts`. Extend `BaseEntity` (mutable: `id`, `created_at`, `updated_at`, `deleted_at` soft-delete) or `ImmutableBaseEntity` (logs/movements/payments: `id` + `created_at` only). `@Entity('snake_case_plural')`. **Every column has an explicit snake_case `name`.** **All constraints explicitly named** (`docs/database/constraints.md`): `@Index('idx_<table>_<cols>')`, FK `foreignKeyConstraintName: 'fk_<table>_<col>'`, unique `unq_<table>_<cols>`, check `chk_<table>_<rule>` — TypeORM must not auto-name anything. Money/quantity → `type: 'decimal', precision, scale, transformer: decimalTransformer`; dates → `transformer: dateTransformer` (both from `@/common/entities/transformers`).

### Desktop (`packages/electron-core`, SQLite)

- **Migration:** `packages/electron-core/src/migrations/00NN_<snake_name>.ts` (to `0059`), registered in `migrations/index.ts`. Exports `const migration_00NN: Migration = { id: NN, name, up(db) {...} }`. **No `down()` — forward-only.** Use `ensureColumn(db, table, column, def)` for idempotent adds (SQLite lacks `ADD COLUMN IF NOT EXISTS`). Runner (`runner.ts`) tracks `_migrations`, runs pending in ascending id order, each in a transaction. SQLite uses `TEXT` where Postgres uses `uuid`; **money columns are `REAL`** (see the money caveat in `03 §6.1` — new money columns should follow the Epic-0 decision, not blindly copy `REAL`).
- **Author API + local migrations as a pair** (e.g. API `1784200000000` ↔ local `0059`, both add `variant_id`).

### Cross-cutting

- **IDs:** UUID. Server `@PrimaryGeneratedColumn('uuid')`; desktop **client-generated `randomUUID()`** (same id used for the row and its outbox payload). No ULID/autoincrement.
- **Soft delete:** `deletedAt`/`deleted_at` (`@DeleteDateColumn`) on mutable entities; SQLite uses `is_deleted`. Immutable entities are never soft-deleted.
- **Enums:** TS string-constant enums stored as `varchar`; cross-app enums in `packages/types`, entity-local ones inline. Audit `AuditAction`/`AuditActorType` are TS **unions** (widen freely).

---

## Desktop↔API parity + shared-types rules (verified patterns — follow them)

1. **Every desktop local write → `sync_outbox` + a matching API REST endpoint + sync dependency metadata.** Local `private enqueue(...)` inserts into `sync_outbox` then nudges a sync (`contacts.service.ts:399`). Register any new synced entity in `packages/types/src/sync.types.ts`: add to the `SyncEntity` union + `SYNC_ENTITY_DEPENDENCY_TIER` + `SYNC_ENTITY_STABLE_ORDER` + `SYNC_ENTITY_DEPENDENCIES`. **A new table that isn't registered here silently won't sync.**
2. **Shared query/request/response shapes live in `packages/types`** (24 domain files), never inline in a service.
3. **Reusable UI in `packages/ui`**, not `apps/desktop-v2` (app-specific composition may live in `renderer/src/components`; the rule relies on author discipline). Also: phone fields use `PhoneInput`, OTP/code fields use `OtpInput` (from `@biztrack/ui/biztrack`) — never a plain `Input`.
4. **`list()` methods paginate (default limit 20) + a dedicated `listAll*()` for pickers.** Textbook example: `sales.service.ts:797` `list()` returns `PaginatedResult`, `:819` `listAll()` returns a plain array; contacts adds `listAllSuppliers()`/`listAllCustomers()`.

---

## Testing

- **Framework:** Jest, **API only**. `apps/api/jest.config.ts`; run `pnpm -C apps/api test` (`--runInBand`), coverage `test:coverage`; monorepo `pnpm test` → `turbo test`. `*.spec.ts` inside `__tests__/` subdirs (~35 files).
- **Coverage:** audit, auth, brands, inventory (`deduct-for-sale.spec.ts`), online, permissions, plans, sales (`sales.service.spec.ts`), storage, subscriptions, sync (catalog appliers), entities. **Gaps:** no `debts` test dir; financial sync appliers (sale/debt/expense/opening-balance) under-covered vs catalog appliers.
- **⚠ `apps/desktop-v2` + `packages/electron-core` have ZERO automated tests** — only ad-hoc `*.smoke.ts` scripts. All local SQLite / outbox / money logic is untested by CI. **For Specs 01–04, standing up a desktop test harness is effectively a prerequisite** (their money/cash logic lives here).

---

## Error handling, logging, formatting

- **Success envelope** (`response.interceptor.ts`): `{ success: true, data, requestId, timestamp }` (passes `StreamableFile` through untouched; skips re-wrapping).
- **Error envelope** (`http-exception.filter.ts`, global `@Catch()`): `{ success: false, message, error: { code, details }, requestId, timestamp }`. `AppException` carries `code`+`details`; generic `HttpException` → `HTTP_<status>`. i18n-aware (`i18n:`-prefixed messages translated, default `fr`).
- **Logging:** shared `@biztrack/logger` injected as `LOGGER` with `.setContext(...)`. ⚠ **21 `console.log` remain in `apps/api/src`** (incl. a stray `console.log('not valid code')` at `auth.service.ts:1586`) — off-convention; don't add more. No empty catch blocks found on sales/sync/debts money paths.
- **Prettier** (`.prettierrc`): `semi:false`, `singleQuote:true`, `trailingComma:"all"`, `printWidth:100`, `tabWidth:2`. ESLint `@biztrack/eslint-config`, `--max-warnings 0`.

---

## PR / commit / branch / CI

- **Commits:** Conventional Commits with app/feature scopes — `fix(sell): …`, `feat(contact): …`, `fix(desktop): …`, `ci(desktop): …`, `chore: …`. Squash-merge appends `(#NNN)`. **No "Generated with Claude" footer / Co-Authored-By trailer** (project rule).
- **Branch flow:** `feat/*` → **dev** → **staging** → **main**, mechanically enforced by `.github/workflows/branch-policy.yml` (PRs into `main` only from `staging`; into `staging` only from `dev`/`hotfix/*`). No PR template in `.github/`.
- **CI** (`.github/workflows/ci.yml`): one Turbo pass `type-check lint test build` filtered to `@biztrack/api...` + `@biztrack/desktop-v2...` (+ shared deps). Mobile/storefront/admin/web excluded as WIP. desktop-v2 `postinstall` rebuilds `better-sqlite3` against the Electron ABI.

---

## Run locally

- Root: `pnpm dev` / `pnpm dev:desktop-v2` / `pnpm dev:web`; `pnpm build|lint|test|type-check|format`.
- API: `pnpm -C apps/api dev` (nest watch); `pnpm -C apps/api migration:run`; `pnpm -C apps/api test`.
- Desktop: `pnpm -C apps/desktop-v2 dev` (compiles electron-core then `electron-vite dev`); `build:web` for the browser build; `dist` for electron-builder.
- **Gotcha:** if a run fails on a locked `better-sqlite3` rebuild, set `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false` or call `./node_modules/.bin/<tool>` directly.

---

## The unwritten rules (a newcomer would get these wrong)

1. **Everything is written twice.** A domain rule (rounding, expected-cash, ageing) exists in both `apps/api` and `apps/desktop-v2/src/main/services` and must stay in parity — there is no shared domain package. Change both; the comments literally say "mirrors … so both tie out."
2. **A new synced table needs 4 edits, not 1:** Postgres migration, SQLite migration, `packages/types` shapes, and `sync.types.ts` dependency registration (+ a column map in `electron-core/sync.service.ts`). Miss the last two and it silently won't sync.
3. **Money is not integer XAF, and the two DBs disagree** (decimal vs REAL). Don't assume `*_xaf INTEGER`. Use the rounding helpers; better, land the Epic-0 shared helper first.
4. **Constraints are always explicitly named** (`idx_`/`fk_`/`unq_`/`chk_`). Never let TypeORM auto-name.
5. **Snapshot, don't reference.** Sale lines snapshot price/name/cost at sale time; catalog changes must not move history. Follow this for any new historical record.
6. **Append-only is convention, not a constraint** — if a spec needs a real guarantee (Spec 02 audit), you must add a DB trigger/grant; the codebase won't stop a raw `UPDATE`.
7. **Server is the real permission gate;** desktop-v2 has no local Resource gate. Don't assume a client-side check exists.
8. **The day is UTC** (`sale_date = soldAt.toISOString().slice(0,10)`), but `packages/utils/src/date.ts` day helpers are local-time — they disagree. Pick deliberately.
