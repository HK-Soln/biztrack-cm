# Unified Payments — End-to-End Test Checklist (Spec 07 / 08 / 09)

Verify the whole payments arc: provider registry → payment links → the unified `/pay/{token}` page →
settlement into every payable. Work top-to-bottom; each section assumes the ones above it passed.

Legend: **[ ]** to do · **▶ do** the action · **✓ expect** the result · **⚠** watch for.

---

## 0. Prerequisites (do once)

- [ ] **Migration `1789000000000`** has run (`payment_links` table + `payment_attempts.payment_link_id`).
      ⚠ Without it the API errors on any `payment_attempts` query.
- [ ] **`PAYMENT_LINK_BASE_URL`** (API env) = the pay host, e.g. `https://pay.example.com` (the storefront
      deploy; `/pay/*` renders on any host). Restart the API after setting.
- [ ] **`PAYMENT_MASTER_KEYS`** set (else credentials can't decrypt — the NullMasterKeyProvider fails loudly).
- [ ] Storefront running/deployed and reachable at that host (or same-origin for a store).
- [ ] A test business with a **customer contact** that has a phone number.
- [ ] **Stripe** connected with BOTH `secret_key` (`sk_test_…`) AND `publishable_key` (`pk_test_…`).
      ⚠ Inline card (Elements) needs the publishable key — no key ⇒ card can't mount.
- [ ] **MTN MoMo** connected (sandbox: environment `sandbox`; prod refuses sandbox — env must be `production`).
- [ ] Routes: **CARD → Stripe**, **MTN_MOMO → MTN**, both ACTIVE + verified (Settings → Payments).

---

## 1. Provider setup & routing (Spec 07)

- [ ] ▶ Settings → Payments → connect Stripe. ✓ status becomes ACTIVE; verified methods include CARD.
- [ ] ▶ Connect MTN. ✓ ACTIVE; verified methods include MTN_MOMO.
- [ ] ▶ Set the CARD and MTN_MOMO routes. ✓ each shows its provider.
- [ ] ⚠ If a provider shows PROVIDER_UNAVAILABLE/FAILED, re-verify before testing — routing returns
      "no method" and every downstream pay flow will look broken.

---

## 2. Contact-balance debt collection (Spec 09 §1)

Setup: give the customer **two credit sales** (or debts) of different ages, e.g. 5 000 then 3 000 XAF.

- [ ] ▶ Contacts → the customer → debt actions menu → **Collect balance**.
      ✓ a link dialog opens; the amount equals the **sum of outstanding receivables** (8 000).
- [ ] ✓ QR + copyable URL + "Share on WhatsApp" (prefilled with the customer's number).
- [ ] ▶ Open the URL (`/pay/{token}`). ✓ shows business name, "Balance — {customer}", amount 8 000, method picker.
- [ ] ▶ Pay **6 000** (partial) via MoMo (sandbox) or card.
      ✓ after it settles: the **oldest** debt (5 000) is fully paid, the next reduced by 1 000 (FIFO).
- [ ] ✓ The pay page re-offers the **remaining 2 000** ("partial payment received").
- [ ] ▶ Pay the remaining 2 000. ✓ both debts settled; customer receivable = 0; link → PAID.
- [ ] ⚠ Confirm allocation is **oldest-first** and never over-pays a debt.

---

## 3. Per-payable links (Spec 08)

- [ ] **Debt (single):** a debt row → "Send payment link" → pay → ✓ that debt reduces/settles.
- [ ] **Deposit top-up:** Deposits → an open account → "Send payment link".
      ✓ pay page has an **amount input** (open); ▶ enter an amount, pay. ✓ the deposit account is credited.
- [ ] **Online order:** an unpaid order drawer → "Send payment link".
      ✓ amount = order balance; pay → ✓ order becomes PAID (or PARTIALLY_PAID — see §5).
- [ ] ✓ Re-opening the **same** payable's "Send payment link" returns the **existing** live link (no duplicate).

---

## 4. The public pay page (Spec 08 §6 / Spec 09 §3)

- [ ] **Method chooser:** ✓ only the business's enabled methods appear (CARD / MTN / OM).
- [ ] **Inline card (Elements):** ▶ pick Card. ✓ a Stripe **PaymentElement** renders inline (no redirect).
      ▶ use a Stripe test card (e.g. `4242 4242 4242 4242`, any future date/CVC). ✓ pays, page moves to
      "waiting" then "payment received". ⚠ if it redirects to a hosted page instead, the publishable key
      is missing → card fell back to the hosted link.
- [ ] **MoMo push:** ▶ pick MTN, enter a number, pay. ✓ "approve on your phone" → poll → settles (sandbox
      auto-approves). ⚠ a bad/failed push shows a **whitelisted** reason (e.g. NOT_ENOUGH_FUNDS), never an
      internal error.
- [ ] **Partial cap (balance links):** ▶ enter an amount **greater than the balance**.
      ✓ it's **capped at the live balance** server-side (never charges more than owed).
- [ ] **Terminal states:** ▶ open a PAID link → ✓ "already paid"; an expired/cancelled link → ✓ "unavailable".
- [ ] **Minimal disclosure:** ✓ the page shows only business + label + amount — no customer history.

---

## 5. Split / multiple payments (Spec 08 multi-pay + Spec 09 §4)

- [ ] **On a sale/contact-balance link:** pay in 2–3 instalments (§2 covers this). ✓ each settles, the link
      goes ACTIVE → PARTIALLY_PAID → PAID, and the pay page keeps offering the remainder.
- [ ] **On an online order with a linked sale** (confirm the order first so a sale exists): pay part.
      ✓ order becomes **PARTIALLY_PAID**, the linked sale's balance reduces, a per-payment event is written
      ("Partial payment received."); pay the rest → ✓ order PAID.
- [ ] ⚠ Each Stripe partial is its own PaymentIntent — confirm no double-charge and totals reconcile.

---

## 6. Settlement into every payable (Spec 08 §7 / Spec 09 §1,§4)

Confirm the money actually lands (not just the link status):

- [ ] **Sale** → the sale's `amountPaid`/receivable updates; the linked SALE debt reduces.
- [ ] **Debt / contact-receivable** → the debt(s) reduce/settle (FIFO for contact-balance).
- [ ] **Online order** → `payment_status` PAID/PARTIALLY_PAID + a PAYMENT_RECEIVED event.
- [ ] **Deposit** → the account balance increases by the paid amount.
- [ ] **Merchant notification** fires on settle ("Payment link paid").
- [ ] ⚠ Provider fee capture (Stripe): after a card settles, the attempt's `fee`/`net` populate (Build 12).

---

## 7. Finalize-to-credit + links panel (Spec 09 §5 + links-list UI)

- [ ] ▶ Settings → Payments → **Payment links** panel. ✓ lists ACTIVE/PARTIALLY_PAID links with a status
      pill and "collected X of Y".
- [ ] ▶ On a **partially-paid sale/order** link → **Finish (balance as credit)**.
      ✓ link → PAID; the remaining balance stays as the customer's receivable (already a debt — nothing new
      is charged). ⚠ Finish is **not** offered for debt/deposit/contact links.
- [ ] ▶ **Cancel** an active link. ✓ link → CANCELLED; opening it shows "unavailable".
- [ ] ▶ **Copy** a link. ✓ URL copied.

---

## 8. Online checkout → unified pay page (Spec 09 §6)

- [ ] ▶ On the storefront, add to cart → checkout → pick **Card** (or MoMo) → place order.
      ✓ redirected to **`/pay/{token}?method=…`** (the unified page), **not** `/orders/{token}/pay`.
- [ ] ✓ the chosen method is **pre-selected** but switchable; complete payment as in §4.
- [ ] ▶ Checkout with **Pay-on-delivery**. ✓ no payment page — straight to order confirmation (COD unchanged).
- [ ] ⚠ If a link can't be created, it falls back to the legacy self page — the **order still stands**.

---

## 9. Till credit-sale link (Spec 09 §7)

- [ ] ▶ Sell: ring up a cart, select a **customer**, choose **Credit** (or part cash + credit) → complete.
      ✓ the success screen shows **"Send payment link"** (only when a balance remains).
- [ ] ▶ Open it. ✓ pays the sale's balance via card/MoMo; the sale's receivable reduces; leftover stays credit.
- [ ] ✓ A **fully-paid** sale shows **no** link button.
- [ ] ⚠ The existing in-store **Charge** flow (real-time MoMo push / card link at the till, hold-the-sale)
      is unchanged — smoke-test it still works (attest, charge, split-charge, manager override).

---

## 10. Security invariants (must all hold)

- [ ] Amount is **server-bound** — the client cannot set a charge above the live balance (partial capped).
- [ ] PAID / expired / cancelled links **refuse** further payment.
- [ ] The token alone authorizes **only** paying that one payable — no other data is exposed.
- [ ] Provider **credentials never reach the browser** (only the Stripe **publishable** key + a clientSecret
      for Elements, which is by design).
- [ ] Settlement is **idempotent** — a re-delivered webhook/poll on a terminal attempt does nothing.

---

## Known gaps (don't chase — deferred by design)

- **Link-token WebSocket** isn't built: the pay page settles by **poll** (2.5–3 s), not live push. Expect a
  few seconds' lag, not instant.
- **Reconciliation sweep** (stranded in-store confirmations) runs every 15 min — not instant.
- **Attestation matching** for MoMo isn't built (the Collection API can't look up a payer's SMS reference).
- **Legacy order pay page** (`/orders/{token}/pay`) still exists and works for older links — not yet retired
  (Slice 8).
- A dedicated **sale-detail** "Send payment link" button isn't wired (use the till success screen or the
  customer-debt path); a per-link **detail view** beyond the panel isn't built.

---

## Green-gate commands (developer)

```
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --filter @biztrack/api        exec jest payment online
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --filter @biztrack/api        run type-check
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --filter @biztrack/storefront run type-check
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --filter @biztrack/desktop-v2 run type-check
```
