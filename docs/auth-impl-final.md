# Authentication & Onboarding Module
## Complete Documentation — Business Process, Design Decisions & Implementation Guide
**BizTrack CM · Version 1.0 · NestJS + TypeORM + PostgreSQL**

---

## 1. Purpose & Business Context

BizTrack CM is a business management platform targeting small and medium enterprises in Cameroon — primarily shop owners, pharmacies, restaurants, and service businesses in Douala, Yaoundé, and Buea.

The authentication module is the entry point to the entire platform. It must solve several challenges unique to this market:

**Bilingual country.** Cameroon is officially French and English speaking. Every message — OTP texts, error messages, notifications — must be delivered in the user's chosen language from the very first interaction.

**Mobile-first, offline-capable.** Many users operate in areas with unreliable internet. The auth module must support password-based login so users can authenticate against a locally stored credential hash when offline. This is why **password is mandatory at registration** even though a verified phone number would be sufficient for online-only auth.

**Phone as primary identity.** Most Cameroonian SME owners identify themselves by phone number, not email. Their MTN MoMo and Orange Money accounts are tied to their phone. Email is optional — it provides an additional recovery method and enables reports to be sent by email, but it must never be a barrier to registration.

**Plan tied to a business, not a person.** A user is a person. A business is an entity. Plans, permissions, and subscriptions belong to the business. This distinction matters because:
- One person can own multiple businesses (a pharmacy owner who also runs a boutique)
- One person can be a staff member at multiple businesses (a cashier who works at two locations)
- The same user account must be able to switch between business contexts seamlessly

**Staff invitation.** Business owners need to invite staff — cashiers, managers, accountants — to join their business on the platform. An invited person may or may not already have a BizTrack CM account. The auth flow must handle both cases gracefully, preserving the invitation context through the entire registration process if the person is new.

---

## 2. Key Design Decisions & Why

### 2.1 Password is Mandatory

**The problem:** We are building an offline-first product. When the device has no internet, it cannot reach our server to verify an OTP sent by SMS. Without a locally verifiable credential, the user would be locked out of their own POS system during a power or internet outage — which in Cameroon can happen mid-trading-day.

**The decision:** Password is required at registration. The bcrypt hash of this password is stored locally on the device (in the OS secure enclave — iOS Keychain / Android Keystore / Electron safeStorage). When offline, the app runs `bcrypt.compare(enteredPassword, storedHash)` locally and grants access without any server round-trip.

**The tradeoff:** We add one field to the registration form. The benefit — true offline login — is worth this small friction. Users who forget their password can still reset it through their verified phone number when back online.

---

### 2.2 Phone Verification Before Email Verification

**The reason:** Phone is the primary identity on this platform. It is the channel through which OTP codes are delivered, Mobile Money payments are collected, and support is reached. We must verify the phone first to establish the core identity. Email is supplementary — if provided, it must also be verified, but it comes second.

**Consequence for login:** If a user has an email on their account but has not yet verified it, the login flow sends an email OTP to complete verification. Once the email OTP is verified, tokens are issued **immediately** — no password step is needed. The email OTP itself is proof of identity in that moment. Routing the user to a password screen after they have just proven their identity via OTP would be redundant friction.

---

### 2.3 Business is Auto-Created After Registration

**The problem:** A plan belongs to a business, not a user. We cannot let a user select a plan before a business record exists. But we also cannot make "create your business" a prerequisite for completing registration — that would block token issuance and create a broken state if the user abandons mid-flow.

**The decision:** The moment registration verification completes (after phone OTP, or after email OTP if email was provided), we automatically create a default `Business` record for the user with:
- `name: "{user.name}'s Business"` — a placeholder they will update in the next step
- `type: null`, `city: null` — filled in during SETUP_BUSINESS
- `businessStatus: ONBOARDING` — signals that the business is not yet fully set up
- `plan: FREE` — safe default

We also automatically create a `BusinessMember` record linking the user to this business with `role: OWNER`. This is the canonical ownership record.

The user is immediately issued **Phase 2 tokens** (tokens that carry `businessId`) and sent to `nextStep: SETUP_BUSINESS`. Their token works immediately — they can make authenticated requests. The business just needs its details filled in before plan selection.

