import {
  MODULE_REGISTRY,
  type BusinessModuleKey,
  type BusinessModuleManifest,
  type Resource,
} from '@biztrack/types'

/**
 * BIZ-5.5 — module entitlement helpers over the shared MODULE_REGISTRY. Pure, so the API and the
 * desktop client decide "is this module on?" identically. Activation = plan entitlement: a module is
 * on when it is core (`requiredResource === null`) or the plan grants its resource.
 */

export function moduleByKey(key: BusinessModuleKey): BusinessModuleManifest | undefined {
  return MODULE_REGISTRY.find((m) => m.key === key)
}

export function moduleForResource(resource: Resource): BusinessModuleManifest | undefined {
  return MODULE_REGISTRY.find((m) => m.requiredResource === resource)
}

/**
 * Is a module active for a business with these plan entitlements? Core modules are always on. A gated
 * module needs its resource in `effectivePermissions`. Pass the effective permissions the server
 * resolved; the caller decides what to do when they are unknown (the client treats unknown as
 * permissive — see the renderer hooks).
 */
export function isModuleEntitled(
  manifest: BusinessModuleManifest,
  effectivePermissions: readonly Resource[],
): boolean {
  return (
    manifest.requiredResource === null || effectivePermissions.includes(manifest.requiredResource)
  )
}
