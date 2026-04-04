# Auth Module — Full Implementation Documentation
**BizTrack CM · NestJS Backend · Version 1.0**

---

## 1. Overview

The auth module handles user registration, verification, login, token management, and security hardening. It is the entry point for all platform access. Once auth is complete, the client receives JWT tokens used for all subsequent guarded requests including plan selection and onboarding steps.

### Design Principles
- **Phone-first**: Phone number is the primary identifier, mandatory for all users
- **Password mandatory**: Required at registration to support offline login
- **Server-driven flow**: Every response includes `nextStep` — the frontend never decides flow
- **Progressive verification**: Phone first, then optional email, then password/OTP login
- **Stateless access tokens**: Short-lived JWTs (15 min), long-lived refresh tokens (30 days)
- **Refresh token rotation**: Every use issues a new pair; reuse of old token = family invalidation

---

## 2. File Structure

```
apps/api/src/modules/auth/
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── auth.service.spec.ts
│
├── dto/
│   ├── register.dto.ts
│   ├── verify-phone.dto.ts
│   ├── verify-email.dto.ts
│   ├── request-login.dto.ts
│   ├── login.dto.ts
│   ├── login-otp.dto.ts
│   ├── refresh.dto.ts
│   └── logout.dto.ts
│
├── strategies/
│   ├── jwt.strategy.ts
│   └── jwt-refresh.strategy.ts
│
├── guards/
│   ├── jwt-auth.guard.ts
│   └── jwt-refresh.guard.ts
│
├── decorators/
│   ├── public.decorator.ts
│   └── current-user.decorator.ts
│
└── types/
    └── auth.types.ts
```

---

## 3. Database Entities (TypeORM)

> Full entity definitions with decorators are in the `typeorm-entities` artifact.
> Stack: **TypeORM + PostgreSQL**. All timestamps use `timestamptz`.

**Entities:**
- `User` — `users` table, core identity + onboarding state
- `RefreshToken` — `refresh_tokens` table, rotation + family invalidation
- `OTP` — `otps` table, all OTP types (phone/email/login)

**Key TypeORM patterns used:**
```typescript
// Injection
@InjectRepository(User) private usersRepo: Repository<User>

// Existence check (TypeORM 0.3+)
await this.usersRepo.existsBy({ phone: dto.phone })

// Find with conditions
await this.otpsRepo.findOne({
  where: { userId, type, verified: false, expiresAt: MoreThan(new Date()) },
  order: { createdAt: 'DESC' },
})

// Atomic increment (avoids race conditions on attempt counting)
await this.otpsRepo.increment({ id: otp.id }, 'attempts', 1)

// Bulk update
await this.refreshTokensRepo.update(
  { familyId: token.familyId },
  { revokedAt: new Date() }
)

// OR conditions
await this.overridesRepo.find({
  where: [
    { businessId, expiresAt: IsNull() },
    { businessId, expiresAt: MoreThan(new Date()) },
  ],
})
```

---

## 4. Standard Response Shape

Every auth endpoint returns this shape. The frontend is a pure state machine — it only reads `nextStep` and renders accordingly.

```typescript
// apps/api/src/modules/auth/types/auth.types.ts

export interface AuthStepResponse {
  nextStep: AuthNextStep
  message?: string
  tokens?: TokenPair
  authPermissions?: AuthPermissions
  context?: AuthContext
}

export type AuthNextStep =
  | 'VERIFY_PHONE'
  | 'VERIFY_EMAIL'
  | 'PASSWORD_LOGIN'
  | 'OTP_LOGIN'
  | 'SELECT_PLAN'
  | 'SETUP_BUSINESS'
  | 'ADD_FIRST_PRODUCT'
  | 'DASHBOARD'           // onboarding complete
  | 'REGISTER'
  | 'LOGIN'
  | 'REQUEST_NEW_OTP'

export interface TokenPair {
  accessToken: string     // JWT, 15 min
  refreshToken: string    // opaque token, 30 days
}

export interface AuthPermissions {
  plan: SubscriptionPlan | null
  effectivePermissions: Resource[]
  specialPermissions: SpecialPermission[]
  permissionsIssuedAt: number
  permissionsExpiresAt: number
}

export interface AuthContext {
  maskedPhone?: string        // '+237 6XX XXX X67'
  maskedEmail?: string        // 'm***@gmail.com'
  otpChannel?: OTPChannel
  otpExpiresIn?: number       // seconds remaining
  attemptsLeft?: number
  lockUntil?: number          // unix timestamp
  requiresPlan?: SubscriptionPlan     // for upgrade prompts
}
```