**Why not ask for business details during registration?** We could, but it increases the registration form length and drop-off rate. We have the user's attention now — verify them fast, get them into the product, then ask for more information once they're invested.

---

### 2.4 Two-Phase Token System

**The problem:** At the end of the registration flow, the user has one business and we know which one it is, so we issue a token with `businessId` immediately. But at the end of the login flow, the user may have multiple businesses — their own plus businesses they have been invited to. We cannot know which business to embed in the token until they tell us.

**The decision:** We use two distinct JWT payload types:

- **Phase 1 token** `{ type: 'phase1', businessId: null, role: null }` — issued after successful login before business selection. Grants access only to `GET /businesses/mine` and `POST /auth/select-business`. Nothing else.

- **Phase 2 token** `{ type: 'phase2', businessId, role }` — issued after business selection. Grants full access to business resources within the limits of the user's plan and role.

**For registration**, we skip Phase 1 entirely. There is only one business — the one we just created — so we issue Phase 2 tokens directly.

**For login**, we always issue Phase 1 first, then require business selection, even if the user only has one business. This keeps the login flow consistent and eliminates special-case logic. The frontend can detect a single-business account and auto-select it without showing a picker screen — but the server always goes through the same path.

**The `role` in the JWT** means every guarded endpoint knows the user's role without a database query. When a business owner downgrades a cashier to a different role, the updated role takes effect on the next token refresh — because the refresh endpoint re-queries `BusinessMember.role` from the database before issuing the new token.

---

### 2.5 Invite-Token-Aware Registration

**The problem:** A business owner wants to invite a new employee who does not yet have a BizTrack CM account. The owner sends an invite (via SMS, WhatsApp, or email). The invite contains a link. When the new employee opens the link and registers, they should land directly in the invited business — not in a default business they own.

**The decision:** The invite link carries a UUID token (`inviteToken`). The frontend captures this token from the deep link and carries it in the request body through every step of registration (`register`, `verify-phone`, `verify-email`). When `completeRegistration()` runs:

1. If `inviteToken` is present, valid, not expired, and the invite was sent to the registering user's phone or email — the user is linked to the invited business, the default business creation is skipped, and the user lands on `DASHBOARD` with the invited business context.

2. If the invite token is missing, expired, already used, or was sent to a different contact — the system silently falls back to creating a default business. Registration completes normally. The user can request a new invite link separately. **This silent fallthrough is intentional** — a bad invite token should never block a user from completing registration.

**Security:** The invite token is validated against the registering user's phone or email. An invite sent to `+237691000001` cannot be claimed by someone registering with `+237691000002`. The token alone is not sufficient — the contact must match.

---

### 2.6 Refresh Token Rotation with Family Invalidation

**The problem:** Refresh tokens are long-lived (30 days). If a refresh token is stolen, the attacker can maintain access indefinitely by refreshing before the victim does.

**The decision:** On every use of a refresh token:
1. The old token is marked `used: true`
2. A new token is issued in the same `familyId`

If a refresh token that has already been marked `used: true` is presented again, this signals that someone is replaying a stolen token. The response is to revoke **every token in that family** immediately, forcing the legitimate user to log in again. This is the same pattern used by Auth0 and modern OAuth implementations.

**The `familyId`** links all rotations of a single login session. A new login creates a new family. A refresh inherits the family. This means a compromised session affects only that session — other sessions the user has on other devices are unaffected.

---

### 2.7 OTP Hashed with SHA-256, Not bcrypt

OTPs and passwords are both sensitive but in different ways:

- **Passwords** are long-lived, user-chosen, and potentially reused across services. They deserve bcrypt's slow hashing (cost 12) to resist brute force if the database is compromised.
- **OTPs** are short-lived (10 minutes), system-generated 6-digit codes, and single-use. bcrypt would add ~300ms per OTP verification — unnecessary for something that expires in minutes and allows only 5 attempts.

SHA-256 is used for OTPs. It is instant and entirely adequate given the 10-minute TTL and 5-attempt limit.

---

