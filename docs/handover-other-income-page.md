# Design Handover — "Other Income" page (BizTrack CM desktop)

**For:** Claude Design · **Goal:** design a well-structured **Other Income** page for the BizTrack CM
desktop app (Electron + React renderer) that fits our existing UI. It must be the visual sibling of the
existing **Expenses** page — same layout grammar, same components, same tokens — because Other Income is
the mirror-image concept (money *in* that isn't product sales, vs. money *out*).

Design **desktop/tablet + mobile** (the app ships both in one screen; see §9).

---

## 1. What the page is

**Other Income** is the ledger of *non-trading income* — money the business receives that is **not**
product revenue:
- **Delivery fees** and other charges collected via a **general payment link** (customer pays a link;
  the settlement is booked here automatically).
- **Deposit-cancellation charges** (kept when a customer cancels a deposit — booked here automatically).
- **Manual entries** the owner records directly (a one-off rebate, scrap sale, commission, etc.).

It feeds the **"Other income"** line on the income statement (P&L). Think of it as **Expenses, but for
income** — an owner who understands the Expenses page should understand this one instantly.

## 2. Where it lives

A **top-level sidebar item** placed right after **Expenses** (the money-flow cluster is
Contacts → Expenses → **Other income** → Deposits → Reports). It needs a **new sidebar icon** — an
"income / money-in" glyph (e.g. a coin/banknote with a downward-into-wallet or a `+` arrow), visually a
sibling of the Expenses receipt icon. On mobile it is reached via the **"More"** tab (not the bottom tab
bar), same as Expenses.

## 3. The design system (match this exactly)

- **One global stylesheet** drives everything by class name: `@biztrack/ui/styles.css`
  (`packages/ui/src/styles/biztrack.css`). Font is **Inter**.
- **Theming:** `<html data-theme data-palette data-chrome>` — 4 palettes (a/b/c/d) × light/dark. Design
  against **palette a, light** (below), but only ever use the **tokens**, never hardcoded hex, so it
  themes automatically.

| Token | a-light value | Used for |
|---|---|---|
| `--surface` | `#ffffff` | cards, panels, modal bg |
| `--inset` | `#f8f9fb` | neutral pills, segmented-toggle track |
| `--border` | `#e4e7ec` | all card/panel/table borders |
| `--text` | `#1a2230` | primary text |
| `--text-2` | `#5a6473` | subtitles, labels |
| `--text-muted` | `#8a93a1` | hints, empty/loading, table headers |
| `--brand` / `--brand-soft` | `#16467a` / `#eaf0f7` | primary actions, active toggle, selected row |
| `--success` / `--success-soft` | `#2f7d4f` / `#eaf4ee` | income amounts, up-trend, "paid" |
| `--warning` / `--warning-soft` | `#b0772e` / `#faf2e6` | attention pills |
| `--danger` / `--danger-soft` | `#c0473f` / `#fbecea` | delete, down-trend |

- **Shared components** (from `@biztrack/ui/biztrack`): `Button` (variants `primary | soft | ghost |
  danger | danger-soft`, plus `block`, `loading`), `Input`, `Select`, `CommandSelect` (searchable
  picker). Reuse them.
- **Reusable class grammar to mirror from Expenses** (`routes/Expenses.tsx`):
  - `.frame` — page wrapper, max-width **1180px**, centered.
  - `.page-head` — header row (h1 **22/700**, subtitle 13.5 `--text-2`), actions on the right.
  - `.seg2` — segmented **week / month / year** period toggle (active = `--brand`).
  - `.minihead` → `.m` — the KPI card row (`.k` label, `.v` **19/700** value, `.h` hint). `.badge`
    `b-up`/`b-down`/`b-warn` for trend chips.
  - `.card` + `.split` — the two-up chart row (donut + trend bars).
  - `.panel` → `.panel-head` (title + toolbar) / `.saletable` (the table) / `.panel-foot` (pagination).
  - `.chip-tag` — small tinted category pill; `.pill-tag` — neutral method pill; `.st` dot-pill for
    status.
  - Modals: `.pay-overlay` scrim → `.pay-modal` (rounded 20, width ~480) with `.pm-head` + `.pm-body`
    form; `.ff` field wrapper + `.lbl2` labels. (Expenses hand-rolls its modal from these classes.)

## 4. Data model (what each row holds)

An **Other Income entry** (`OtherIncomeView`):

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `categoryId` / `categoryName` | string | category (has a **color**) |
| `description` | string | e.g. "Delivery — Douala Zone C" |
| `amount` | number | major units (XAF); **positive income** |
| `currency` | string | 'XAF' → rendered "FCFA" |
| `paymentMethod` | string \| null | CASH / MTN_MOMO / ORANGE_MONEY / CARD |
| `reference` | string \| null | provider ref when paid via a link |
| `source` | `'MANUAL' \| 'PAYMENT_LINK' \| 'DEPOSIT_CHARGE'` | **drives a badge + editability** |
| `note` | string \| null | |
| `date` | ISO date | effective date |
| `createdAt` | ISO datetime | |

**Income category:** `{ id, name, color (hex), … }` — color-only (no icon), exactly like expense
categories. Seeded system categories: **Delivery fees**, **Deposit charges**, **Miscellaneous**; the
business can add its own.

**Editability rule (important):** only `source === 'MANUAL'` rows are **editable/deletable**.
`PAYMENT_LINK` and `DEPOSIT_CHARGE` rows are **system-generated → read-only** (tapping opens a
read-only detail, not an edit form). Design should make this legible (e.g. a small lock affordance or
simply no edit controls for those).

## 5. Page layout (top → bottom) — mirror Expenses, adapted for income

### 5a. Header (`.page-head`)
- **Title:** "Other income". **Subtitle:** something like "Money in that isn't product sales."
- **Right side, in order:**
  1. `.seg2` **period toggle** — Week / Month / Year (drives the KPIs + the list date range).
  2. **"Generate payment link"** button (`Button variant="soft"`, link/QR icon) — creates a general
     payment link booked as other income. **Online-only, and only shown when the business has a
     configured, routable payment provider** (otherwise hidden/disabled — it settles server-side and
     can't be created offline). This is the same generator that also appears on the
     Settings → Payments page.
  3. **"Add other income"** button (`Button variant="primary"`, `+` icon) — manual entry. **Works
     offline** (writes locally and syncs later), like adding an expense — so it is always available.

> **Offline behavior:** manually recording other income is fully offline-capable (the common case).
> The payment-link generator is the only online-only affordance on this page — when offline it should be
> hidden or disabled with a subtle "online only" hint, and the rest of the page (list, KPIs, add) keeps
> working from local data.

### 5b. KPI cards (`.minihead`, four cards)
1. **Total** (period) — big value + `b-up/b-down` trend chip vs previous period; hint "vs {prev}".
2. **Top category** — name · amount, hint = its % share.
3. **Avg / day**.
4. **From payment links** — the share collected via links this period (amount + a subtle % of total),
   since that's the new, interesting number here. (If simpler is better, this 4th card can be "This
   period count".)

### 5c. Optional charts row (`.split`, two `.card`s) — nice-to-have, same as Expenses
- **Category donut** (conic-gradient donut + legend of color-dot · name · % · amount).
- **Income trend** bars (per day/week) + a small 3-stat row (this period / avg / vs last).
If we want a leaner v1, this row may be omitted — but if kept, mirror the Expenses donut+bars exactly.

### 5d. Ledger panel (`.panel`)
**Toolbar (`.panel-head`):** title "Ledger" (or "Entries") on the left, then pushed right:
- **Category** `<select>` (All categories + each category).
- **Source** filter `<select>` (All sources / Manual / Payment link / Deposit charge). *(New vs
  Expenses — Expenses has no source filter.)*
- **Search** input (`.field` with a leading search icon) over description/reference.

**Table (`.saletable`)** columns:

| Column | Notes | Narrow (`.hide-sm`) |
|---|---|---|
| **Date** | e.g. "5 Sep" | — |
| **Description** | bold, truncates | — |
| **Category** | tinted `.chip-tag` in the category color | `.hide-sm` |
| **Source** | badge: Manual / Payment link / Deposit charge (§6) | `.hide-sm` |
| **Method** | neutral `.pill-tag` (Cash / MTN MoMo / …); "—" if none | `.hide-sm` |
| **Reference** | provider ref, mono, truncates; "—" if none | `.hide-sm` |
| **Amount** | right-aligned, **`--success` colored** to read as income (this is the key visual difference from expenses) | — |

Row click → edit (MANUAL) or read-only detail (system rows). No per-row menu; delete lives inside the
edit modal (MANUAL only). **No status column** (income has no pending/paid).

**Pagination (`.panel-foot`):** "showing {n} of {total}", Prev / page / Next links, right-aligned period
total.

### 5e. Empty & loading states
Single centered full-width cell, `--text-muted`, ~32px vertical padding: empty = "No income recorded yet"
(with a hint to add one or generate a link); loading = "Loading…". Mirror Expenses.

## 6. Source badges (new element to design)
A small pill per row communicating provenance — sits in the **Source** column:
- **Manual** — neutral `.pill-tag` (`--inset` bg / `--text-2`).
- **Payment link** — brand-tinted pill (`--brand-soft` bg / `--brand` text) with a small link/QR glyph.
- **Deposit charge** — a distinct tint (e.g. the "Deposit charges" category purple `#8B5CF6` at ~16%),
  glyph optional.
Keep them the same size/shape as `.chip-tag` (9.5px uppercase, 999px radius).

## 7. Modals

### 7a. "Add other income" (manual) — mirror the Expense form modal, trimmed
`.pay-overlay` → `.pay-modal` (width ~480), `.pm-head` (title + `×`), `<form className="pm-body">`.
Fields, in order:
1. **Category** — `CommandSelect` (searchable) + a `soft` "+" to inline-create a category (native color
   input + name + Add/Cancel), exactly like Expenses.
2. **Description** — `Input`.
3. **Amount + Date** — a two-column grid (`Input inputMode="decimal"` + `Input type="date"`).
4. **Method** — `Select` (Cash / MTN MoMo / Orange Money / Card).
5. **Note** — `textarea` (`.ta`, 2 rows).
Footer: `soft` **Delete** on the left (edit mode only, `--danger`); `soft` **Cancel** + `primary`
**Save/Add** on the right. (No vendor, no receipt, no status, no recurring — those are expense-specific.
Receipt upload is optional if we want it.)

### 7b. "Generate payment link" — a shared generator (also used on Settings → Payments)
`.pay-modal` with:
1. **Amount** — `Input` (numeric). Allow **0 = "let the payer choose"** (open amount) with a small
   helper note; > 0 = fixed amount.
2. **Label** — `Input` (what the payer sees, e.g. "Delivery fee — order #1234"). Required.
3. **Income category** — `Select` / `CommandSelect` (where it's booked; defaults to **Delivery fees**).
4. **Note** — optional `textarea`.
After **Create**, the modal switches to a **share view**: a **QR code**, the **link URL** with a
**Copy** button, and the live status ("Waiting for payment → ✓ Paid"). This reuses the existing payment-
link dialog pattern (QR + copy row + realtime status) already used elsewhere in the app — match that.

## 8. Money & date formatting
- **Money:** always via the app's currency helper → `money.format(n)` renders e.g. "6 500 FCFA" (XAF,
  0 decimals). Income amounts should read **positive and `--success`-tinted**. Never hardcode "FCFA".
- **Dates:** short form "5 Sep" (locale-aware, EN/FR).

## 9. Responsive (required — two layouts)
Breakpoints: **mobile < 640 · tablet 640–1023 · desktop ≥ 1024**.
- **Desktop/tablet:** the layout above; table columns Category/Source/Method/Reference carry `.hide-sm`
  and drop under ~680px; table wrapper scrolls-x if needed.
- **Mobile:** a distinct layout like Expenses' — `.m-head` (back + title/subtitle), the KPI/donut as
  stacked `.mcard`s, a `.mlist` of tappable `.mrow` rows (icon + title/sub + right-aligned amount +
  source pill), simple Prev/Next, and a floating **`.mfab`** primary action. Because there are **two**
  primary actions here (add + generate link), the mobile FAB can be the "Add" action with "Generate
  link" as a secondary button in the header, or a small action sheet — your call, keep it thumb-friendly.

## 10. Copy (EN — FR will be added in code)
- Title "Other income" · subtitle "Money in that isn't product sales."
- Buttons: "Add other income", "Generate payment link".
- KPIs: "Total", "Top category", "Avg / day", "From payment links".
- Sources: "Manual", "Payment link", "Deposit charge".
- Empty: "No other income yet — record one or generate a payment link."

## 11. Reference (for the engineer wiring it later)
- Sibling page to copy structure from: `apps/desktop-v2/src/renderer/src/routes/Expenses.tsx`.
- Backend already exists: `GET/POST /income`, `GET /income/categories`, and
  `POST /payment-links/general` (books the settlement as other income). See
  `docs/spec-10-order-payments-income-delivery.md`.

**Deliverable from Claude Design:** a desktop + mobile layout for this page (header, KPIs, optional
charts, ledger table with the Source column/badges, both modals), using the tokens/classes above so it
drops into the existing app.
