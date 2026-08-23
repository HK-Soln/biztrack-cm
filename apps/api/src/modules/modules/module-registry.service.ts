import { Injectable } from '@nestjs/common'
import {
  MODULE_REGISTRY,
  type BusinessModuleKey,
  type BusinessModuleManifest,
  type Resource,
} from '@biztrack/types'
import { isModuleEntitled, moduleByKey } from '@biztrack/utils'

/**
 * BIZ-5.5 — a thin, server-side view over the shared MODULE_REGISTRY. It is the DI seam future server
 * code uses to reason about modules (e.g. "which modules does this business's plan unlock?"). The
 * registry itself is shared compile-time code, so the API and the desktop client agree by construction.
 */
@Injectable()
export class ModuleRegistryService {
  all(): readonly BusinessModuleManifest[] {
    return MODULE_REGISTRY
  }

  byKey(key: BusinessModuleKey): BusinessModuleManifest | undefined {
    return moduleByKey(key)
  }

  /** Is a module on for a business with these plan-tier entitlements? Core modules are always on. */
  isEntitled(key: BusinessModuleKey, effectivePermissions: readonly Resource[]): boolean {
    const manifest = moduleByKey(key)
    return !!manifest && isModuleEntitled(manifest, effectivePermissions)
  }

  /** The subset of modules unlocked by these entitlements. */
  entitledModules(effectivePermissions: readonly Resource[]): BusinessModuleManifest[] {
    return MODULE_REGISTRY.filter((m) => isModuleEntitled(m, effectivePermissions))
  }
}