### 2.8 Generic Error Messages for Login

The login endpoint always returns `INVALID_CREDENTIALS` regardless of whether the user does not exist or the password is wrong. This prevents **user enumeration** — the ability for an attacker to probe the system to discover which phone numbers have registered accounts. Knowing an account exists is the first step to targeting it.

---

## 3. The Business Flow — How a User Experiences This

### 3.1 New Owner Registering

```
1. User downloads the app or visits the web app
2. Chooses language (French or English)
3. Enters: name, phone number, password, optional email
4. Receives OTP via SMS (or WhatsApp if preferred)
5. Enters OTP — phone verified
6. If email was provided: receives email OTP, enters it — email verified
7. Default business is automatically created in the background
8. User is now authenticated with a Phase 2 token
9. User fills in business name, type (épicerie, pharmacie, etc.), city
10. User selects a plan (Free, Solo, Business, or Pro)
    — Paid plans start a 30-day free trial, no payment yet
11. User optionally adds their first product (strongly nudged, but skippable)
12. User lands on the dashboard — ready to record sales
```

Total time from download to first sale: **under 5 minutes** for a motivated user.

---

### 3.2 Existing User Logging In (Single Business)

```
1. User enters phone number or email
2. Server determines login method (password, since everything is verified)
3. User enters password
4. Phase 1 tokens issued
5. Server returns their one business automatically (frontend auto-selects)
6. Phase 2 tokens issued with their business context
7. User lands on dashboard
```

---

### 3.3 Existing User Logging In (Multiple Businesses)

```
1-4. Same as above — Phase 1 tokens issued
5. Frontend fetches /businesses/mine — gets list of 2+ businesses
6. User sees a business picker: "Boutique Étoile (Owner) | Pharmacie Muna (Cashier)"
7. User taps their choice
8. Phase 2 tokens issued for the selected business
9. User lands on dashboard for that business
10. User can switch to another business at any time — calls select-business again
```

---

### 3.4 Invited Staff Member (New to BizTrack CM)

```
1. Business owner invites a cashier via WhatsApp: "Join Boutique Étoile on BizTrack"
2. Cashier opens the link — sees: "Boutique Étoile invites you as Cashier"
3. Cashier taps "Accept & Create Account"
4. Completes registration (name, phone, password)
5. OTP verified
6. System detects invite token — links cashier to Boutique Étoile
7. Default business creation is skipped
8. Cashier lands directly on Boutique Étoile's dashboard with Cashier permissions
9. Cashier can only see: Sell screen, basic product list — no reports, no expenses
```

---

### 3.5 Invited Staff Member (Already Has a BizTrack CM Account)

```
1. Business owner invites an existing BizTrack CM user
2. System detects user already exists — creates a BusinessMember record (status: PENDING)
3. User receives notification: "Boutique Étoile has invited you to join"
4. User logs in normally → lands on business picker
5. Business picker shows: "Boutique Étoile (Cashier — Pending)"
6. User taps to accept → BusinessMember status updated to ACTIVE
7. Phase 2 tokens issued for Boutique Étoile
```

---

## 4. Module Structure & What Each File Does

