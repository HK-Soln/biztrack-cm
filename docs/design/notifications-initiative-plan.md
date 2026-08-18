# Notifications & Alerts — Unified Initiative Plan

_Status: PLAN (no code yet). Author sweep: 2026-08-18. Branch context: `feat/sprint-1`._

## The reframing

The **Settings → Notifications** tab (`components/settings/NotificationsSection.tsx`) is a
frontend-only preview today — a **channel × event matrix** + quiet hours + recipients,
behind a "coming soon" banner. Its 7 events **are** Epic 4 plus four cross-cutting events:

| Settings event (`ntf.*`) | Meaning                                    | Jira / origin                        |
| ------------------------ | ------------------------------------------ | ------------------------------------ |
| `lowStock`               | product drops below reorder level          | **BIZ-4.5 / BIZ-4.6** (stock alerts) |
| `daily`                  | end-of-day sales summary                   | **BIZ-4.1 / BIZ-4.2** (owner digest) |
| `debt`                   | credit customer payment due / overdue      | **BIZ-4.3 / BIZ-4.4** (receivables)  |
| `newOrder`               | customer checks out on the storefront      | cross-cutting (online store)         |
| `payment`                | mobile-money / card payment confirmed      | cross-cutting (sales)                |
| `team`                   | refunds / voids / large discounts / logins | cross-cutting (**Epic 2 audit**)     |
| `billing`                | renewals / failed charges / plan limits    | cross-cutting (subscriptions)        |

So: **the Settings tab is the control plane; Epic 4 (and 4 more producers) are the
producers. They are one system.** Building them piecemeal would produce three half-wired
notification paths. This plan builds the control plane once, then hangs every producer off it.

---

## What already exists (REUSE)

The delivery substrate is far more built than it looks from the Settings preview.

**Delivery pipeline (`apps/api/src/modules/notifications/`)**

- All 4 channels are real providers: `providers/email.provider.ts` (Resend), `providers/sms.provider.ts` (routed via WAHA), `providers/whatsapp.provider.ts` + `providers/waha-http.client.ts` (WhatsApp Business via WAHA — env `WHATSAPP_BASE_URL/API_KEY/SESSION`).
- `processors/notifications.processor.ts` — `createAndSend()` (creates a row, calls the provider, persists status) + `dispatchToProvider()` (per-channel switch). BullMQ retries. **Hardcodes `type: NotificationType.INVITE` — must be generalized.**
- Inbound webhooks (`controllers/notifications-webhook.controller.ts`) mark DELIVERED/FAILED from provider callbacks.
- `services/notifications.service.ts`: `createInApp()` (persists IN_APP + `realtime.toUser` push), `createAndEnqueue()`, `enqueueInviteNotifications()` fan-out, `listInApp/unreadCount/markRead`.
- In-app bell consumed by desktop `components/notifications/NotificationBell.tsx` + `stores/notifications.store.ts` (**online-only server proxy — no local SQLite notifications; the bell does not fire offline**).

**Shared types (`packages/types/src/notification.types.ts`)**

- `NotificationChannel = {EMAIL, SMS, WHATSAPP, IN_APP}` — matches the matrix columns exactly.
- `NotificationStatus`, `NotificationItem`, realtime payload — all present.
- Rich `notification` entity: business/user, channel, type, recipient, subject, body, **deeplink**, **read_at**, **metadata jsonb**, status, provider, provider_message_id, attempts, sent/failed timestamps.

**Producer data already available**

