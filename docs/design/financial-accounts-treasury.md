# Financial accounts / treasury (multi-account money movement)

**Status:** Agreed as the **next initiative after Epic 2** (owner decision, 2026-08-14).
Not yet built. This is a ledger-layer feature that overlaps Epic 5 ("one ledger, many
modules") and should be built account-aware from the start.

## The gap it closes

Epic 2's cash sessions model exactly **one** account — the physical cash drawer. But a
Cameroonian shop runs several liquid accounts, each with its own balance, and money
moves between them:

- **Cash** (the till drawer — reconciled per shift by Epic 2)
- **MTN MoMo**
- **Orange Money**
- **Bank**
- (card settlement, etc. — extensible)

Real events the current model can't represent:

- Cash deposited into the MoMo float (Cash −, MoMo +) — a **transfer**, not a "cash
  movement".
- MoMo cashed out to the bank (MoMo −, Bank +).
- A supplier paid **from MoMo** instead of cash (MoMo −, supplier payable −).

Without accounts, we can't say where the business's money actually is.

## The model (target)

- **`financial_accounts`**: `{ id, business_id, type (CASH | MTN_MOMO | ORANGE_MONEY |
BANK | …), name, current_balance, is_active }`. One CASH account is special — it is
  what a cash session reconciles.
- **Every money event posts to one or two accounts** (double-entry-ish):
  - Sale payment (CASH) → Cash +. (MTN_MOMO) → MoMo +. etc.
  - Expense paid from account X → X −.
  - **Supplier payment from account X → X − AND supplier payable (debt) −** (settle a
    payable; NOT a new P&L expense — the cost was booked when stock arrived; matches D3).
  - **Transfer** (e.g. Cash → MoMo) → source −, destination +.
- A **cash session becomes the Cash account's view during a shift**; the MoMo/Orange
  confirmations at close (already on `cash_sessions`) become those accounts' shift
  reconciliation. So treasury _subsumes_ the drawer rather than replacing it.

## Relationship to what's already built

- `cash_movements` (BIZ-2.3) is the **Cash account's** movement log, scoped to a shift.
  Under treasury it generalizes to a movement that names its **account** (and, for
  transfers, a **counter-account**). A cash→MoMo transfer is a cash_movement OUT of the
  Cash account today; treasury adds the MoMo IN leg.
- `PaymentMethod` (CASH, MTN_MOMO, ORANGE_MONEY, CARD, SAVINGS) already tags which
  account a sale payment lands in — treasury turns those tags into balances.

## Decisions locked

- **SUPPLIER_PAYMENT = settle a payable** (reduce the supplier's payable/debt + reduce
  the paying account). NOT a P&L expense. Generalises over the source account (cash /
  MoMo / bank), which is why its full accounting belongs to this treasury phase, not to
  Epic 2. In Epic 2 a SUPPLIER_PAYMENT is recorded as a cash-drawer OUT movement only
  (reconciliation); the payable-settlement + source-account posting land here.
- Build **account-aware from the start** — don't bolt accounts onto the cash drawer.

## Sequencing

After Epic 2 finishes (BIZ-2.3 slice 2 = expense bridge + POS UI, then 2.4–2.6). Align
the posting rules with the Epic 5 ledger so there is one set of accounts, not two. A
dedicated Jira epic to be created when this initiative starts.

## Open points (for build time)

- Where balances live (stored running balance vs derived from movements — prefer stored
  - a verification job, like the period close snapshot in BIZ-5.3).
- Opening balances per account at onboarding.
- Whether transfers are one row (source+counter account) or a paired IN/OUT — one row is
  cleaner for integrity.
- Offline: account balances must be device-derivable and reconcile after sync (LWW on
  the movement rows, balance recomputed).
