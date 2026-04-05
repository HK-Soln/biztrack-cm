# Business Plan Selection Module — Full Implementation Documentation
**BizTrack CM · NestJS Backend · Version 1.0**

---

## 1. Overview

The plan selection module is the second step in the onboarding flow, reached after successful authentication. It handles plan browsing, selection, trial activation, and the initial permission issuance that enables the rest of the platform.

### Design Principles
- **All endpoints guarded**: Requires valid `accessToken` from auth module
- **Plan = first-level authorization**: Plan selection determines the `effectivePermissions` the client receives
- **Trial-first**: All paid plans start with a 30-day free trial, no payment required at selection
- **Payment deferred**: Payment setup happens after plan selection, not before
- **Server is authority**: Client never computes what a plan includes — always fetched from server
- **Hybrid permission model**: Static enums define what exists; DB defines what each plan gets

---

## 2. File Structure

```
apps/api/src/modules/
│
├── plans/                          # Plan browsing & selection
│   ├── plans.module.ts
│   ├── plans.controller.ts
│   ├── plans.service.ts
│   ├── plans.service.spec.ts
│   └── dto/
│       ├── select-plan.dto.ts
│       └── upgrade-plan.dto.ts
│
├── permissions/                    # Permission engine
│   ├── permissions.module.ts
│   ├── permissions.service.ts      # Core — Redis-cached permission resolution
│   ├── permissions.scheduler.ts    # Cron — expire overrides, send warnings
│   └── guards/
│       ├── resource.guard.ts
│       └── plan.guard.ts
│
└── subscriptions/                  # Subscription lifecycle
    ├── subscriptions.module.ts
    ├── subscriptions.service.ts
    ├── subscriptions.scheduler.ts  # Cron — trial expiry, billing reminders
    └── dto/
        └── cancel-subscription.dto.ts

packages/permissions/src/           # Shared across all apps
├── enums.ts                        # SubscriptionPlan, Module, Resource
├── access.ts                       # computeAccess() — shared logic
├── types.ts                        # AuthPermissions, SpecialPermission, etc.
└── index.ts
```

---

## 3. Database Schema (Prisma)

```prisma
model Business {
  id                String          @id @default(cuid())
  userId            String          @unique
  name              String
  type              BusinessType
  city              String
  currency          String          @default("XAF")
  plan              SubscriptionPlan        @default(FREE)
  subscriptionStatus SubscriptionStatus @default(TRIAL)
  trialStartedAt    DateTime?
  trialEndsAt       DateTime?
  currentPeriodStart DateTime?
  currentPeriodEnd  DateTime?
  cancelAtPeriodEnd Boolean         @default(false)
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  user              User            @relation(fields: [userId], references: [id])
  overrides         BusinessOverride[]
  subscriptionHistory SubscriptionEvent[]

  @@map("businesses")
}

model PlanConfig {
  id          String      @id @default(cuid())
  plan        SubscriptionPlan    @unique
  resources   String[]    // Resource enum values
  displayName String
  priceXAF    Int
  updatedAt   DateTime    @updatedAt
  updatedBy   String      // adminUserId — audit trail

  @@map("plan_configs")
}

model BusinessOverride {
  id          String    @id @default(cuid())
  businessId  String
  resource    String    // Resource enum value
  granted     Boolean   // true=unlock, false=revoke
  grantedBy   String    // adminUserId
  reason      String
  grantedAt   DateTime  @default(now())
  expiresAt   DateTime?

  business    Business  @relation(fields: [businessId], references: [id])

  @@index([businessId])
  @@index([expiresAt])
  @@map("business_overrides")
}

model SubscriptionEvent {
  id          String              @id @default(cuid())
  businessId  String
  event       SubscriptionEventType
  fromPlan    SubscriptionPlan?
  toPlan      SubscriptionPlan?
  metadata    Json?
  createdAt   DateTime            @default(now())

  business    Business            @relation(fields: [businessId], references: [id])

  @@index([businessId])
  @@map("subscription_events")
}

enum SubscriptionPlan {
  FREE
  SOLO
  BUSINESS
  PRO
}

enum SubscriptionStatus {
  TRIAL
  ACTIVE
  PAST_DUE
  CANCELLED
  SUSPENDED
}

enum SubscriptionEventType {
  TRIAL_STARTED
  TRIAL_ENDING_SOON   // 7 days before
  TRIAL_ENDED
  PLAN_SELECTED
  PLAN_UPGRADED
  PLAN_DOWNGRADED
  PAYMENT_SUCCESS
  PAYMENT_FAILED
  CANCELLED
  REACTIVATED
  OVERRIDE_GRANTED
  OVERRIDE_REVOKED
}

enum BusinessType {
  EPICERIE
  BOUTIQUE
  RESTAURANT
  PHARMACIE
  SALON
  ELECTRONIQUE
  AUTRE
}
```

