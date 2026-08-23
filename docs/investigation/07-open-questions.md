# 07 — Open Questions (escalate, do not decide)

For each: the question, why it matters, options with trade-offs, a recommendation, and what is blocked until it's answered.

---

### Q1 — Money representation: how far do we migrate?

**Why:** Money is `decimal(12,2)` (Postgres), `REAL` float (SQLite), `int` (variants); rounding is duplicated. Specs 01–02 demand integer XAF and their acceptance tests fail on the current base.
**Options:** (a) full migrate all money to integer XAF end-to-end (SQLite `REAL`→`INTEGER`, Postgres round-to-integer, unify variants) — correct, highest blast radius; (b) integer XAF only on the **new** discount/cash paths, leave legacy decimal — smaller, but two conventions coexist and reconciliation math still crosses them; (c) keep decimal, add a shared rounding helper + strict tests — least work, doesn't satisfy the spec's "no floats" premise.
**Recommendation:** (a), staged behind a data-migration + verification job, as **Epic 0**. Do the shared helper (BIZ-0.1) first so both runtimes round identically even before storage changes.
**Blocks:** all of Specs 01–02.

### Q2 — Extend or replace the audit trail?

**Why:** Real table is `audit_logs` (thin coverage, append-only unenforced) + a more-active desktop `local_audit_logs` that never syncs; Spec 02 §B4 invents `audit_events`.
**Options:** (a) extend `audit_logs` (add columns, widen the TS-union actions, add DB-level append-only, build the desktop→server bridge + UI); (b) build the spec's `audit_events` fresh and dual-write/migrate.
**Recommendation:** (a) — the plumbing is sound and the actions/entity_type are free-form (no enum migration). See `03 §6.6`. Do **not** create `audit_events`.
**Blocks:** Spec 02 Part B; the schema decision gates BIZ-2.7.

### Q3 — Unify receivables/payables further, or leave as-is before Spec 03 extends them?

**Why:** They already share one `debts` table (good), but supplier credit is **doubly** represented (`debts(PAYABLE)` **and** `restock_records`/`restock_payments`). A payables total can double-count.
**Options:** (a) make `debts` the single source and derive restock settlement from it; (b) leave both and make Spec 03 read one authoritatively (document which); (c) reconcile in a view.
**Recommendation:** (b) for now — pick `debts` as the reporting source, exclude `restock_payments` from payable totals — and log (a) as tech-debt. Full unification is out of Spec 03's scope.
**Blocks:** Spec 03 payables widgets (BIZ-4.4) accuracy.

### Q4 — Can PIN authorization reuse any existing credential mechanism?

**Why:** No PIN exists; offline auth is a full bcrypt password compare. Specs 01 & 02 both need offline manager-PIN + a 30-day stale cutoff.
**Options:** (a) new PIN credential on the synced user record, hashed on device (argon2id/scrypt/bcrypt), verified locally like `offlineLogin` — self-contained; (b) reuse the account password as the "PIN" — worse UX/security, couples step-up to login.
**Recommendation:** (a), reusing the `offlineLogin` local-hash _pattern_ (not the password itself); decide the hash (bcrypt is already a dependency; argon2 adds bundle weight for mobile). Needs a security review — this is a new offline auth surface with rate-limiting and a stale-device rule.
**Blocks:** BIZ-1.4/1.5/1.6, BIZ-2.2 step-up.

### Q5 — Can the sync engine support append-only guarantees, and at what cost?

**Why:** Sync is LWW by `updated_at`; append-only is convention (no `updated_at` → filtered by `created_at`), not a DB constraint. Spec 02 §B4 wants a **DB grant** guarantee.
**Options:** (a) DB trigger / `REVOKE UPDATE,DELETE` on `audit_logs`/`debt_payments`/`sale_payments` (server); SQLite has no grants, so rely on the write-once code path + no update in appliers on the client; (b) application-only (status quo) — insufficient for the spec.
**Recommendation:** (a) server-side DB enforcement; on the client, remove any update path and document the convention. Note `deletePayment` currently deletes `debt_payments` — that behavior must change or be exempted.
**Blocks:** BIZ-2.8; Spec 02 acceptance ("no API path updates/deletes an audit event").

### Q6 — Where does the business-day boundary come from?

**Why:** Reports bucket by **UTC** `sale_date` (`soldAt.toISOString().slice(0,10)`); `packages/utils/src/date.ts` day helpers are **local-time** (they disagree for late-evening Douala/UTC+1 sales); Spec 04 wants a **shift-derived** `business_date` from a configurable closing time. Three different notions of "day."
**Options:** (a) shift-derived business day (Spec 04) once cash sessions exist, with `business_date` stored on every transaction; (b) business-configured timezone + local-midnight bucketing as an interim; (c) keep UTC and document it.
**Recommendation:** interim (c) with the mismatch documented, then (a) after Spec 02 — never compute business day at read time (closing time is a mutable setting). Resolve the utils/date.ts local-vs-UTC inconsistency regardless.
**Blocks:** Spec 04 Part A; affects every daily report's meaning.

