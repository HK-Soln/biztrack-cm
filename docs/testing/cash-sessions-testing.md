# Testing guide — Cash sessions & movements (Epic 2: BIZ-2.1 / 2.2 / 2.3)

How to run and verify the cash-drawer feature end-to-end on the desktop app: opening a
shift, tagging sales to it, recording off-book cash movements, and watching the
expected-cash reconciliation. Cash sessions are **desktop-first** (the till lives on the
device), so all manual testing is in `apps/desktop-v2`.

---

## 1. What you're testing

| Piece                                                       | Story               | Testable now?               |
| ----------------------------------------------------------- | ------------------- | --------------------------- |
| Open a shift with an opening float                          | BIZ-2.1             | ✅                          |
| Sales tagged to the open shift                              | BIZ-2.2             | ✅                          |
| Expected-cash reconciliation                                | BIZ-2.2             | ✅                          |
| Cash movements (owner draw, drop, change, supplier payment) | BIZ-2.3             | ✅                          |
| Closing the shift (blind denomination count)                | BIZ-2.4             | ❌ not built yet            |
| Recording a till **expense** → P&L bridge                   | BIZ-2.3 (remaining) | ❌ not in the UI yet        |
| Supplier payment reducing the payable                       | Treasury phase      | ❌ records as cash-out only |

**The expected-cash formula being verified:**

```
expected_cash = opening_float
              + Σ CASH sale payments (on COMPLETED sales in the shift)   (tendered)
              − Σ change_given on those sales                             (out of the drawer)
              + Σ cash movements IN                                       (change-in, credit repayment)
              − Σ cash movements OUT                                      (owner draw, drop, change-out, supplier pay)
```

---

## 2. Prerequisites

- A working desktop dev environment (Node ≥ 22.13, pnpm 11.9) with a business you can
  log into and a few products to sell. If you've been running the app already, you're set.
- The migrations that create the tables (`cash_sessions`, `cash_count_lines`,
  `cash_movements`) **apply automatically on app launch** — no manual migration step. On
  Postgres (the API), run `pnpm --filter @biztrack/api migration:run` if you also want the
  server side (not required for desktop testing).

---

## 3. Build & run

From the **repo root**. The `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false` prefix avoids the
better-sqlite3 dep-check that can fail on a locked native rebuild.

```bash
# 1. Build the workspace packages the desktop app consumes
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm \
  --filter @biztrack/types \
  --filter @biztrack/utils \
  --filter @biztrack/ui \
  --filter @biztrack/electron-core \
  build

# 2. Launch the desktop app (also compiles electron-core, then runs electron-vite)
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --filter @biztrack/desktop-v2 dev
```

On first launch after this change, migrations **0066** (`cash_sessions` +
`cash_count_lines`) and **0067** (`cash_movements`) run against your local SQLite DB.

> If you had synced sales/members from before, no resync is needed for this feature —
> new sales get tagged going forward.

---

## 4. Manual test scenarios

Everything happens on the **Sell** screen. Look for the new **"Caisse"** button next to
_add-charge_ in the cart panel (two taps to record a movement).

### Scenario A — Open a shift

1. Tap **Caisse**. With no shift open you'll see _"No shift is open…"_.
2. Enter an **opening float** (e.g. `10000`) → **Open the drawer**.
3. The sheet now shows the expected-cash breakdown: **Opening float 10 000**, everything
   else 0, **Expected cash = 10 000**.

**Pass:** the shift opens and shows the float.

### Scenario B — Cash sales flow into expected cash

1. Close the sheet. Ring a normal **cash** sale (e.g. total **4 500**, tender **5 000** →
   **500 change**).
2. Reopen **Caisse**.

**Pass:** breakdown reads **Cash sales +5 000**, **Change given −500**, **Expected cash =
14 500** (10 000 + 5 000 − 500). The change is subtracted — a 5 000 note in for a 4 500
sale leaves **4 500** in the drawer, not 5 000.