---

## 4. Shared Permissions Package

This package is shared between `apps/api`, `apps/web`, `apps/mobile`, and `apps/desktop`.

```typescript
// packages/permissions/src/enums.ts

export enum SubscriptionPlan {
  FREE     = 'FREE',
  SOLO     = 'SOLO',
  BUSINESS = 'BUSINESS',
  PRO      = 'PRO',
}

export enum Resource {
  // ── SALES ──
  SALES_CREATE          = 'SALES_CREATE',
  SALES_VIEW            = 'SALES_VIEW',
  SALES_VOID            = 'SALES_VOID',
  SALES_EXPORT          = 'SALES_EXPORT',

  // ── PRODUCTS ──
  PRODUCTS_CREATE       = 'PRODUCTS_CREATE',
  PRODUCTS_VIEW         = 'PRODUCTS_VIEW',
  PRODUCTS_EDIT         = 'PRODUCTS_EDIT',
  PRODUCTS_DELETE       = 'PRODUCTS_DELETE',
  PRODUCTS_LIMIT_50     = 'PRODUCTS_LIMIT_50',
  PRODUCTS_UNLIMITED    = 'PRODUCTS_UNLIMITED',
  PRODUCTS_IMPORT_CSV   = 'PRODUCTS_IMPORT_CSV',

  // ── INVENTORY ──
  INVENTORY_VIEW        = 'INVENTORY_VIEW',
  INVENTORY_ADJUST      = 'INVENTORY_ADJUST',
  INVENTORY_ALERTS      = 'INVENTORY_ALERTS',

  // ── EXPENSES ──
  EXPENSES_CREATE       = 'EXPENSES_CREATE',
  EXPENSES_VIEW         = 'EXPENSES_VIEW',
  EXPENSES_CATEGORIES   = 'EXPENSES_CATEGORIES',

  // ── REPORTS ──
  REPORTS_DAILY         = 'REPORTS_DAILY',
  REPORTS_WEEKLY        = 'REPORTS_WEEKLY',
  REPORTS_MONTHLY       = 'REPORTS_MONTHLY',
  REPORTS_EXPORT_PDF    = 'REPORTS_EXPORT_PDF',
  REPORTS_EXPORT_CSV    = 'REPORTS_EXPORT_CSV',

  // ── RECEIPTS ──
  RECEIPTS_GENERATE     = 'RECEIPTS_GENERATE',
  RECEIPTS_WHATSAPP     = 'RECEIPTS_WHATSAPP',

  // ── SCANNER ──
  SCANNER_CAMERA        = 'SCANNER_CAMERA',        // phone camera scan
  SCANNER_USB           = 'SCANNER_USB',           // physical USB scanner (desktop)

  // ── DESKTOP ──
  DESKTOP_ACCESS        = 'DESKTOP_ACCESS',

  // ── STAFF (RBAC) ──
  STAFF_INVITE          = 'STAFF_INVITE',
  STAFF_MANAGE          = 'STAFF_MANAGE',
  STAFF_LIMIT_3         = 'STAFF_LIMIT_3',
  STAFF_UNLIMITED       = 'STAFF_UNLIMITED',

  // ── BRANCHES ──
  BRANCHES_MULTI        = 'BRANCHES_MULTI',
  BRANCHES_DASHBOARD    = 'BRANCHES_DASHBOARD',
  BRANCHES_REPORTS      = 'BRANCHES_REPORTS',

  // ── API ──
  API_ACCESS            = 'API_ACCESS',
}

// The FREE tier — used as fallback when permissions expire offline
export const FREE_PERMISSIONS: Resource[] = [
  Resource.SALES_CREATE,
  Resource.SALES_VIEW,
  Resource.PRODUCTS_CREATE,
  Resource.PRODUCTS_VIEW,
  Resource.PRODUCTS_EDIT,
  Resource.PRODUCTS_DELETE,
  Resource.PRODUCTS_LIMIT_50,
  Resource.INVENTORY_VIEW,
  Resource.INVENTORY_ADJUST,
  Resource.INVENTORY_ALERTS,
  Resource.EXPENSES_CREATE,
  Resource.EXPENSES_VIEW,
  Resource.REPORTS_DAILY,
  Resource.RECEIPTS_GENERATE,
  Resource.RECEIPTS_WHATSAPP,
]
```