---

## 5. API Endpoints

### 5.1 POST /auth/register

**Guards:** Public (no auth required)
**Rate limit:** 5 requests / 15 min per IP

**Request:**
```typescript
class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(60)
  name: string

  @IsString() @Matches(/^\+237[6-9][0-9]{8}$/)
  phone: string                              // Cameroon format: +237 6XXXXXXXX

  @IsString() @MinLength(8) @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  password: string                           // min 8 chars, upper+lower+digit

  @IsOptional() @IsEmail()
  email?: string

  @IsEnum(OTPChannel) @IsOptional()
  preferredOtpChannel?: OTPChannel          // default: SMS
}
```

**Logic:**
1. Validate DTO — return 422 with field errors if invalid
2. Check phone uniqueness — return 409 if exists
3. Check email uniqueness if provided — return 409 if exists
4. Hash password with bcrypt (cost 12)
5. Create user with `status=PENDING`, `onboardingStep=VERIFY_PHONE`
6. Generate 6-digit OTP, hash it, save to `otps` table with `TTL=10min`
7. Send OTP via SMS (and WhatsApp if preferred)
8. Return `nextStep: VERIFY_PHONE`

**Response (200):**
```json
{
  "nextStep": "VERIFY_PHONE",
  "message": "Code envoyé au +237 6XX XXX X67",
  "context": {
    "maskedPhone": "+237 6XX XXX X67",
    "otpChannel": "SMS",
    "otpExpiresIn": 600
  }
}
```

---

### 5.2 POST /auth/verify-phone

**Guards:** Public
**Rate limit:** 10 requests / 15 min per phone

**Request:**
```typescript
class VerifyPhoneDto {
  @IsString() @Matches(/^\+237[6-9][0-9]{8}$/)
  phone: string

  @IsString() @Length(6, 6) @Matches(/^[0-9]{6}$/)
  otp: string
}
```

**Logic:**
1. Find user by phone — 404 if not found
2. Find latest unverified OTP of type `PHONE_VERIFY` for user
3. Check OTP not expired — if expired: 400, `nextStep: REQUEST_NEW_OTP`
4. Increment `attempts` on OTP record
5. If `attempts >= 5`: 429, `nextStep: REQUEST_NEW_OTP`
6. Compare submitted OTP against stored hash — if no match: 400
7. Mark OTP as `verified=true`
8. Mark user `phoneVerified=true`
9. If email was provided at registration:
   - Set `status=PHONE_VERIFIED`, `onboardingStep=VERIFY_EMAIL`
   - Generate + send email OTP
   - Return `nextStep: VERIFY_EMAIL`
10. Else:
    - Set `status=ACTIVE`, `onboardingStep=SELECT_PLAN`
    - Issue tokens (see §7)
    - Return `nextStep: SELECT_PLAN` with tokens + authPermissions

---

### 5.3 POST /auth/verify-email

**Guards:** Public
**Rate limit:** 10 requests / 15 min per email

**Request:**
```typescript
class VerifyEmailDto {
  @IsEmail()
  email: string

  @IsString() @Length(6, 6)
  otp: string
}
```

**Logic:**
1. Find user by email — 404 if not found
2. Validate OTP (same logic as phone)
3. Mark `emailVerified=true`, `status=ACTIVE`
4. Determine `nextStep` based on `onboardingStep`:
   - `SELECT_PLAN` → `nextStep: SELECT_PLAN`
   - `SETUP_BUSINESS` → `nextStep: SETUP_BUSINESS`
   - `COMPLETE` → `nextStep: DASHBOARD`
5. Issue tokens
6. Return tokens + authPermissions + nextStep

---

### 5.4 POST /auth/request-login

**Guards:** Public
**Rate limit:** 10 requests / 15 min per identifier

**Request:**
```typescript
class RequestLoginDto {
  @IsString()
  identifier: string          // phone or email

  @IsOptional() @IsEnum(OTPChannel)
  preferredOtpChannel?: OTPChannel
}
```

