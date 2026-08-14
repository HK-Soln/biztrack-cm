# Business calendar: operating days/hours, business_date & accounting periods

**Status:** Design agreed (owner + engineering). Belongs to **Epic 5** (SCRUM-36 —
Accounting Periods & Module Architecture). Not yet built; Epic 5 is scheduled last
because it depends on Epic 2's shifts. This doc captures the confirmed model so the
Epic 5 stories (BIZ-5.1 / 5.2 / and a new operating-hours story) build to it.

## The core idea: three independent settings that nest

These are **not a chain** — they are three separate, owner-configurable settings that
form a hierarchy. A transaction's day rolls up into a month, which rolls up into a year:

```
business_date  (day)   ──rolls up into──▶  accounting_period (month)  ──▶  fiscal_year (year)
   from the day-cutover /                    generated from the                owner sets the
   operating hours + shift                   fiscal year                       start (Jan–Dec default)
```

The fiscal year (Jan–Dec) does **not** derive business_date — it only decides the
month/year bucket for financial reporting. business_date is decided separately, by the
day boundary.

## 1. Fiscal year & accounting periods — BIZ-5.2

- Owner sets the fiscal-year start; **default = calendar year (Jan–Dec)**, OHADA
  convention.
- On creation, generate **all 12 monthly `accounting_periods` eagerly** (never lazily —
  an offline device would race).
- A period has a lifecycle (OPEN → CLOSING → CLOSED → LOCKED) driven by the close
  pipeline (BIZ-5.3). Financial reports bucket by the period a transaction's
  business_date falls in.

## 2. business_date — BIZ-5.1

Answers: _"a sale rung at 1am — is it yesterday's takings or today's?"_ Derivation
(this refines decision D6, which said only "shift-derived"):

- **Primary (robust) source: a per-business day-cutover time**, in the business's local
  timezone. Every transaction gets a business_date from its timestamp regardless of
  whether a shift was open — this is essential because many shops won't reliably
  open/close a till (see BIZ-2.5 abandoned sessions). If business_date depended _only_
  on shifts, an undisciplined till would have no business_date at all.
  - Default cutover = **local midnight** → business_date = local calendar date (the
    common retail case).
  - A late-night business (bar/restaurant open past midnight) sets a dead-hour cutover
    (e.g. 03:00) so a 01:00 sale counts to the previous trading day.
- **Refinement: when a shift (cash_session) is open, the shift's business_date wins** —
  operational reality beats the clock. Sales outside a session ("vente hors caisse")
  fall back to the cutover.
- **Stored on every transaction at write time, never computed at read** (closing time is
  a mutable setting; recomputing later would silently re-bucket history).
- **Timezone matters:** compute in the business's local timezone (Cameroon = WAT /
  `Africa/Douala`, UTC+1), NOT UTC. Today `sale_date` is the UTC calendar date, which
  mis-buckets sales near midnight (the "Douala +1" edge in D6). A business timezone
  setting (default `Africa/Douala`) is part of this.

## 3. Operating days & hours — NEW scope (this decision)

A **first-class per-business setting**: which days the shop trades (e.g. Mon–Sat) and
open/close times. Added to scope explicitly — _reports must be exact and reflect
reality_, even though its use is mostly reporting.

- **Model:** per-weekday open/close (e.g. Mon–Sat 08:00–20:00, Sun closed). A holiday /
  one-off exception list can come later.
- **Use A — informs the day-cutover** that derives business_date (§2). For most retail
  the cutover stays at local midnight; late-night trades derive a dead-hour cutover from
  their hours.
- **Use B — a reporting dimension (the main reason it's in scope):**
  - Distinguish a **closed day** (shop wasn't open) from an **open day with zero sales** —
    two very different facts a report must not blur.
  - **Correct denominators:** a "daily average" must divide by trading days, not by 7.
  - **Out-of-hours anomaly flags:** a sale (or cash movement) stamped outside operating
    hours is worth surfacing — ties into the audit / "Activité" feed (Epic 2 Part B).

## Data shape (indicative, finalised in Epic 5)

- On `businesses` (or a `business_settings` row): `timezone` (default `Africa/Douala`),
  `day_cutover_time` (default `00:00`), `fiscal_year_start_month` (default `1`).
- `business_operating_hours`: per weekday `{ weekday, is_open, open_time, close_time }`
  (+ a later exceptions table for holidays).
- `business_date` (date) added to every transaction table at write time (BIZ-5.1),
  alongside the cheap `currency_code` / `outlet_id` columns (BIZ-5.8).

## Sequencing

Unchanged: this is **Epic 5, after Epic 2**. business_date is shift-aware, so it needs
`cash_sessions` (BIZ-2.1 ✅). The immediate next work (BIZ-2.2 expected-cash) is
independent of all of the above — it operates on shift totals, not business_date.

## Open points for Epic 5 build time

- Exact home for the settings (columns on `businesses` vs a `business_settings` table).
- Whether operating hours need per-outlet variance (defer until multi-outlet is real).
- Holiday/exception calendar (defer to a follow-up; weekly schedule first).