```typescript
// packages/permissions/src/access.ts

export function computeAccess(
  resource: Resource,
  auth: AuthPermissions,
  now: number = Date.now(),
): AccessResult {

  // 1. Check active special revocations first (highest priority)
  const revocation = auth.specialPermissions.find(
    p => p.resource === resource
      && p.isRevocation
      && (!p.expiresAt || now < p.expiresAt)
  )
  if (revocation) {
    return {
      granted: false,
      reason: 'REVOKED',
      expiresAt: revocation.expiresAt ?? null,
    }
  }

  // 2. Check active special grants
  const grant = auth.specialPermissions.find(
    p => p.resource === resource
      && !p.isRevocation
      && (!p.expiresAt || now < p.expiresAt)
  )
  if (grant) {
    return {
      granted: true,
      reason: 'SPECIAL_GRANT',
      expiresAt: grant.expiresAt ?? null,
      grantReason: grant.reason,
    }
  }

  // 3. Check if plan permissions are still valid
  const planExpired = now > auth.permissionsExpiresAt
  if (planExpired) {
    return {
      granted: FREE_PERMISSIONS.includes(resource),
      reason: 'PLAN_EXPIRED',
      expiresAt: null,
    }
  }

  // 4. Standard plan check
  return {
    granted: auth.effectivePermissions.includes(resource),
    reason: 'PLAN',
    expiresAt: auth.permissionsExpiresAt,
  }
}

export interface AccessResult {
  granted: boolean
  reason: 'PLAN' | 'SPECIAL_GRANT' | 'REVOKED' | 'PLAN_EXPIRED'
  expiresAt: number | null
  grantReason?: string
}
```

---

## 5. API Endpoints

### 5.1 GET /plans

Returns all available plans with their features for display on the plan selection screen.

**Guards:** JwtAuthGuard
**Rate limit:** 60 req/min (light — just a display endpoint)

**Response:**
```json
{
  "plans": [
    {
      "name": "FREE",
      "displayName": "Free",
      "priceXAF": 0,
      "trialDays": 0,
      "resources": ["SALES_CREATE", "SALES_VIEW", "..."],
      "inheritsFrom": null,
      "additionalResources": []
    },
    {
      "name": "SOLO",
      "displayName": "Solo",
      "priceXAF": 3500,
      "trialDays": 30,
      "resources": ["SALES_CREATE", "...all FREE resources...", "SCANNER_CAMERA", "DESKTOP_ACCESS", "..."],
      "inheritsFrom": "FREE",
      "additionalResources": ["SCANNER_CAMERA", "DESKTOP_ACCESS", "PRODUCTS_UNLIMITED", "REPORTS_WEEKLY", "REPORTS_MONTHLY", "REPORTS_EXPORT_PDF", "STAFF_INVITE"]
    }
  ],
  "currentPlan": null
}
```

Note: `additionalResources` enables the "Everything in FREE, plus..." display on mobile swipe cards.

---

### 5.2 POST /plans/select

Called when user selects a plan during onboarding. Creates business + subscription.

**Guards:** JwtAuthGuard
**Onboarding guard:** User must be in `SELECT_PLAN` step

**Request:**
```typescript
class SelectPlanDto {
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan

  // Business info collected in previous onboarding step
  // (already saved — this just triggers subscription creation)
}
```

**Logic:**
1. Verify user's `onboardingStep === SELECT_PLAN`
2. Find business record for this user
3. If FREE selected:
   - Set `plan=FREE`, `status=ACTIVE`
   - No trial needed
   - Set `onboardingStep=ADD_FIRST_PRODUCT`
4. If paid plan selected:
   - Set `plan=<selected>`, `status=TRIAL`
   - Set `trialStartedAt=now`, `trialEndsAt=now+30days`
   - Set `onboardingStep=SETUP_PAYMENT` (but do not block platform access)
   - Schedule trial expiry notifications
5. Log `PLAN_SELECTED` to `SubscriptionEvent`
6. Invalidate permission cache for this business
7. Fetch fresh permissions
8. Return `nextStep: ADD_FIRST_PRODUCT` + fresh `authPermissions`