### Scenario C — Discounts don't create a phantom shortage

1. Ring a **discounted** cash sale (e.g. list 5 000, discount 2 000 → total **3 000**),
   paid **3 000** cash exact.

**Pass:** Expected cash rises by exactly **3 000** (the discounted total), not 5 000.
A heavy-discount shift still reconciles to zero variance when the drawer is right.

### Scenario D — Owner draw & movements (the headline)

1. Reopen **Caisse** → under _Record a cash movement_ pick **Owner draw**, amount
   **3 000**, note _"pris par le patron"_ → **Record**.

**Pass:** it appears under _Recent movements_ as **− 3 000**, and **Expected cash drops
by exactly 3 000**. This is the whole point: the owner taking cash no longer reads as a
cashier shortage.

2. Repeat with **Change in** (+, raises expected), **Cash drop** and **Change out** (−,
   lower expected), **Supplier payment** (−). Confirm each nudges expected cash the right
   direction.

### Scenario E — Guards

- **No shift open:** with no shift, recording a movement is refused (open one first).
- **Amount:** an amount of 0 or blank is rejected.
- **One shift per till:** you can't open a second shift while one is open.

---

## 5. Verify at the data layer (optional)

If you want to confirm the persistence directly, open the local SQLite DB (path is logged
on app start; typically under the Electron `userData` dir) and run:

```sql
-- the open shift
SELECT id, status, opening_float FROM cash_sessions WHERE status IN ('OPEN','COUNTING');

-- sales tagged to it
SELECT id, total_amount, change_given, cash_session_id FROM sales
WHERE cash_session_id IS NOT NULL ORDER BY created_at DESC LIMIT 10;

-- movements (amount is whole XAF; sign is in `direction`)
SELECT kind, direction, amount, note FROM cash_movements ORDER BY created_at DESC;
```

**Whole-XAF guard:** a fractional write is rejected by the DB, not just the app. This
should raise _"money amounts must be whole XAF"_:

```sql
UPDATE cash_movements SET amount = 100.5 WHERE 1;   -- expect an ABORT
```

---

## 6. Automated tests (already green)

```bash
# expected-cash math (shared, both runtimes use it)
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --filter @biztrack/utils test expected-cash

# cash-session service: state machine, whole-XAF guard, movements, expected cash
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --filter @biztrack/desktop-v2 test cash-sessions
```

Expect **7** util tests and **12** desktop tests passing.

---

## 7. Known gaps (by design, not bugs)

- **No "close shift" yet** — the blind denomination-count grid is **BIZ-2.4**. A shift
  stays OPEN; that's expected.
- **Expense from the till isn't offered in the sheet** — the EXPENSE→P&L bridge is the
  one remaining BIZ-2.3 piece. Use the normal Expenses screen for now.
- **Supplier payment** records as a cash-OUT movement only; it does **not** yet reduce the
  supplier's payable — that's the treasury phase.
- **Cloud/browser build** doesn't expose the cash drawer yet (desktop uses `window.api`
  directly); a cloud data-client wiring is a follow-up.

---

## 8. Troubleshooting

- **Nothing happens / "available on the desktop app":** you're in the browser build. Use
  the Electron app (`pnpm --filter @biztrack/desktop-v2 dev`).
- **Styles look unstyled:** rebuild `@biztrack/ui` (step 1) and restart — the `.cash-*`
  styles ship in its CSS.
- **better-sqlite3 lock error on build/run:** prefix with
  `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false` (as above), or run the tool from
  `./node_modules/.bin/` directly.
- **Amounts off by the change:** that's the point of subtracting `change_given` — verify
  against Scenario B.

---

## What to report back

For each scenario: pass/fail, and for any failure the numbers you saw vs. expected.
Most useful signal: **does the expected-cash figure match the cash you'd actually expect
in the drawer** for a real sequence of sales + draws?
