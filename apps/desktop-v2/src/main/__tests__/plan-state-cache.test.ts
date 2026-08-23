import { describe, expect, it } from 'vitest'
import { withTestDatabase } from '@biztrack/electron-core/testing'
import {
  Resource,
  SubscriptionPlan,
  SubscriptionStatus,
  type PlanStateResponse,
} from '@biztrack/types'
import { LocalCache } from '../services/local-cache'

// BIZ-5.5 — the plan_state_cache round-trip that backs offline client module gating. Validates the
// column mapping and that the cached entitlements read back for filterNav / RequireResource.

function planState(effectivePermissions: Resource[]): PlanStateResponse {
  const now = new Date().toISOString()
  return {
    selectedPlan: SubscriptionPlan.BUSINESS,
    effectivePlan: SubscriptionPlan.BUSINESS,
    status: SubscriptionStatus.ACTIVE,
    trialStartedAt: null,
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    entitlementValid: true,
    entitlementExpiresAt: null,
    fetchedAt: now,
    staleAfter: now,
    authPermissions: {
      plan: SubscriptionPlan.BUSINESS,
      effectivePermissions,
      specialPermissions: [],
      permissionsIssuedAt: now,
      permissionsExpiresAt: null,
    },
    quotas: {} as PlanStateResponse['quotas'],
    quotaUsage: [],
  }
}

describe('LocalCache plan-state cache', () => {
  it('returns undefined (→ permissive) when nothing is cached', () => {
    return withTestDatabase((db) => {
      const cache = new LocalCache(db)
      expect(cache.getEffectivePermissions('biz-1')).toBeUndefined()
    })
  })

  it('round-trips the effective permissions and upserts on repeat', () => {
    return withTestDatabase((db) => {
      const cache = new LocalCache(db)
      cache.savePlanState('biz-1', planState([Resource.ONLINE_STORE]))
      expect(cache.getEffectivePermissions('biz-1')).toEqual([Resource.ONLINE_STORE])

      // A later fetch (plan downgrade) overwrites, not duplicates.
      cache.savePlanState('biz-1', planState([]))
      expect(cache.getEffectivePermissions('biz-1')).toEqual([])
    })
  })
})