### Q7 — Which "profit" does the owner digest lead with?

**Why:** Two shipped definitions diverge on sales with sale-level discounts/charges: daily-summary (`sale.total_amount` revenue base) vs Income Statement (`Σ sale_items.line_total` base). Spec 03 leads with this number and it must agree with an existing report.
**Options:** (a) adopt the P&L/Income-Statement definition (net of line discounts, expenses subtracted for operating result) — the accounting-correct one; (b) adopt the daily-summary definition (operationally simpler, includes charges); (c) reconcile both to a single formula.
**Recommendation:** (a) as the canonical gross/operating profit, and align the daily-summary revenue base to match. This is an owner-trust issue, not just code.
**Blocks:** BIZ-4.1/4.2.

### Q8 — Signed entitlement token vs the current trusted JSON?

**Why:** Spec 04 §B3 wants a cryptographically **signed** entitlement token verified against a baked public key; today entitlements are trusted server JSON (`AuthPermissions` + `plan_state_cache`) with an expiry, not signed.
**Options:** (a) add signing to the existing entitlement payload + a client verifier + grace period; (b) keep trusted JSON and rely on server re-validation at sync (status quo) — insufficient for offline module gating integrity.
**Recommendation:** (a); the delivery channel + offline cache already exist, so this is additive.
**Blocks:** BIZ-5.6 (only when a paid module actually needs offline gating — can be deferred).

### Q9 — Two parts of the codebase already disagree — which wins?

Surface these before building on them:

- **UTC (`sale_date`) vs local-time (`date.ts`) day boundaries** — see Q6.
- **Two profit definitions** — see Q7.
- **Supplier credit in `debts` vs `restock_payments`** — see Q3.
- **`'OFFSET'` written as a `PaymentMethod`** that isn't a member of the enum (`debts.service.ts:370`) — latent; decide whether `OFFSET` becomes a real enum member.
- **Server `audit_logs` vs desktop `local_audit_logs`** cover different domains with no bridge and a mismatched `actor_type` (`'USER'` vs `BUSINESS_USER`).

### Q10 — How do PIN hashes, role limits, and per-business settings reach an offline device?

**Why:** Multiple planned features (offline manager PIN, per-role discount limits, cash-session blind-count/tolerance settings) assume identity/config data is on the device. But `SyncEntity` — the outbox **push** set — contains no `user`/`member`/`role`; those arrive **pull-only** via `ChangeSet.teamMembers`/`.roles` (`sync.types.ts:698-699`) and are read-only on device. There is **no offline write-up path** for them, and config/settings pull is flagged deferred.
**Options:** (a) distribute _down_ via the existing pull channel (add fields to `TeamMemberSyncRecord` / a settings pull) and make any _setting_ of them online-only; (b) build a new outbox push path for member/role/settings so they can be created/edited offline.
**Recommendation:** (a) — PIN-set and policy edits are rare, admin-initiated actions that can require connectivity; local _verification_ stays offline. Confirm/finish the config-settings pull before depending on it.
**Blocks:** offline-PIN provisioning, per-role discount limits, and any per-business setting that must reach a cashier device offline.

---

## Alarming incidental findings (listed, not fixed)

- **Zero automated tests on the entire local-first write path** (`apps/desktop-v2` + `packages/electron-core`) — all SQLite money/stock/outbox logic is unguarded by CI. Highest-leverage risk for anyone touching Specs 01–04.
- **Append-only tables (`audit_logs`, `debt_payments`, `sale_payments`) have no DB-level protection** — a raw `UPDATE`/`DELETE` succeeds; `deletePayment` deletes an "immutable" `debt_payments` row.
- **Financial sync appliers under-covered vs catalog appliers** (per `AUDIT_REPORT.md` H3): financial sync payloads typed `Record<string, unknown>`, validated only by `@IsObject()` rather than re-run through the Create DTOs. Verify current `apps/api/src/modules/sync/sync.service.ts` before trusting.
- **21 `console.log` in `apps/api/src`** bypass the shared logger, incl. one on the auth code-verification path (`auth.service.ts:1586`).
- **`AUDIT_REPORT.md` (root) is partially stale** — its Critical C1 (trials never expire) and C2 (plaintext password logged) are already fixed; several sync findings target the removed v1 and weren't re-verified.
- **Secrets:** clean — `.env` is gitignored (`git ls-files` shows only `*.env.example`); the `apps/api/.env` open in the IDE is untracked. No committed credentials found.
- **`taxAmount` is always written 0** on sales — VAT is effectively unimplemented despite the setup wizard's VAT toggle/rate. Relevant if any spec touches tax.
