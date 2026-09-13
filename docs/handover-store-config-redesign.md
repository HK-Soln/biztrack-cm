# Design Handover — Store Configuration page redesign (BizTrack CM desktop)

**For:** Claude Design · **Goal:** redesign the desktop **Online Store → Configuration** page. It works
but has grown into one long scroll of ~8 stacked cards and feels overwhelming. We want a clearer, more
user-friendly structure (tabs / steps / progressive disclosure), and it must **also accommodate a new,
larger Delivery configuration** we're about to build (§3). Desktop-first (Electron/React renderer), but
the same page is also used in the responsive cloud/browser build, so it must work at tablet + phone
widths too.

The engineer will implement your layout against the existing data + the design system below — so design
with these exact fields, tokens, and constraints in mind.

---

## 1. Context & constraints (must keep)

- **One store per business**, edited by the **owner** only; the store is **online-only** (BUSINESS/PRO
  plan). File: `apps/desktop-v2/src/renderer/src/routes/OnlineStore.tsx`.
- **Draft → Publish model.** Every edit updates a *draft*; the public storefront renders from the last
  **published snapshot**, not the draft. So the page needs: a persistent **Publish** action, a
  **"you have unpublished changes"** indicator, and a **version history / restore** affordance (these
  exist today as a top "history" card — keep the capability, restyle freely).
- **Live preview.** Today a right-hand column shows a live preview of the storefront as you edit. Keep a
  live preview somewhere (side panel, or a toggle on smaller screens).
- **Save + Publish are distinct.** Saving persists the draft; Publishing pushes it live. Make both
  obvious and never conflate them.
- **Gating.** Some payment methods can only be enabled when a verified provider is set up in
  **Organization → Payments** (show an inline hint, don't hard-block the whole page).

## 2. What's on the page today (the content to reorganize)

Currently ~8 `.card` blocks stacked vertically in a left column, with a live-preview right column. The
fields, grouped as they are now:

1. **Publish / history** — publish button, "unpublished changes" state, version list + restore.
2. **Store address** — subdomain/slug (with availability check), custom domain (future).
3. **Store profile** — store name, tagline, logo, banner, phone, WhatsApp number, contact address, city.
4. **Theme & appearance** — layout template (classic / boutique / catalog / landing), colour theme,
   appearance options (fonts/other).
5. **Catalog & pricing** — show out-of-stock, low-stock badges, catalog binding (snapshot vs live).
6. **Orders & payment** — minimum order amount; **payment methods** (Cash on delivery, MTN MoMo, Orange
   Money, Card toggles, gated on provider setup); **Prepayments** (allow a deposit, minimum deposit %,
   minimum order for a deposit, require the deposit); **Cash-on-delivery limits** (no COD below X, no COD
   above X).
7. **Fulfilment** — offer delivery, offer pickup, **flat delivery fee**, **delivery cities** (a free-text
   list of city names), pickup address. **← this whole area is being replaced/expanded, see §3.**
8. **SEO & sharing** — SEO title, SEO description, OG image, robots index; **socials** (Instagram,
   Facebook, X, TikTok, LinkedIn).

**Header** carries the store name + **Active** toggle + **Publish**.

**The problem:** it's a flat wall of cards; related things (all the "payment" vs "fulfilment" vs
"branding" vs "SEO" concerns) aren't visually separated into a navigable structure, so it's hard to scan
and edit confidently.

## 3. The NEW Delivery configuration to design for (replaces today's flat fee + city list)