- lowStock: reorder digest infra + **BIZ-4.6 velocity/daysCover DONE** (`inventory.service.reorderSuggestions` / `getAlerts`); daily-scan job exists but **only caches to Redis, delivers nothing** (`processors/inventory-alerts.processor.ts:83`).
- daily: `daily-sales-summary.service.ts` (revenue/cost/gross_profit/discounts/collected-by-method/credit/voids) + `cash-sessions.service.dailyReport` (expected/counted/**variance** cash + reconcile).
- debt: `opening-balances.service.getAgeingReport` (buckets + already surfaces `contactPhone`); `debt.entity.dueDate` **exists but drives nothing**.
- team: `audit.service.log` stream (SALE_VOIDED, DISCOUNT_APPLIED, PIN_FAILED, USER_ROLE_CHANGED, LOGIN…) — **fully decoupled from notify**.
- billing: `subscriptions.scheduler.ts` (@Cron 07:00 Africa/Douala) + `subscription_events` table (TRIAL_ENDING_SOON, PAYMENT_FAILED, PAST_DUE…) — **writes event rows, never notifies**.
- newOrder: `online-orders.service.checkout` (customer email only — **no owner notify**).
- payment: `sales.service.recordPayment` choke point (**no audit, no notify**; no automated MoMo/PayTrack callback yet — manual only).
- BullMQ scheduler patterns to copy: `subscriptions.scheduler.ts` (daily cron), `inventory-alerts.scheduler.ts` (repeatable queue).

---

## What's missing (NET-NEW)

1. **Preferences control plane** — no table/entity anywhere for the event×channel matrix, quiet hours, or recipient routing. The Settings tab has zero backend.
2. **`NotificationType` values** — only `INVITE | OTP | PAYMENT_REMINDER | MARKETING` exist; none of the 7 events. ⚠️ `PAYMENT_REMINDER` is already **borrowed** for RFQ/PO/storefront messages (`procurement-send.service.ts`, `public-storefront.service.ts`) — do **not** overload it for debts.
3. **Prefs-gated dispatcher** — one orchestration layer **that EVERY producer routes through** (no producer sends directly): `dispatch(event, businessId, {subject, body, deeplink, metadata, urgent})` → resolve recipients subscribed to the event → per recipient resolve `channels = matrix(event) ∩ recipient-subscription ∩ verified-destinations`, defer non-urgent within quiet hours → reuse `createInApp` + generalized `createAndSend`. Plus per-event **dedup/suppression** state. The Settings matrix is therefore the single switchboard governing all 7 producers.
4. **Recipient model (two levels)** — (a) **business-level event×channel matrix** (owner-configured: which channels each event may use); (b) **per-recipient event subscription** — each added recipient (owner + members) is configurable for _which alerts_ they receive, plus their verified email/phone (the Settings "Recipients" section). Effective channels for a recipient = matrix(event) ∩ recipient's subscribed events ∩ their available destinations.
5. **Producers wired** — 7 of them (below).
6. **Paid-channel gating** — SMS/WhatsApp "use account credit" (matrix copy) needs a credit/wallet concept that doesn't exist. MVP defers automated SMS/WhatsApp send + metering.

---

## Phased roadmap

### Phase 0 — Foundation (unblocks everything; no producer value on its own)

- Schema (Postgres migrations):
  - `notification_preferences` (business_id, event, channel, enabled) — the business-level matrix.
  - `notification_quiet_hours` (business-level: enabled, from, until, tz).
  - `notification_recipients` (business_id, user_id, email, phone, verified flags).
  - `notification_recipient_subscriptions` (recipient_id, event, enabled) — **which alerts each recipient receives**.
- Extend `NotificationType` with the 7 event categories (distinct types; see Decision N1).
- `NotificationDispatcher` service that **all producers call** (prefs-gated fan-out); generalize `createAndSend`'s hardcoded `INVITE` type. Effective routing = matrix(event) ∩ recipient subscription ∩ verified destinations, minus quiet hours (non-urgent).
- Settings tab backend: `GET/PUT /notifications/preferences` + quiet hours + recipients + per-recipient subscriptions; wire `NotificationsSection` (remove "coming soon", load/save real state) and the Recipients section (add member, verify email/phone via PhoneInput, toggle which events they get).
- **SMS channel (N3):** the matrix keeps the SMS column for schema completeness, but every SMS cell is **forced off and its toggle disabled** in the UI (tooltip: SMS provider coming soon). The dispatcher also hard-skips SMS regardless of stored prefs, so no SMS is ever sent while it's WAHA-backed.
- **New Jira: `N0 — Notifications foundation`. Blocks every other phase.**

_Status: D7/D9/N3 signed off 2026-08-18 → P0 build STARTED._

### Phase 1 — lowStock digest / "À commander" (BIZ-4.5; BIZ-4.6 DONE)

- Extend reorder digest with selling price + **supplier grouping** (last supplier via `restock_records`, fallback "no supplier yet") + **revenue-at-risk** ranking.
  - **Ranking (decided): lost-sales/day = `sellingPrice × velocity`; fallback `sellingPrice × suggestedQty` when velocity is untrusted (BIZ-4.6 guards).**
- Wire the existing daily inventory scan to **dispatch a `lowStock` digest** through Phase-0 (currently Redis-only).
- **72h per-product suppression** (`reorder_alert_log` table, Postgres).
- **Offline** desktop "À commander" surface: supplier-grouped, revenue-ranked, per-supplier **WhatsApp draft** (pre-addressed from supplier Contact phone, reuse `wa.me` share) + Generate-PO. (This is the offline-first path since the bell is online-only.)

### Phase 2 — daily owner digest (BIZ-4.1 / BIZ-4.2) — ⚠️ BLOCKED on D7

- **D7 sign-off** (profit basis): recommend Income-Statement basis, align `daily_sale_summaries.gross_profit`. AC: digest profit == chosen report exactly.
- Net-new daily scheduler+processor (07:00 Douala) over synced data → dispatch `daily` event.
- 6 lines (owner-approved fold-in of receivables — extends the original AC's "5 lines"): recette, **bénéfice**, écart caisse (green/red verdict from `dailyReport` variance), remises, low-stock count, **receivables (total owed / overdue** — from `getAgeingReport`, Phase-3 data). One deeplink. Fallback: _"Aucune caisse clôturée aujourd'hui"_. Once daily, silenceable in one tap. **Owner isn't holding the device — the cashier is.**
- Note: the receivables line reuses the ageing computation from Phase 3, so the profit/cash lines (D7) can ship first and the receivables line lights up once Phase 3's ageing basis (D9) is settled.

### Phase 3 — receivables (BIZ-4.3 / BIZ-4.4) — ⚠️ BLOCKED on D9

- **D9 sign-off** (ageing basis): bucket off `COALESCE(due_date, created_at + defaultCreditDays)`, keep 7/15/30 boundaries. Add `defaultCreditDays`, activate `due_date`.
- BIZ-4.4: extend `getAgeingReport` / `aged-recv` / `aged-pay` widgets. **Read `debts` only; exclude `restock_payments`** (D3).
- BIZ-4.3: net-new due-date scan job (debts module has **no scheduler, no notifications import** today) → `debt` event → **one tap opens WhatsApp with a pre-filled, editable message; DO NOT auto-send**. Three tones (douce/neutre/ferme), FR+EN, itemised-breakdown option. Reuse `contactPhone`. (New distinct type, not `PAYMENT_REMINDER`.)

### Phase 4 — cross-cutting producers (NEW stories, not Epic 4)

- **newOrder**: hook `online-orders.service.checkout` (after `ORDER_PLACED`) → owner notify. Single clean hook.
- **payment**: hook `sales.service.recordPayment` → `payment` event (manual MoMo confirmation for now; real callback awaits PayTrack).
- **team**: tap `audit.processor` for high-signal actions (SALE_VOIDED, unauthorized DISCOUNT_APPLIED, PIN_FAILED, USER_ROLE_CHANGED, LOGIN) → owner notify. Caveat: "large discounts" only audited when unauthorized/below-cost; "logins" audit coverage partial (BIZ-2.9).
- **billing**: reuse `subscriptions.scheduler` → notify on TRIAL_ENDING_SOON/ENDED, PAST_DUE, plan-limit. Failed-charge path awaits a payment provider.

---

## Decisions needed

| #   | Decision                                            | Blocks            | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D7  | Canonical profit basis                              | Phase 2 (4.1/4.2) | ✅ **SIGNED OFF 2026-08-18** — Income-Statement basis; align `daily_sale_summaries`                                                                                                                                                                                                                                                                                                                                                            |
| D9  | Ageing basis                                        | Phase 3 (4.3/4.4) | ✅ **SIGNED OFF 2026-08-18** — `COALESCE(due_date, created_at + defaultCreditDays)`, 7/15/30                                                                                                                                                                                                                                                                                                                                                   |
| N1  | New `NotificationType` values vs a `category` field | Phase 0           | **DECIDED** — add distinct types (avoid overloading `PAYMENT_REMINDER`)                                                                                                                                                                                                                                                                                                                                                                        |
| N2  | Recipient model                                     | Phase 0           | **DECIDED** — two levels: business-level event×channel matrix (owner-configured) **+ per-recipient event subscription** (each added recipient configurable for which alerts they get). Owner + added members.                                                                                                                                                                                                                                  |
| N3  | Paid-channel (SMS/WhatsApp) gating                  | Phases 1–4        | ✅ **SIGNED OFF 2026-08-18** — in-app + email always; WhatsApp only via **manual one-tap** (owner's own WhatsApp, no credit cost). **SMS is entirely disabled**: it currently routes through WAHA (a WhatsApp transport, not a real SMS gateway), so the SMS channel is **off by default, cannot be enabled, and its Settings toggle is disabled** until a real SMS provider is wired. Automated SMS/WhatsApp send + credit metering deferred. |
| N4  | Quiet-hours scope + urgent bypass                   | Phase 0           | Business-level quiet hours; urgent events (e.g. billing PAST_DUE) bypass                                                                                                                                                                                                                                                                                                                                                                       |
| N5  | Offline delivery                                    | all               | Accept: bell is online-only; the offline-first stock path is the Phase-1 "À commander" surface; digests/reminders are online nudges                                                                                                                                                                                                                                                                                                            |

---

## Jira restructure (apply manually — Atlassian MCP disconnected this session)

- **New epic** "Notifications & Alerts" (or extend Epic 4) with:
  - `N0 — Notifications foundation` (control plane + dispatcher + Settings backend) — **NEW, blocks all**.
  - **BIZ-4.6** velocity reorder — **DONE** → move to Done.
  - `BIZ-4.5` lowStock digest / À commander — depends N0.
  - `BIZ-4.1` profit def (D7) + `BIZ-4.2` daily digest — depend N0 + D7.
  - `BIZ-4.3` debt reminders (D9) + `BIZ-4.4` ageing widgets (D9) — depend N0 + D9.
  - `N-newOrder`, `N-payment`, `N-team`, `N-billing` — **NEW** cross-cutting producers.

## Cleanup noted

- Stray migration file with a literal space in the name: `apps/api/src/database/migrations/1779400000000-notification_provider copy.ts` (Windows "copy" duplicate next to `1779400000001-notification_sender.ts`). Verify and remove if accidental.

## Key source references

- Handoff: `plans/IMPLEMENTATION-HANDOFF.md` Part III (Epic 4, lines 416-468), Part II decisions (D7 114-120, D9 125-128), Part IV sequence (524-558).
- Settings preview: `apps/desktop-v2/src/renderer/src/components/settings/NotificationsSection.tsx` + `i18n/messages.ts` `ntf.*`.
- Delivery: `apps/api/src/modules/notifications/` (services/processors/providers/controllers).
