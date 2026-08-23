import { isModuleEntitled, moduleByKey } from '@biztrack/utils'
import type { BusinessModuleKey, Resource } from '@biztrack/types'
import { useSessionStore } from '@/stores/session.store'

/**
 * BIZ-5.5 — client-side module/surface gating. Reads the plan-tier entitlements the session carries
 * (from GET /plans/state, cached offline). The golden rule is PERMISSIVE-WHEN-UNKNOWN: if the
 * session has no entitlements yet (never fetched, or offline with no cache) we show everything — the
 * server stays the hard gate on every write, so a permissive renderer can never escalate.
 */

export function useEffectivePermissions(): Resource[] | undefined {
  return useSessionStore((s) => s.status.effectivePermissions)
}

/** Does the business have this plan-tier feature? Unknown entitlements ⇒ true (permissive). */
export function useHasResource(resource: Resource): boolean {
  const perms = useEffectivePermissions()
  return perms === undefined || perms.includes(resource)
}

/** A `(resource) => boolean` predicate for filtering lists (nav, reports). Permissive when unknown. */
export function useResourcePredicate(): (resource: Resource) => boolean {
  const perms = useEffectivePermissions()
  return (resource) => perms === undefined || perms.includes(resource)
}

/** Is this module active for the business? Core modules are always on; unknown ⇒ true (permissive). */
export function useModuleEnabled(key: BusinessModuleKey): boolean {
  const perms = useEffectivePermissions()
  const manifest = moduleByKey(key)
  if (!manifest) return false
  return perms === undefined || isModuleEntitled(manifest, perms)
}