**Response:**
```json
{
  "nextStep": "ADD_FIRST_PRODUCT",
  "message": "Plan Solo activé — 30 jours gratuits",
  "authPermissions": {
    "plan": "SOLO",
    "effectivePermissions": ["SALES_CREATE", "SCANNER_CAMERA", "..."],
    "specialPermissions": [],
    "permissionsIssuedAt": 1743500000,
    "permissionsExpiresAt": 1746092000
  },
  "subscription": {
    "status": "TRIAL",
    "trialEndsAt": "2026-04-20T09:41:00Z",
    "trialDaysRemaining": 30
  }
}
```

---

### 5.3 GET /plans/my-subscription

Returns the current subscription status for the authenticated business.

**Guards:** JwtAuthGuard

**Response:**
```json
{
  "plan": "SOLO",
  "status": "TRIAL",
  "trialEndsAt": "2026-04-20T09:41:00Z",
  "trialDaysRemaining": 24,
  "currentPeriodEnd": null,
  "cancelAtPeriodEnd": false,
  "paymentConfigured": false
}
```

---

### 5.4 POST /plans/upgrade

Upgrades or downgrades a plan. Available after onboarding is complete.

**Guards:** JwtAuthGuard, ResourceGuard(`PLAN_MANAGE`)

**Request:**
```typescript
class UpgradePlanDto {
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan
}
```

**Logic:**
1. Check current plan vs requested plan
2. If upgrade: immediate effect, carry over remaining trial days if still in trial
3. If downgrade: takes effect at end of current billing period (`cancelAtPeriodEnd`)
4. Log `PLAN_UPGRADED` or `PLAN_DOWNGRADED` to `SubscriptionEvent`
5. Invalidate permission cache
6. Return fresh permissions

---

### 5.5 POST /plans/cancel

Cancels subscription at end of current period.

**Guards:** JwtAuthGuard

**Logic:**
1. Set `cancelAtPeriodEnd=true`
2. Log `CANCELLED` event
3. Return confirmation with last active date

---

## 6. Permissions Service (Core)

```typescript
// apps/api/src/modules/permissions/permissions.service.ts

@Injectable()
export class PermissionsService {
  private readonly CACHE_TTL = 300 // 5 minutes

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // Called on every guarded request
  async getEffectivePermissions(businessId: string): Promise<Resource[]> {
    const cacheKey = `permissions:${businessId}`

    // 1. Try Redis cache first
    const cached = await this.redis.get(cacheKey)
    if (cached) return JSON.parse(cached)

    // 2. Load plan config
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { plan: true }
    })
    const planConfig = await this.prisma.planConfig.findUnique({
      where: { plan: business.plan }
    })

    // 3. Load active overrides
    const overrides = await this.prisma.businessOverride.findMany({
      where: {
        businessId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    })

    // 4. Merge: base permissions + grants - revocations
    let permissions = new Set<string>(planConfig.resources)

    for (const override of overrides) {
      if (override.granted) {
        permissions.add(override.resource)
      } else {
        permissions.delete(override.resource)
      }
    }

    const result = Array.from(permissions) as Resource[]

    // 5. Cache result
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result))

    return result
  }

  // Called on login/refresh to build full AuthPermissions payload
  async buildAuthPermissions(businessId: string): Promise<AuthPermissions> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId }
    })

    const effectivePermissions = await this.getEffectivePermissions(businessId)

    // Load special permissions (overrides with expiry info — sent to client)
    const overrides = await this.prisma.businessOverride.findMany({
      where: {
        businessId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    })

    const specialPermissions: SpecialPermission[] = overrides.map(o => ({
      resource: o.resource as Resource,
      grantedAt: o.grantedAt.getTime(),
      expiresAt: o.expiresAt?.getTime() ?? null,
      grantedBy: o.grantedBy,
      reason: o.reason,
      isRevocation: !o.granted,
    }))

    const now = Date.now()
    const thirtyDays = 30 * 24 * 60 * 60 * 1000

    return {
      plan: business.plan,
      effectivePermissions,
      specialPermissions,
      permissionsIssuedAt: now,
      permissionsExpiresAt: now + thirtyDays,
    }
  }

  // Invalidate cache — call after any plan change or override change
  async invalidateCache(businessId: string): Promise<void> {
    await this.redis.del(`permissions:${businessId}`)
  }

  // Get minimum plan that grants a resource — for upgrade prompts
  async getMinimumPlanFor(resource: Resource): Promise<SubscriptionPlan> {
    const configs = await this.prisma.planConfig.findMany({
      orderBy: { plan: 'asc' } // FREE < SOLO < BUSINESS < PRO
    })
    const planOrder = [SubscriptionPlan.FREE, SubscriptionPlan.SOLO, SubscriptionPlan.BUSINESS, SubscriptionPlan.PRO]
    for (const plan of planOrder) {
      const config = configs.find(c => c.plan === plan)
      if (config?.resources.includes(resource)) return plan
    }
    return SubscriptionPlan.PRO
  }
}
```