```
apps/api/src/modules/auth/
│
├── auth.module.ts
│   Registers all providers, imports TypeOrmModule for User, RefreshToken,
│   OTP, Business, BusinessMember, PendingInvite entities.
│   Imports JwtModule, PermissionsModule, I18nModule.
│
├── auth.controller.ts
│   Exposes all HTTP endpoints listed in Section 6.
│   Applies guards, rate limit decorators, and i18n context.
│   No business logic here — delegates entirely to auth.service.ts.
│
├── auth.service.ts
│   Contains all business logic for the auth flow.
│   Key private methods: completeRegistration(), createDefaultBusiness(),
│   issueTokens(), issuePhase1Response(), validateOTP(), sendOTP().
│
├── auth.service.spec.ts
│   Unit tests for all service methods.
│   Mock all repositories and external services.
│
├── dto/
│   ├── register.dto.ts          name, phone, password, email?, locale?,
│   │                            preferredOtpChannel?, inviteToken?
│   ├── verify-phone.dto.ts      phone, otp, inviteToken?
│   ├── verify-email.dto.ts      email, otp, inviteToken?
│   ├── request-login.dto.ts     identifier, preferredOtpChannel?
│   ├── login.dto.ts             identifier, password
│   ├── login-otp.dto.ts         identifier, otp
│   ├── refresh.dto.ts           refreshToken
│   ├── logout.dto.ts            refreshToken
│   └── select-business.dto.ts   businessId
│
├── strategies/
│   ├── jwt.strategy.ts
│   │   Validates access tokens. Extracts payload. Populates req.user.
│   │   Accepts both Phase1 and Phase2 tokens.
│   │
│   └── jwt-refresh.strategy.ts
│       Used only by the refresh endpoint. Validates refresh token format.
│
├── guards/
│   ├── jwt-auth.guard.ts
│   │   Standard JWT guard. Accepts Phase1 and Phase2 tokens.
│   │   Apply to any endpoint that needs a logged-in user.
│   │
│   ├── jwt-refresh.guard.ts
│   │   Used only on POST /auth/refresh.
│   │
│   └── phase2.guard.ts          ← NEW
│       Extends JwtAuthGuard. Additionally checks req.user.type === 'phase2'.
│       Apply to ALL business-resource controllers (products, sales, reports, etc.).
│       Returns 403 with nextStep: SELECT_BUSINESS if Phase1 token is used.
│
└── decorators/
    ├── public.decorator.ts      Marks endpoint as no-auth-required.
    └── current-user.decorator.ts  Extracts req.user into a method parameter.
```

---

## 5. New Database Tables

### What is new and why each table exists

**`users`** — Core identity table. One row per person. Holds phone (primary identity), optional email, password hash, verification status, onboarding progress, and account lock state. The `onboardingStep` column is the server's memory of where a user abandoned onboarding — returning users resume from the correct step.

**`refresh_tokens`** — Stores hashed refresh tokens for rotation and family-based revocation. The `familyId` column groups all rotations of a single login session. The `businessId` column records the business context so a refresh can reconstruct the correct Phase 1 or Phase 2 token without an extra DB query. The `used` boolean is the cornerstone of reuse detection.

**`otps`** — One row per OTP sent. Stores the SHA-256 hash of the code (never plaintext), the channel it was sent on, the attempt count, and expiry. When a new OTP is requested for the same user and type, all previous unverified OTPs of that type are immediately expired (their `expiresAt` is set to now) — preventing confusion from multiple active codes.

**`businesses`** — One row per business entity. Holds business details, plan, subscription status, and trial dates. The `businessStatus` column tracks onboarding progress at the business level (ONBOARDING → PLAN_PENDING → ACTIVE). Importantly, `type` and `city` are nullable — they start null and are filled in during the SETUP_BUSINESS onboarding step.

**`business_members`** — The join table between users and businesses. This is where multi-tenancy lives. One user can have many memberships; one business can have many members. Each membership carries a `role` (OWNER, MANAGER, CASHIER, ACCOUNTANT) and a `status` (ACTIVE, PENDING, REMOVED). A unique constraint on `(business_id, user_id)` ensures a user cannot have duplicate memberships in the same business.

**`pending_invites`** — Holds invitations sent to people who do not yet have a BizTrack CM account. The `token` (UUID) is embedded in the invite link. The `phone` and `email` fields record who the invite was sent to — used to validate that the person registering is actually the intended recipient. The `acceptedAt` timestamp is set when registration completes, permanently marking the invite as used.

---

## 6. Endpoints — What Each Does and Why

### POST /auth/register
**Purpose:** Creates a new user account and triggers phone verification.

**Why password here?** We collect the password at registration so it can be hashed and later delivered to the device for offline auth. If we collected it later (e.g. after plan selection), we would have a window where a partially-onboarded user could not use the app offline.

**Why store inviteToken in Redis?** We cannot trust the client to carry the invite token faithfully through multi-step verification without verification on our side. We store a copy server-side (Redis key: `invite:{userId}`, TTL 30 min) as a check. The client still sends it in the body — we compare both. If they match, we proceed. If the client loses the token between steps, the Redis copy is the fallback.

