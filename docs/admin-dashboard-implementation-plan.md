# BizTrack CM Admin Dashboard — Implementation Plan

**Apps:** `apps/admin-api` (NestJS, port **3002**) + `apps/admin-web` (Next.js, port **3003**)
**RBAC model:** Dynamic (permission strings + roles + scopes)
**Database/Redis:** shared with `apps/api`
**Status:** Sprints 1 & 2 merged to `dev`; Sprint 3 in PR (#124 → dev); Sprint 4 next.
**Git flow:** feature branches → PR into `dev` (squash) → `dev` → `staging` → `main` (maintainer promotions).

---

## 0. Reality checks vs. the original doc

The source doc was two concatenated versions and assumed tables that do not exist. Verified against the real schema:

| Doc assumption                     | Reality                                                                                                                                                                                | Resolution                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Payments/billing ledger exists     | **No payment table.** `PAYMENT_SUCCESS/FAILED` are dead enum values, never written. No Campay/MoMo integration persists charges.                                                       | **Payments module = read-only stub** (events-derived; retry/waive disabled; "billing integration pending" banner). |
| `subscriptions` table              | Subscription state lives **on `businesses`** (`plan`, `subscriptionStatus`, `trialEndsAt`, `currentPeriodStart/End`, `billingCycle`, `cancelAtPeriodEnd`) + `subscription_events` log. | "List subscriptions" = query `businesses`.                                                                         |
| `sync_errors` table                | Derived from `sync_batches` / `sync_operations` (`failedCount`, `lastError`, `status`, `errorMessage`).                                                                                | Aggregate from those.                                                                                              |
| `ADMIN_PORT=3001`                  | Clashes with client API. Scaffold already uses 3002.                                                                                                                                   | admin-api 3002, admin-web 3003.                                                                                    |
| Static `AdminRole` enum (scaffold) | —                                                                                                                                                                                      | Replaced by dynamic RBAC per decision.                                                                             |

`BusinessOverride`, `PlanConfig`, `BusinessMember` already exist and map cleanly to overrides/plans/members.

---

## 1. Architecture decisions

- **A1 — One schema owner.** All new admin-table migrations live in `apps/api/src/database/migrations/` (single migration history for the shared DB). `apps/admin-api` defines entities but does **not** run migrations.
- **A2 — Mirror infra, don't share yet.** Copy `RedisService`, `PasswordManager`, response interceptor, exception filter, request-id middleware, zod config into `apps/admin-api/src/common/*`. (Extracting to `@biztrack/nest-common` is a later refactor.)
- **A3 — Permission catalog is the source of truth.** A typed catalog declares the full permission space + baseline role sets; seed, role validation, and the frontend editor all consume it.
- **A4 — Payments derives, doesn't invent** (read-only stub; see §0).
- **A5 — admin-web auth** uses a **next-auth Credentials provider** wrapping `POST /admin/auth/login`, storing admin-api tokens in the session; middleware gates `(dashboard)` routes.
- **A6 — IP allowlist** middleware no-ops when `ADMIN_ALLOWED_IPS` is empty (dev), enforces when set (prod).

## 2. Resolved risks

- **Permission cache key:** exact key is **`permissions:${businessId}`** (JSON `Resource[]`, dynamic TTL ≤300s) in `apps/api/src/modules/permissions/permissions.service.ts`. Admin actions (suspend / override / subscription edit) call `redis.del(`permissions:${businessId}`)`. Plan-config edits loop over businesses on the plan (reuse the blast-radius query) and del each key — no `SCAN`. A shared `permissionsCacheKey(businessId)` helper removes string drift.
- **Revenue formula (contracted, not collected):**
  - `MRR = Σ (businesses where subscriptionStatus=ACTIVE) of (billingCycle=ANNUAL ? priceAnnualXAF/12 : priceXAF)`
  - `ARR = MRR×12`, `ARPU = MRR/activeSubscribers`
  - churn / trial-conversion from `subscription_events`.
  - Caveat returned with metrics: _"Estimated from subscription state, not collected payments."_
- **Refresh-token rotation parity:** port the client mechanism exactly (token is `tokenId.secret`, **not** a JWT; bcrypt-hash verify; order = lookup → expiry → revoked → `usedAt`⇒revoke whole family → verify → mark used → reissue same `familyId`). Admin variant: `admin_refresh_tokens` table, `admin_id` FK, **8h** refresh / **1h** access; revoke-by-admin on deactivate/role-change; daily cleanup cron.

---

## 3. New tables (migrations in `apps/api/src/database/migrations/`)

`admin_users`, `admin_roles`, `admin_role_permissions` (unique `(admin_role_id, permission)`, `scope jsonb`), `admin_refresh_tokens`, `admin_audit_logs`, `support_tickets` — per source doc §4. `is_super_admin` boolean is set only by migration/seed, never via API.

> **Naming note:** the admin audit table is `admin_audit_logs`, **not** `audit_logs`. The client API already owns a different `audit_logs` table (per-business activity log) in the shared DB; the two must not collide. Migration: `apps/api/src/database/migrations/1782400000000-admin_dashboard_tables.ts`.

## 4. Permission space

`{module}:{action}` across: businesses, users, revenue, subscriptions, payments, support, sync_errors, plans, metrics, audit_logs, admin_users, admin_roles. Baseline sets: FINANCE, SUPPORT, TECHNICAL (source doc §3.2); SUPER_ADMIN = all (via `is_super_admin` bypass).

---

## 5. Sprint breakdown

### Sprint 1 — Foundation (auth end-to-end) — ✅ merged to dev

Deps; zod config; TypeORM wiring; admin entities; migrations; permission catalog; copied common infra; `AdminJwtGuard` + `AdminPermissionGuard` + `@RequirePermission` + `@CurrentAdmin`; global `AuditInterceptor`; IP-allowlist middleware; admin-auth (login/refresh/logout/me) with rotation; seed (4 roles + first super admin); admin-web login → overview via next-auth.
**Done =** admin-api boots on :3002, migrations applied, roles+super-admin seeded, login returns tokens, a guarded route enforces a permission, every mutation is audited, admin-web login works.

### Sprint 2 — Roles & Team Management — ✅ merged to dev

admin-roles (list w/ memberCount, create w/ catalog validation + reserved-name/privileged-perm guards, patch w/ cache invalidation, delete w/ 409-if-assigned, GET permissions), admin-users (list/create min-12-pw/patch/deactivate w/ session revoke + self-lockout & super-admin guards). admin-web: role permission-matrix editor + team UI.

### Sprint 3 — Business & User Management + Support — 🔀 PR #124 → dev

businesses (scope-aware list, detail, suspend w/ cache-invalidate + SMS-stub, override grant/revoke), client users (list/detail/suspend/resend-otp 3·hr⁻¹ stub), support (ticket CRUD, sync-errors list+resolve stub). Reads client tables via **local read-entities** (schema owned by apps/api). admin-web: Businesses, Users, Support pages (plain tables + modals; @tanstack/react-table not needed).

### Sprint 4 — Revenue, Plans & Audit — ▶ next

Reconciled with current `dev` (2026-07-13):

- **metrics** — `GET /admin/metrics/overview` (growth + engagement + health; revenue fields `null` unless `revenue:view`), `/revenue`, `/revenue/breakdown`, `/mrr-history`. Revenue is **contracted, not collected** — computed from `businesses` (subscription_status=ACTIVE) × `plan_configs.price_xaf` / `price_annual_xaf` (÷12 for ANNUAL); churn/trial-conversion from `subscription_events`. Response carries the "estimated from subscription state" caveat. (No billing ledger exists — confirmed again on dev.)
- **subscriptions** — `GET /admin/subscriptions` (over `businesses`), `/trials` (sorted by trial_ends_at), `PATCH /:businessId` (adjust plan/status/trial dates; invalidate `permissions:{id}`; log a `subscription_events` row where an event type fits).
- **payments (read-only stub)** — list/failures derived from `subscription_events` (PAYMENT\_\* — currently none); retry/waive return 501/hidden with a "billing integration pending" note. No fake data.
- **plans** — `GET /admin/plans` (from `plan_configs`, shows updatedAt/updatedBy), `GET /:plan/businesses` (blast radius), `PATCH /:plan` (edit resources; **bulk cache invalidation by looping the plan's businesses and deleting each `businessPermissionsCacheKey(id)`** — mirrors the client's per-business `invalidateCache`; rate-limit 5·hr⁻¹).
- **audit-logs** — `GET /admin/audit-logs` reads **`admin_audit_logs`** (note the `admin_` prefix), read-only, `audit_logs:view` (SUPER_ADMIN-only in the catalog); filters adminUserId/action/entityType/dateRange.
- Reuses Sprint 3 **read-entities** (Business, SubscriptionEvent) + adds read-entities for `plan_configs`; admin's own `AdminAuditLog` entity already exists.
- **admin-web**: Revenue dashboard (recharts), Plans config editor, Audit-log viewer.