We're moving from a single flat delivery fee + free-text city list to **address-driven delivery zones**.
Please design the Delivery section for this richer model (it's the biggest new surface):

- **Structured customer address** (this is what the storefront checkout will collect, shown here for
  context): **Country → Region/State → City → full street address.** Country + region come from a
  built-in reference dataset (multi-country); city is a select where data exists, else free text.
- **Delivery zones** — the store defines a list of zones, each with:
  - a **name** (e.g. "Douala – Akwa", "Littoral (other)"),
  - a **fee**,
  - a **match rule** on address components — any of **country / region / city** (most specific wins:
    a city rule beats a region rule beats a country rule).
  So the editor is a **repeatable zone row/list**: name + the geographic scope (country/region/city
  pickers) + fee, with add/remove/reorder. This replaces the old "delivery cities" free-text list and
  the single flat fee.
- **Free delivery over a threshold** — an optional "delivery is free when the order is at least X".
- **Unlisted-area behaviour** — when a customer's address matches no zone, the store owner chooses one of:
  - **Block** — don't offer delivery there (customer must pick pickup, or can't check out for delivery),
  - **Charge a default/fallback fee** — one configurable amount, or
  - **Arrange separately** — let the order through with "delivery fee to be communicated," after which
    the business later sends a **payment link** for the delivery fee (booked as other income). Design a
    clear explanation/among these three as a single-choice setting + the dependent inputs
    (the default-fee input only when "charge a default fee" is chosen).
- **Pickup** stays (offer pickup + pickup address), independent of zones.

Design the zone editor to stay legible with anywhere from 0 to ~20+ zones (scroll, compact rows,
add-zone button). Assume the country/region/city pickers are **searchable selects** (large lists).

## 4. What we want from the redesign

- **A navigable structure** instead of one long scroll — e.g. **left sub-nav / tabs / a stepper** across
  logical groups. A sensible grouping (feel free to improve):
  1. **Storefront** (address/slug + profile + theme/appearance + live preview)
  2. **Catalog** (catalog & pricing, min order)
  3. **Payments** (methods + prepayments + COD limits)
  4. **Delivery & pickup** (the new zones model + pickup)
  5. **SEO & sharing** (SEO + socials)
- **Progressive disclosure** — collapse advanced/less-used options; show dependent inputs only when their
  toggle is on (e.g. deposit % only when "allow a deposit" is on; default-fee only when that unlisted
  behaviour is chosen). This directly fixes the "overwhelming" feeling.
- **Clear Save vs Publish**, a persistent **unpublished-changes** banner, and the **live preview** kept
  accessible (side panel on wide screens; a "Preview" toggle/drawer on narrow ones).
- **Consistent field styling** — label + input + a short muted **description** line under each input
  (some current fields lack the description and read as bare headings; the redesign should make
  every field self-explanatory).
- **Responsive** — works at desktop, tablet, and phone widths (side-preview collapses; tabs become a
  select or top scroller).

## 5. Design system (match this)

- **One global stylesheet**, class-driven: `@biztrack/ui/styles.css`
  (`packages/ui/src/styles/biztrack.css`). Font **Inter**. Theming via `<html data-theme data-palette>`
  — design against **palette a, light**, but use **tokens** only so it themes automatically:
  `--surface`, `--inset`, `--border`, `--text`, `--text-2`, `--text-muted`, `--brand` / `--brand-soft`,
  `--success` / `--success-soft`, `--warning` / `--warning-soft`, `--danger` / `--danger-soft`.
- **Shared components** (`@biztrack/ui/biztrack`): `Button` (primary / soft / ghost / danger),
  `Input`, `Select`, `CommandSelect` (searchable select — use for country/region/city + income/category
  pickers), plus toggles/switches. Cards use `.card` + `.card-h` (h3 title + `p` subtitle); field labels
  `.lbl`; muted helper text `.reserved-note`; section dividers `.divider`.
- Keep the **look** of the current cards (rounded surfaces, 1px `--border`, soft shadow); it's the
  *structure/navigation* we're improving, not the visual language.

## 6. Deliverable from Claude Design

A desktop + responsive layout for the Store Configuration page: the navigable section structure, each
section's fields (using the content in §2 + the new Delivery model in §3), the zone editor, Save/Publish +
unpublished-changes + live-preview affordances, and progressive disclosure for dependent options — using
the tokens/components above so it drops into the existing app.

**Reference (for the engineer wiring it):** current page `apps/desktop-v2/src/renderer/src/routes/OnlineStore.tsx`;
delivery-zone model + rationale in `docs/spec-10-order-payments-income-delivery.md` (slice ③).