**Rate limit:** 5 requests per 15 minutes per IP. Strict because this creates a real database record and sends an SMS — both have a cost.

---

### POST /auth/verify-phone
**Purpose:** Validates the phone OTP. This is the first gate to becoming a real user.

**After verification:**
- If email was provided at registration → transition to `VERIFY_EMAIL`, send email OTP
- If no email → call `completeRegistration()` which either links the user to an invited business (if invite token is valid) or creates their default business

**Why does this endpoint accept `inviteToken`?** Because if no email was provided, this is the last verification step — `completeRegistration()` is called directly from here. The invite token must be present in this request.

---

### POST /auth/verify-email
**Purpose:** Validates the email OTP. Called both during registration (to complete the email verification step) and during login (when a user's unverified email needs to be verified before proceeding).

**The key distinction between registration and login contexts:**
- **Registration context** (`onboardingStep === VERIFY_EMAIL`): call `completeRegistration()` — create/join business, issue Phase 2 tokens
- **Login context** (any other `onboardingStep`): the email OTP proves identity — issue Phase 1 tokens directly, no password step needed

This is determined by the `onboardingStep` field on the user record — the server always knows the context without the client needing to declare it.

---

### completeRegistration() — Private Service Method
**Purpose:** The branch point that decides whether a newly verified user joins an invited business or creates their own.

**Branch A — Invite path:**
Conditions: `inviteToken` present + not expired + `acceptedAt` is null + invite's `phone` or `email` matches the registering user's.

Actions:
1. Create `BusinessMember` linking user to invite's `businessId` with invite's `role`
2. Mark `PendingInvite.acceptedAt = now()`
3. Set user's `onboardingStep = COMPLETE`
4. Issue Phase 2 tokens for the invited business
5. Return `nextStep: DASHBOARD`

The user skips SETUP_BUSINESS and SELECT_PLAN entirely — they are staff, not an owner. They have no business to set up and no plan to select.

**Branch B — Default business path:**
All other cases (no invite token, invalid token, expired token, token for wrong contact).

Actions:
1. Create `Business` with placeholder name and `businessStatus: ONBOARDING`
2. Create `BusinessMember` with `role: OWNER`
3. Set user's `onboardingStep = SETUP_BUSINESS`
4. Issue Phase 2 tokens for the new business
5. Return `nextStep: SETUP_BUSINESS`

**The silent fallthrough is a deliberate business decision.** We never want a bad invite token to block a registration. If the invite is invalid, the user gets a working account. They can request a new invite from the business owner afterwards. The alternative — failing the registration — would create frustrated users who blame the platform rather than the expired link.

---

### POST /auth/request-login
**Purpose:** The login entry point. Takes a phone number or email, determines what the server needs from the user next, and returns a `nextStep` directive.

**This endpoint never authenticates the user.** It only tells the frontend what to show next. Authentication happens in `POST /auth/login` or `POST /auth/login-otp`.

**Why is this a separate step?** Because we cannot know what login method to show until we look up the user's account state. A user without a verified email needs a different flow than a user with a verified email. A user without a configured password needs OTP instead. The server resolves all of this and tells the frontend exactly what to render — the frontend never makes this decision.

**Security note:** A non-existent user returns `404 INVALID_CREDENTIALS` — the same error as a wrong password. This prevents an attacker from using this endpoint to discover which phone numbers have BizTrack CM accounts.

---

### POST /auth/login
**Purpose:** Validates password credentials for fully verified users.

**Account lockout logic:**
- After 10 consecutive wrong passwords, the account is locked for 1 hour
- `lockedUntil` is stored on the user record
- On success, `failedLoginAttempts` is reset to 0 and `lockedUntil` is cleared
- The frontend is told the `lockUntil` timestamp so it can show a countdown

**Why 10 attempts?** 5 would be too aggressive for a mobile keyboard where typos are common. 10 gives genuine users enough room to correct mistakes while still protecting against brute force. Combined with the IP-level rate limit, the window for an attack is very narrow.

---

### POST /auth/select-business
**Purpose:** Exchanges a Phase 1 token for a Phase 2 token with a specific business context.

**This is also the business-switching endpoint.** A user already holding a Phase 2 token (for Business A) can call this endpoint to switch to Business B. The current token is not revoked — it expires naturally in 15 minutes. The new Phase 2 token is issued for Business B. This enables seamless context switching without a full logout-login cycle.

**The `nextStep` returned depends on:**
- The user's role (OWNER vs staff)
- The business's `businessStatus` (ONBOARDING / PLAN_PENDING / ACTIVE)
- OWNER + ONBOARDING → `SETUP_BUSINESS` (resume incomplete onboarding)
- OWNER + PLAN_PENDING → `SELECT_PLAN` (business set up, plan not selected)
- OWNER + ACTIVE → `DASHBOARD`
- Any staff role → `DASHBOARD` (staff never go through onboarding)

This means a user who started onboarding, closed the app, and returned days later will be sent back to exactly where they left off.

---

### POST /auth/refresh
**Purpose:** Issues a new access + refresh token pair using the current refresh token.

**Why re-query `MemberRole` on every refresh?**
The role is stored in the JWT payload for fast access on every request. But roles can change — an owner can demote a manager, or remove a member entirely. By re-querying the current role from `BusinessMember` on every refresh, we ensure that role changes take effect within 15 minutes (the access token TTL) without requiring a logout.

**Reuse detection:**
If a refresh token marked `used=true` is presented, the entire token family is revoked and the user is forced to log in again. This is the correct response to a stolen token being replayed. The legitimate user will be forced to log in again, but their account is protected.

---

### GET /invites/:token
**Purpose:** A public endpoint that returns human-readable information about an invite before the user commits to registering.

**Why not embed all this in the invite link?** Invite links contain only the token UUID. All invite details are fetched fresh from the server. This means if a business owner cancels an invite after sending it, the next person to open the link will see a 404 rather than stale information.

**What it returns:** `businessName`, `role`, `invitedByName`, `expiresAt`, and a masked version of the contact the invite was sent to (e.g. `+237 6XX XXX X67`). It does NOT return `businessId` or `invitedBy userId` — only display information. The actual linking happens server-side after registration.

---

## 7. Rate Limiting — Business Reasoning

Rate limits exist to protect three things: our SMS/WhatsApp costs, our database, and our users' accounts.

| Endpoint | Limit | Window | Why This Limit |
|----------|-------|--------|----------------|
| POST /auth/register | 5 / IP | 15 min | Each registration sends an SMS and writes to DB. Cost protection. |
| POST /auth/verify-phone | 10 / phone | 15 min | 5 attempts per OTP + some room for resends |
| POST /auth/verify-email | 10 / email | 15 min | Same reasoning |
| POST /auth/request-login | 10 / identifier | 15 min | Prevents OTP spam to a victim's phone |
| POST /auth/login | 10 / phone + 20 / IP | 15 min | Account brute force protection |
| POST /auth/resend-otp | 3 / phone | 10 min | Strictest — direct SMS cost. 3 resends is more than sufficient. |
| POST /auth/refresh | 30 / userId | 15 min | Prevents token grinding |
| OTP attempts | 5 per OTP record | N/A | Force a new OTP after 5 wrong guesses |
| Password attempts | 10 per account | Per account | After 10, lock 1 hour |

Rate limits are enforced in **Redis**, not in memory. This is important for two reasons: memory limits are per-instance (useless when horizontally scaled), and Redis persists across restarts so a restart cannot be used to bypass a limit.

---

## 8. Security Decisions Summary

| Decision | Reason |
|----------|--------|
| Password mandatory | Offline login support |
| bcrypt cost 12 for passwords | Industry standard for password hashing — slow enough to resist GPU brute force |
| bcrypt cost 10 for refresh token hashes | Tokens are random 64-byte strings — not user-guessable. Lower cost is fine. |
| SHA-256 for OTP hashes | OTPs are short-lived, attempt-limited. bcrypt overhead is unnecessary. |
| Generic error for login failures | Prevents user enumeration |
| Refresh token rotation | Limits stolen token window to one use |
| Family invalidation on reuse | Detect and contain compromised sessions |
| inviteToken in request body, not URL | Keeps token out of server logs and browser history after first click |
| Invite phone/email match validation | Invite cannot be claimed by someone other than the intended recipient |
| Silent fallthrough on bad invite | Never block registration over a bad invite token |
| Role re-queried on refresh | Role changes propagate without requiring logout |

---

## 9. i18n — What Needs to Exist

All user-facing strings go through `nestjs-i18n`. Every call to `this.i18n.translate()` requires a matching key in both `i18n/en/*.json` and `i18n/fr/*.json`.

**Locale resolution order (per request):**
1. Authenticated user: `user.locale` from DB (saved at registration)
2. `req.query.locale` — useful for testing any endpoint in either language
3. `req.body.locale` — sent by the frontend for unauthenticated requests
4. `Accept-Language` header
5. Default: `en` in development, `fr` in production

**Why French as production default?** Cameroon is approximately 80% Francophone. French is the safe default for any user whose preference we do not know.

**Notification locale:** SMS, WhatsApp, and email notifications run in background jobs and schedulers that have no HTTP request context. The user's `locale` must be passed **explicitly** to `NotificationsService.sendOTP({ ..., locale })`. It is never inferred from context in background jobs.

---

## 10. Implementation Order & Sprint Plan

The following order ensures each sprint ends with testable, working functionality.

### Sprint 1 — Foundation (Week 1-2)
**Goal:** The scaffolding everything else depends on.

- Define all enums in `common/enums/index.ts`
- Write and run database migrations for all tables
- Create TypeORM entities with correct decorators and relationships
- Scaffold Auth module (module, controller, service — empty methods)
- Set up JWT strategies (access + refresh)
- Create `Phase2Guard`
- Set up `nestjs-i18n` with locale resolver and all translation JSON files
- Set up Redis connection (`@nestjs-modules/ioredis`)
- Configure `Helmet` and CORS

**Why first?** Nothing else can be built without the database schema, enums, and i18n wiring in place. Changing these later causes cascading changes everywhere.

---

### Sprint 2 — Registration Path (Week 3)
**Goal:** A new user can register, verify, and reach the dashboard or SETUP_BUSINESS.

- `POST /auth/register` — full implementation
- `POST /auth/verify-phone` — full implementation
- `POST /auth/verify-email` — full implementation
- `POST /auth/resend-otp` — full implementation
- `OtpService` — generate, hash (SHA-256), save, validate, expire old OTPs
- `completeRegistration()` — both branches (invite + default business)
- `NotificationsService` — SMS, WhatsApp, Email delivery
- `GET /invites/:token` — invite preview endpoint
- `POST /businesses/setup` — save business name, type, city
- `POST /plans/select` — plan selection (basic version, no payment yet)

**End of sprint:** A new user can register with or without an invite token and reach either DASHBOARD or SETUP_BUSINESS.

---

### Sprint 3 — Login Path (Week 4)
**Goal:** An existing user can log in and reach their dashboard.

- `POST /auth/request-login` — full implementation
- `POST /auth/login` — password verification + account lockout
- `POST /auth/login-otp` — OTP login
- `issuePhase1Response()` — Phase 1 token issuance
- `GET /businesses/mine` — list user's businesses with roles
- `POST /auth/select-business` — issue Phase 2 tokens, resolve nextStep
- `POST /auth/refresh` — rotation + family invalidation + role re-query
- `POST /auth/logout` — revoke refresh token

**End of sprint:** The complete auth flow works end-to-end. An existing user can log in, select a business, and resume onboarding or reach the dashboard.

---

### Sprint 4 — Security Hardening (Week 5)
**Goal:** The auth system is production-ready.

- Redis rate limiting guard — per-identifier limits on all auth endpoints
- Account lockout integration testing
- OTP attempt tracking — verify atomic increment works correctly under load
- Refresh token reuse detection — integration test the family revocation
- Auth unit tests (`auth.service.spec.ts`) — cover all branches
- Security audit: check all endpoints return generic errors where needed
- Load test OTP verification endpoint — confirm SHA-256 performance

**End of sprint:** Auth module is production-ready and test-covered.