---

## 7. Resource Guard

```typescript
// apps/api/src/modules/permissions/guards/resource.guard.ts

export const RequireResource = (resource: Resource) =>
  SetMetadata('required_resource', resource)

@Injectable()
export class ResourceGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<Resource>(
      'required_resource',
      ctx.getHandler()
    )
    if (!required) return true

    const req = ctx.switchToHttp().getRequest()
    const businessId = req.user?.businessId
    if (!businessId) throw new ForbiddenException()

    const permissions = await this.permissionsService
      .getEffectivePermissions(businessId)

    if (!permissions.includes(required)) {
      const requiredPlan = await this.permissionsService
        .getMinimumPlanFor(required)

      throw new ForbiddenException({
        code: 'PLAN_UPGRADE_REQUIRED',
        resource: required,
        requiredPlan,
        message: `Cette fonctionnalité nécessite le plan ${requiredPlan}.`,
      })
    }

    return true
  }
}

// Usage on any controller endpoint:
@Get('reports/monthly')
@RequireResource(Resource.REPORTS_MONTHLY)
async getMonthlyReport(@CurrentUser() user: JwtPayload) {
  // Guard already verified access — just execute
}
```

---

## 8. Subscription Lifecycle Scheduler

```typescript
// apps/api/src/modules/subscriptions/subscriptions.scheduler.ts

@Injectable()
export class SubscriptionsScheduler {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private permissionsService: PermissionsService,
  ) {}

  // Run daily at 08:00 Cameroon time (UTC+1)
  @Cron('0 7 * * *', { timeZone: 'Africa/Douala' })
  async checkTrialExpiry() {
    const sevenDaysFromNow = new Date(Date.now() + 7 * 86400 * 1000)
    const oneDayFromNow   = new Date(Date.now() + 1 * 86400 * 1000)
    const now             = new Date()

    // Trial ending in 7 days
    const endingSoon = await this.prisma.business.findMany({
      where: {
        subscriptionStatus: 'TRIAL',
        trialEndsAt: { lte: sevenDaysFromNow, gt: oneDayFromNow }
      },
      include: { user: true }
    })
    for (const biz of endingSoon) {
      await this.notificationsService.sendTrialEndingSoon(biz)
      await this.logEvent(biz.id, 'TRIAL_ENDING_SOON')
    }

    // Trial ending today
    const endingToday = await this.prisma.business.findMany({
      where: {
        subscriptionStatus: 'TRIAL',
        trialEndsAt: { lte: oneDayFromNow, gt: now }
      },
      include: { user: true }
    })
    for (const biz of endingToday) {
      await this.notificationsService.sendTrialEndingToday(biz)
    }

    // Trial expired — downgrade to FREE
    const expired = await this.prisma.business.findMany({
      where: {
        subscriptionStatus: 'TRIAL',
        trialEndsAt: { lte: now },
        plan: { not: 'FREE' }
      }
    })
    for (const biz of expired) {
      await this.prisma.business.update({
        where: { id: biz.id },
        data: {
          plan: 'FREE',
          subscriptionStatus: 'ACTIVE',
        }
      })
      await this.permissionsService.invalidateCache(biz.id)
      await this.logEvent(biz.id, 'TRIAL_ENDED', { fromPlan: biz.plan, toPlan: 'FREE' })
      await this.notificationsService.sendTrialExpired(biz)
    }

    // Clean up expired overrides
    await this.prisma.businessOverride.deleteMany({
      where: { expiresAt: { lt: now } }
    })
  }

  private async logEvent(
    businessId: string,
    event: SubscriptionEventType,
    meta?: object
  ) {
    await this.prisma.subscriptionEvent.create({
      data: { businessId, event, metadata: meta }
    })
  }
}
```