**Logic (server decides everything):**
1. Find user by phone or email — 404 if not found
2. Check if phone is verified:
   - No → send phone OTP, return `nextStep: VERIFY_PHONE`
3. Check if email exists AND is unverified:
   - Yes → send email OTP, return `nextStep: VERIFY_EMAIL`
   - Note: once email OTP is verified in step 5.3, tokens are issued immediately
     — no password step needed since OTP already proved identity
4. All verifications already done → check login method:
   - Password configured → return `nextStep: PASSWORD_LOGIN`
   - No password (edge case) → send login OTP, return `nextStep: OTP_LOGIN`

**The rule:** Password is only required when no OTP was verified in this login
session. An OTP verification = proof of identity = sufficient for token issuance.

**Response:**
```json
{
  "nextStep": "PASSWORD_LOGIN",
  "context": {
    "maskedPhone": "+237 6XX XXX X67"
  }
}
```

---

### 5.5 POST /auth/login

**Guards:** Public
**Rate limit:** 20 requests / 15 min per IP + 10 per phone

**Request:**
```typescript
class LoginDto {
  @IsString()
  identifier: string          // phone or email

  @IsString()
  password: string
}
```

**Logic:**
1. Find user — 401 (generic: "Identifiants invalides" — never say "phone not found")
2. Check `lockedUntil` — if locked: 429 with `lockUntil` in context
3. Compare password with `bcrypt.compare`
4. On failure:
   - Increment `failedLoginAttempts`
   - If `failedLoginAttempts >= 10`: set `lockedUntil = now + 1hr`
   - Return 401 with `attemptsLeft`
5. On success:
   - Reset `failedLoginAttempts = 0`, clear `lockedUntil`
   - Issue tokens
   - Determine `nextStep` from `onboardingStep`
   - Return tokens + authPermissions + nextStep

---

### 5.6 POST /auth/login-otp

**Guards:** Public
**Rate limit:** 10 requests / 15 min per identifier

**Request:**
```typescript
class LoginOtpDto {
  @IsString()
  identifier: string

  @IsString() @Length(6, 6)
  otp: string
}
```

**Logic:** Same OTP validation logic as verify-phone. On success: issue tokens, return nextStep.

---

### 5.7 POST /auth/refresh

**Guards:** JwtRefreshGuard (validates refresh token from body)
**Rate limit:** 30 requests / 15 min per userId

**Request:**
```typescript
class RefreshDto {
  @IsString()
  refreshToken: string
}
```

**Logic:**
1. Hash the incoming refresh token
2. Find matching `RefreshToken` record in DB
3. If not found → 401
4. If `used=true` → **REUSE DETECTED**: revoke entire family, 401
5. If `expiresAt < now` → 401
6. If `revokedAt` set → 401
7. Mark current token as `used=true`
8. Issue new token pair (new `refreshToken` in same `familyId`)
9. Return new tokens

---

### 5.8 POST /auth/logout

**Guards:** JwtAuthGuard
**Rate limit:** None needed

**Request:**
```typescript
class LogoutDto {
  @IsString()
  refreshToken: string
}
```

**Logic:**
1. Find refresh token record
2. Set `revokedAt = now`
3. Return 200

---

### 5.9 POST /auth/resend-otp

**Guards:** Public
**Rate limit:** 3 requests / 10 min per phone/email (strict — prevent SMS spam)

**Request:**
```typescript
class ResendOtpDto {
  @IsString()
  identifier: string          // phone or email

  @IsEnum(OTPType)
  type: OTPType

  @IsOptional() @IsEnum(OTPChannel)
  channel?: OTPChannel        // allows switching to WhatsApp if SMS not received
}
```

---

## 6. DTOs — Shared Validation Rules

```typescript
// All phone numbers: Cameroon format
@Matches(/^\+237[6-9][0-9]{8}$/, {
  message: 'Format: +237 6XXXXXXXX ou +237 9XXXXXXXX'
})

// Password strength
@MinLength(8)
@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
  message: 'Min 8 caractères avec majuscule, minuscule et chiffre'
})

// OTP format
@Length(6, 6)
@Matches(/^[0-9]{6}$/)
```

---

