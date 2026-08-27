import type { DatabaseService } from '@biztrack/electron-core'
import type { PlanStateResponse, Resource } from '@biztrack/types'

export interface CachedBusiness {
  id: string
  name: string
  currency: string
  /** Business size profile (BIZ-5.7) — cached so offline sessions drive the right vocabulary. */
  profile: string | null
  role: string | null
}

export interface CachedUser {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  role: string | null
  businessId: string | null
  onboardingStep: string | null
}

/**
 * Reads/writes the local SQLite mirror that backs OFFLINE auth: the user profile
 * and the businesses they belong to. Populated after online auth; read when the
 * app opens without a network.
 */
export class LocalCache {
  constructor(private readonly db: DatabaseService) {}

  saveUser(user: CachedUser & { language?: string | null }): void {
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO local_user_profiles (id, name, email, phone, role, business_id, onboarding_step, language, saved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, email=excluded.email, phone=excluded.phone,
         role=excluded.role, business_id=excluded.business_id,
         onboarding_step=excluded.onboarding_step,
         language=excluded.language, saved_at=excluded.saved_at`,
      [
        user.id,
        user.name,
        user.email,
        user.phone,
        user.role,
        user.businessId,
        user.onboardingStep,
        user.language ?? null,
        now,
      ],
    )
  }

  getUser(id: string): CachedUser | null {
    const row = this.db.get<{
      id: string
      name: string | null
      email: string | null
      phone: string | null
      role: string | null
      business_id: string | null
      onboarding_step: string | null
    }>(
      'SELECT id, name, email, phone, role, business_id, onboarding_step FROM local_user_profiles WHERE id = ?',
      [id],
    )
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      businessId: row.business_id,
      onboardingStep: row.onboarding_step,
    }
  }

  saveBusinesses(
    userId: string,
    list: Array<{
      id: string
      name: string
      currency?: string | null
      profile?: string | null
      role?: string | null
    }>,
  ): void {
    const now = new Date().toISOString()
    for (const b of list) {
      this.db.run(
        `INSERT INTO local_businesses (id, name, currency, profile, user_id, saved_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, currency=excluded.currency,
           profile=excluded.profile, user_id=excluded.user_id, saved_at=excluded.saved_at`,
        [b.id, b.name, b.currency ?? 'XAF', b.profile ?? null, userId, now],
      )
    }
  }

  getBusiness(id: string): CachedBusiness | null {
    const row = this.db.get<{ id: string; name: string; currency: string; profile: string | null }>(
      'SELECT id, name, currency, profile FROM local_businesses WHERE id = ?',
      [id],
    )
    return row
      ? {
          id: row.id,
          name: row.name,
          currency: row.currency,
          profile: row.profile ?? null,
          role: null,
        }
      : null
  }

  listBusinesses(userId: string): CachedBusiness[] {
    const rows = this.db.query<{
      id: string
      name: string
      currency: string
      profile: string | null
    }>('SELECT id, name, currency, profile FROM local_businesses WHERE user_id = ? ORDER BY name', [
      userId,
    ])
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      currency: r.currency,
      profile: r.profile ?? null,
      role: null,
    }))
  }

  /**
   * BIZ-5.5 — cache a business's plan state (from GET /plans/state) so client-side module gating has
   * a last-known truth offline. The whole row is persisted; the entitlements the gating reads back
   * are in auth_permissions_json.
   */
  savePlanState(businessId: string, state: PlanStateResponse): void {
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO plan_state_cache (
         business_id, selected_plan, effective_plan, subscription_status,
         trial_started_at, trial_ends_at, current_period_start, current_period_end,
         cancel_at_period_end, entitlement_valid, entitlement_expires_at,
         auth_permissions_json, quotas_json, quota_usage_json,
         fetched_at, last_validated_at, stale_after, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(business_id) DO UPDATE SET
         selected_plan=excluded.selected_plan, effective_plan=excluded.effective_plan,
         subscription_status=excluded.subscription_status, trial_started_at=excluded.trial_started_at,
         trial_ends_at=excluded.trial_ends_at, current_period_start=excluded.current_period_start,
         current_period_end=excluded.current_period_end, cancel_at_period_end=excluded.cancel_at_period_end,
         entitlement_valid=excluded.entitlement_valid, entitlement_expires_at=excluded.entitlement_expires_at,
         auth_permissions_json=excluded.auth_permissions_json, quotas_json=excluded.quotas_json,
         quota_usage_json=excluded.quota_usage_json, fetched_at=excluded.fetched_at,
         last_validated_at=excluded.last_validated_at, stale_after=excluded.stale_after,
         updated_at=excluded.updated_at`,
      [
        businessId,
        state.selectedPlan,
        state.effectivePlan,
        state.status,
        state.trialStartedAt,
        state.trialEndsAt,
        state.currentPeriodStart,
        state.currentPeriodEnd,
        state.cancelAtPeriodEnd ? 1 : 0,
        state.entitlementValid ? 1 : 0,
        state.entitlementExpiresAt,
        JSON.stringify(state.authPermissions),
        JSON.stringify(state.quotas),
        JSON.stringify(state.quotaUsage),
        state.fetchedAt,
        now,
        state.staleAfter,
        now,
      ],
    )
  }

  /** Last-known plan-tier entitlements for a business, or undefined when never cached (→ the caller
   *  treats unknown as permissive; the server stays the hard gate). */
  getEffectivePermissions(businessId: string): Resource[] | undefined {
    const row = this.db.get<{ auth_permissions_json: string }>(
      'SELECT auth_permissions_json FROM plan_state_cache WHERE business_id = ?',
      [businessId],
    )
    if (!row) return undefined
    try {
      const parsed = JSON.parse(row.auth_permissions_json) as { effectivePermissions?: Resource[] }
      return Array.isArray(parsed.effectivePermissions) ? parsed.effectivePermissions : undefined
    } catch {
      return undefined
    }
  }
}