---

## 9. Onboarding Step Guard

Ensures users complete steps in order. Prevents skipping plan selection.

```typescript
// apps/api/src/common/guards/onboarding.guard.ts

export const RequireOnboardingStep = (step: OnboardingStep) =>
  SetMetadata('required_onboarding_step', step)

@Injectable()
export class OnboardingGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<OnboardingStep>(
      'required_onboarding_step',
      ctx.getHandler()
    )
    if (!required) return true

    const req = ctx.switchToHttp().getRequest()
    const user = req.user

    if (user.onboardingStep !== required) {
      throw new ForbiddenException({
        code: 'WRONG_ONBOARDING_STEP',
        currentStep: user.onboardingStep,
        requiredStep: required,
        message: 'Veuillez compléter les étapes précédentes.',
      })
    }
    return true
  }
}
```

---

## 10. Initial Plan Config Seed

Run once on first deployment to populate `plan_configs` table:

```typescript
// prisma/seed.ts

const planConfigs = [
  {
    plan: 'FREE',
    displayName: 'Free',
    priceXAF: 0,
    resources: FREE_PERMISSIONS, // from packages/permissions
  },
  {
    plan: 'SOLO',
    displayName: 'Solo',
    priceXAF: 3500,
    resources: [
      ...FREE_PERMISSIONS,
      'PRODUCTS_UNLIMITED',
      'SCANNER_CAMERA',
      'SCANNER_USB',
      'DESKTOP_ACCESS',
      'REPORTS_WEEKLY',
      'REPORTS_MONTHLY',
      'REPORTS_EXPORT_PDF',
      'REPORTS_EXPORT_CSV',
      'PRODUCTS_IMPORT_CSV',
      'SALES_EXPORT',
      'SALES_VOID',
      'EXPENSES_CATEGORIES',
      'STAFF_INVITE',         // can invite 1 extra user
      'STAFF_LIMIT_3',
    ],
  },
  {
    plan: 'BUSINESS',
    displayName: 'Business',
    priceXAF: 7000,
    resources: [
      // Everything SOLO has +
      ...SOLO_PERMISSIONS,
      'STAFF_MANAGE',
      'STAFF_LIMIT_3',        // overrides SOLO's limit (same, but explicit)
    ],
  },
  {
    plan: 'PRO',
    displayName: 'Pro',
    priceXAF: 15000,
    resources: [
      // Everything BUSINESS has +
      ...BUSINESS_PERMISSIONS,
      'STAFF_UNLIMITED',
      'BRANCHES_MULTI',
      'BRANCHES_DASHBOARD',
      'BRANCHES_REPORTS',
      'API_ACCESS',
    ],
  },
]
```

---

## 11. Full Request-Response Flow During Onboarding

```
POST /auth/register          → nextStep: VERIFY_PHONE
POST /auth/verify-phone      → nextStep: VERIFY_EMAIL (if email) or SELECT_PLAN + tokens
POST /auth/verify-email      → nextStep: SELECT_PLAN + tokens

[All subsequent requests include Authorization: Bearer <accessToken>]

GET  /plans                  → list of plans with resources
POST /plans/select           → nextStep: ADD_FIRST_PRODUCT + fresh authPermissions
                               (business created, subscription started, permissions issued)

POST /businesses/first-product  → nextStep: DASHBOARD (skippable)

[User is now in DASHBOARD — all platform features accessible per plan]
```

---

## 12. Implementation Order

```
Week 1 — Shared Package
├── packages/permissions/src/enums.ts (SubscriptionPlan, Resource)
├── packages/permissions/src/access.ts (computeAccess)
├── packages/permissions/src/types.ts
└── Prisma schema + migrations (Business, PlanConfig, BusinessOverride, SubscriptionEvent)

Week 2 — Plans Module
├── GET /plans
├── POST /plans/select
├── GET /plans/my-subscription
├── Seed plan_configs table
└── PermissionsService (core + Redis caching)

Week 3 — Guards & Protection
├── ResourceGuard + @RequireResource decorator
├── OnboardingGuard + @RequireOnboardingStep decorator
├── PlanGuard (for plan-level checks)
└── Unit tests

Week 4 — Subscription Lifecycle
├── POST /plans/upgrade
├── POST /plans/cancel
├── SubscriptionsScheduler (trial expiry cron)
└── Notification triggers (trial ending soon, expired)
```
