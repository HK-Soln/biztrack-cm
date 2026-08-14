# Authorization credentials — PIN, scannable card, and NFC-ready

**Status:** Design agreed (owner + engineering), not yet built.
**Relates to:** Epic 3 (Offline PIN & manager authorization). Extends BIZ-3.1/3.2.

## Problem

Manager step-up today verifies a 6-digit **PIN**: the entered PIN is `bcrypt.compare`d
against every authorizing member's stored hash, and the match _is_ the identity
(`authorized_by`). This works, but has two weaknesses:

1. **Offline brute-force.** The PIN hash is distributed to every device (for offline
   verification). A 6-digit PIN is only 10⁶ candidates — a device holder can recover a
   manager's PIN offline. Raised bcrypt cost + a 6-digit minimum mitigate but don't
   eliminate it.
2. **Collision / memorization.** Two authorizers can pick the same PIN (mis-attribution
   on match), and every authorizer must memorize a secret.

We want a **more secure, no-memorization** path for shops that can use it, **without**
removing the PIN for the many Cameroonian shops that have no scanner, and architected so
**NFC hardware drops in later without breaking anything** — and so the scan-for-PIN path
and even the PIN fallback can eventually be **removed cleanly**.

## Locked decisions

1. **PIN stays as the always-available fallback.** Zero setup, no hardware. Never
   removed globally — many shops have no scanner; blocking them is unacceptable.
2. **Add a scannable card** for shops that buy a scanner (the app already scans product
   barcodes, so the workflow is familiar).
3. **The card encodes a high-entropy random token, NOT the PIN.** This is the whole
   point: a 128-bit token's hash on-device is not brute-forceable, it needs no
   memorization, and it can't collide. Putting the PIN on the card would be convenience
   with no security gain.
4. **Owner issues the card and never sees the secret.** The system generates the token,
   stores only its hash, and prints the QR straight to a card/PDF. The owner never knows
   it; the staffer never memorizes it. (This is why owner-issuance fits cards but not
   PINs — an owner setting your PIN would mean the owner knows it. PINs stay
   self-service; cards are owner-issued.)
5. **Issuance is permission-gated**, owner-only by default, delegatable (strongly
   discouraged in copy). This is a **separate** capability from `can_authorize`:
   `can_authorize` = _who may approve a sale_; the new permission = _who may hand out
   credentials_.
6. **Every credential issue / rotate / revoke is audited, and the owner is alerted.**
   Alerts also fire on _unauthorized_ sales (over-limit with no approval) — not on every
   authorized sale (that would be noise).
7. **Revocation is first-class.** Owner can revoke/reissue any card in one tap; the old
   token's hash is invalidated on the next sync, killing a lost card.
8. **NFC is the anti-clone future.** A printed QR is copyable (a photo is a working
   clone), so the card is "a strong secret on paper," not tamper-proof. Accountability
   (logged to the holder) + revocation manage this; true anti-clone is NFC hardware,
   which this design must accommodate without a rewrite.

## Credential model (extensible)

A single **`member_auth_credentials`** table (device SQLite + Postgres), so a new method
is a new row _type_, never a schema change:

| column                                  | notes                                                                |
| --------------------------------------- | -------------------------------------------------------------------- |
| `id`                                    | client uuid                                                          |
| `member_id` / `business_id` / `user_id` | scope + identity                                                     |
| `type`                                  | `PIN` \| `CARD` \| (future) `NFC`                                    |
| `secret_hash`                           | bcrypt (PIN) / hash of the token (CARD) / hash of the NFC UID+secret |
| `version`                               | bumped on rotate                                                     |
| `issued_by`                             | who created it (null for self-set PIN)                               |
| `created_at` / `revoked_at`             | `revoked_at` non-null = dead                                         |
| `label`                                 | e.g. "Sam's card" for the owner's list                               |

- A member may hold **more than one** credential (a PIN _and_ a card).
- Verification never needs the plaintext ahead of time — it hashes the _presented_
  secret and looks for a live credential of the matching `type` whose hash matches.
- **PIN migration:** the existing `business_members.pin_hash/pin_version/pin_set_at`
  either move into this table (cleaner) or the verification service reads both during a
  transition. Decide at build time; the table is the long-term home.

## Verification flow (one service, many methods)

```
verifyAuthorization({ method: 'PIN' | 'CARD' | 'NFC', secret }) → { authorized, byUserId, byName }
```

- Dispatches by `method` to the right credential `type`, scans **live** (non-revoked)
  credentials of authorizing members, `compare`s, returns the matching identity.
- Same rate-limit / lockout / stale-device rules as today (BIZ-3.2) apply per device,
  independent of method.
- **Offline:** credential hashes ride the existing pull channel
  (`TeamMemberSyncRecord` → device), so verification is fully offline. High-entropy
  card/NFC hashes are safe on-device (unlike the PIN).

## Step-up UI (input methods are pluggable)

The existing `ManagerStepUpModal` gains input methods, shown per the business's allowed
set:

- **Type PIN** (default, always available).
- **Scan card** — scanning verifies the token and authorizes _directly_; no PIN field is
  shown or filled, so nothing is exposed. (Reuses the product-barcode scanner.)
- **(future) Tap NFC** — same modal, new input source.

## Removing PIN / scan cleanly, later

A **per-business `allowedAuthMethods`** setting (e.g. `['PIN','CARD']`) drives both the
step-up UI (which inputs to show) and the verifier (which methods to accept). A shop
fully on cards/NFC can disable `PIN`; the scan-for-PIN path is never built (the card path
replaces it). Removing a method = drop it from a business's set — no code change, no
break. NFC = add `'NFC'` to the enum + a credential type + a modal input source.

## Security summary

- **Card token:** 128-bit random, hashed at rest and on-device → not brute-forceable,
  no collision, no memorization.
- **Owner never sees the secret;** it's printed directly.
- **Revocable + versioned;** lost card dies on next sync.
- **Every use is attributed** to the credential holder and logged; owner alerted on
  issue/revoke and on unauthorized sales.
- **Honest limitation:** a printed QR is copyable (photo = clone). Mitigated by
  attribution + revocation; NFC is the anti-clone endgame this design leaves room for.
- **PIN** remains the weakest method (brute-forceable) but is opt-in-removable per shop.

## Suggested slices

1. **Credential model + verification abstraction** — `member_auth_credentials`, the
   `verifyAuthorization({method,secret})` service (both runtimes), sync distribution.
   Refactor current PIN verify onto it (behaviour-preserving). No new UX.
2. **Card issuance + revocation** — owner UI (permission-gated), token generation, print
   the QR to a card/PDF, revoke/reissue, audit + owner alert.
3. **Scan-to-authorize at the till** — step-up modal scan input + direct authorize.
4. **Per-business `allowedAuthMethods`** — config + gating; lets a shop drop PIN.
5. **(future) NFC** — new method + credential type + modal input; no schema/flow change.

## Open questions

- Does the PIN move into `member_auth_credentials` now, or stay on `business_members`
  with a dual-read transition? (Recommendation: move it, so there's one model.)
- Card print format: a small card PDF (batch-printable) vs a single QR on the receipt
  printer? (Boutiques mostly have the 58mm receipt printer.)
- Owner-alert channel: in-app bell only, or also email/SMS for credential events?