## 7. Token Issuance Service

```typescript
// Called whenever auth completes successfully

async issueTokens(userId: string): Promise<TokenPair> {
  // 1. Generate access token
  const accessToken = this.jwtService.sign(
    { sub: userId, type: 'access' },
    { expiresIn: '15m', secret: process.env.JWT_ACCESS_SECRET }
  )

  // 2. Generate opaque refresh token
  const rawRefreshToken = crypto.randomBytes(64).toString('hex')
  const refreshTokenHash = await bcrypt.hash(rawRefreshToken, 10)

  // 3. Determine family — new login = new family, refresh = same family
  const familyId = uuidv4()

  // 4. Store hashed refresh token
  await this.prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: refreshTokenHash,
      familyId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    }
  })

  return { accessToken, refreshToken: rawRefreshToken }
}
```

---

## 8. nextStep Resolution

After any successful auth, determine the next step from `onboardingStep`:

```typescript
function resolveNextStep(user: User): AuthNextStep {
  const stepMap: Record<OnboardingStep, AuthNextStep> = {
    VERIFY_PHONE:       'VERIFY_PHONE',
    VERIFY_EMAIL:       'VERIFY_EMAIL',
    SELECT_PLAN:        'SELECT_PLAN',
    SETUP_BUSINESS:     'SETUP_BUSINESS',
    ADD_FIRST_PRODUCT:  'ADD_FIRST_PRODUCT',
    COMPLETE:           'DASHBOARD',
  }
  return stepMap[user.onboardingStep]
}
```

This means a returning user who abandoned onboarding at plan selection will be sent back to `SELECT_PLAN` on next login — no lost progress.

---

## 9. Rate Limiting & Brute Force Protection

### 9.1 Strategy

Use two complementary layers:

**Layer 1 — NestJS ThrottlerModule (IP-based, fast)**
```typescript
// app.module.ts
ThrottlerModule.forRoot([
  { name: 'short',  ttl: 1000,  limit: 5   },  // 5 req/sec burst
  { name: 'medium', ttl: 60000, limit: 30  },  // 30 req/min
])
```

**Layer 2 — Redis-based per-identifier limits (business logic)**

For auth endpoints, IP-based limiting is not enough — an attacker can rotate IPs. You need per-phone and per-email limits stored in Redis.

```typescript
// common/guards/auth-rate-limit.guard.ts

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private redis: RedisService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest()
    const identifier = req.body?.phone || req.body?.email || req.body?.identifier
    if (!identifier) return true

    const key = `auth_attempts:${identifier}`
    const config = this.getLimitConfig(req.route.path)

    const attempts = await this.redis.incr(key)
    if (attempts === 1) {
      await this.redis.expire(key, config.windowSeconds)
    }

    if (attempts > config.maxAttempts) {
      const ttl = await this.redis.ttl(key)
      throw new TooManyRequestsException({
        message: 'Trop de tentatives. Réessayez plus tard.',
        retryAfter: ttl,
        lockUntil: Date.now() + ttl * 1000,
      })
    }

    return true
  }

  private getLimitConfig(path: string) {
    const configs = {
      '/auth/register':       { maxAttempts: 5,  windowSeconds: 900  }, // 5/15min
      '/auth/verify-phone':   { maxAttempts: 10, windowSeconds: 900  }, // 10/15min
      '/auth/verify-email':   { maxAttempts: 10, windowSeconds: 900  },
      '/auth/request-login':  { maxAttempts: 10, windowSeconds: 900  },
      '/auth/login':          { maxAttempts: 10, windowSeconds: 900  },
      '/auth/login-otp':      { maxAttempts: 10, windowSeconds: 900  },
      '/auth/resend-otp':     { maxAttempts: 3,  windowSeconds: 600  }, // 3/10min — strict
    }
    return configs[path] || { maxAttempts: 20, windowSeconds: 900 }
  }
}
```

### 9.2 Account Lockout (for password login)

Separate from rate limiting — this locks the specific account:

```typescript
// Stored on user record
failedLoginAttempts: Int   // increment on each wrong password
lockedUntil: DateTime?     // set to now+1hr after 10 failures

// On each login attempt:
if (user.lockedUntil && user.lockedUntil > new Date()) {
  throw new TooManyRequestsException({
    lockUntil: user.lockedUntil.getTime(),
    message: 'Compte temporairement bloqué suite à trop de tentatives.',
  })
}

// On success: reset both fields
await prisma.user.update({
  where: { id: user.id },
  data: { failedLoginAttempts: 0, lockedUntil: null }
})
```

### 9.3 OTP Attempt Tracking

```typescript
// Stored on OTP record
attempts: Int    // increment on each wrong OTP submission

// Rules:
// attempts >= 5 → OTP invalidated, must request new one
// OTP expired (expiresAt < now) → must request new one
// OTP used (verified=true) → cannot reuse
```

### 9.4 Refresh Token Reuse Detection

```typescript
// On refresh — if token already used (used=true):
// 1. Someone is replaying an old token — possible theft
// 2. Revoke ALL tokens in this family immediately
await prisma.refreshToken.updateMany({
  where: { familyId: token.familyId },
  data: { revokedAt: new Date() }
})
throw new UnauthorizedException('Session compromise détectée. Reconnectez-vous.')
```

### 9.5 Rate Limit Summary Table

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| POST /auth/register | 5 | 15 min | Per IP |
| POST /auth/verify-phone | 10 | 15 min | Per phone |
| POST /auth/verify-email | 10 | 15 min | Per email |
| POST /auth/request-login | 10 | 15 min | Per identifier |
| POST /auth/login | 10 | 15 min | Per phone + Per IP |
| POST /auth/login-otp | 10 | 15 min | Per identifier |
| POST /auth/resend-otp | 3 | 10 min | Per phone/email |
| POST /auth/refresh | 30 | 15 min | Per userId |
| OTP attempts | 5 | Per OTP | Per OTP record |
| Password attempts | 10 | Per account | Per user (lock 1hr) |

---

## 10. Security Hardening Checklist

- [ ] Never return different errors for "phone not found" vs "wrong password" — always generic "Identifiants invalides" to prevent user enumeration
- [ ] Hash OTPs before storing (bcrypt or SHA-256) — never store plaintext
- [ ] Hash refresh tokens before storing — never store plaintext
- [ ] Helmet middleware (XSS, HSTS, content-type sniffing)
- [ ] CORS whitelist — only allow known frontend origins
- [ ] All auth endpoints served over HTTPS only
- [ ] Access token: 15 min TTL, never extended
- [ ] Refresh token: 30 days TTL, rotated on every use
- [ ] JWT secret: minimum 256-bit entropy, stored in env
- [ ] bcrypt cost factor: 12 for passwords, 10 for token hashes
- [ ] Sanitize all string inputs to prevent injection
- [ ] Log all auth events (success + failure) for audit trail
- [ ] Alert on anomalies: 50+ failed logins/min from same IP

---

## 11. Environment Variables Required

```env
JWT_ACCESS_SECRET=<256-bit-random-string>
JWT_REFRESH_SECRET=<256-bit-random-string>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# SMS Gateway (Twilio or local Cameroon provider)
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

# WhatsApp (Twilio WhatsApp or Meta Cloud API)
WHATSAPP_PROVIDER=twilio

# Email
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=noreply@biztrack.cm

# Redis
REDIS_URL=redis://localhost:6379

# Bcrypt
BCRYPT_ROUNDS=12
```

---

## 12. Implementation Order

```
Week 1 — Foundation
├── Prisma schema (User, RefreshToken, OTP models)
├── Database migrations
├── Auth module scaffold (module, controller, service)
├── DTOs with validation
└── JWT strategies (access + refresh)

Week 2 — Core Flows
├── POST /auth/register
├── POST /auth/verify-phone
├── POST /auth/verify-email
├── OTP generation + delivery service (SMS + WhatsApp + Email)
└── Token issuance service

Week 3 — Login + Security
├── POST /auth/request-login
├── POST /auth/login (password)
├── POST /auth/login-otp
├── POST /auth/refresh (with rotation)
├── POST /auth/logout
└── POST /auth/resend-otp

Week 4 — Hardening
├── Redis rate limiting guard
├── Account lockout logic
├── OTP attempt tracking
├── Refresh token family invalidation
├── Helmet + CORS configuration
└── Auth unit tests (auth.service.spec.ts)
```
