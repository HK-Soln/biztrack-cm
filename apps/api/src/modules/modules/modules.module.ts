import { Global, Module } from '@nestjs/common'
import { ModuleRegistryService } from './module-registry.service'
import { CloseStepRegistry } from './close-step-registry.service'

/**
 * BIZ-5.5 — the module registration framework's server home. Global so any feature module can inject
 * ModuleRegistryService (surface entitlement) or CloseStepRegistry (behavior contribution) without a
 * re-import. Holds no entities (activation = plan entitlement, resolved from the shared
 * MODULE_REGISTRY + a business's effective permissions).
 */
@Global()
@Module({
  providers: [ModuleRegistryService, CloseStepRegistry],
  exports: [ModuleRegistryService, CloseStepRegistry],
})
export class ModulesModule {}
