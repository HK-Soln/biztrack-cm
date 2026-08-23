import { describe, expect, it } from 'vitest'
import { BusinessModuleKey, Resource, type BusinessModuleManifest } from '@biztrack/types'
import { isModuleEntitled, moduleByKey, moduleForResource } from './modules'

const core: BusinessModuleManifest = {
  key: BusinessModuleKey.CORE_SALES,
  label: 'Sales',
  requiredResource: null,
}
const gated: BusinessModuleManifest = {
  key: BusinessModuleKey.ONLINE_STORE,
  label: 'Online store',
  requiredResource: Resource.ONLINE_STORE,
}

describe('isModuleEntitled', () => {
  it('a core module (no required resource) is always on', () => {
    expect(isModuleEntitled(core, [])).toBe(true)
  })

  it('a gated module needs its resource present', () => {
    expect(isModuleEntitled(gated, [Resource.ONLINE_STORE])).toBe(true)
    expect(isModuleEntitled(gated, [Resource.SALES_CREATE])).toBe(false)
    expect(isModuleEntitled(gated, [])).toBe(false)
  })
})

describe('registry lookups', () => {
  it('finds a module by key', () => {
    expect(moduleByKey(BusinessModuleKey.ONLINE_STORE)?.requiredResource).toBe(
      Resource.ONLINE_STORE,
    )
  })

  it('finds the module a plan-tier resource unlocks', () => {
    expect(moduleForResource(Resource.ONLINE_STORE)?.key).toBe(BusinessModuleKey.ONLINE_STORE)
  })

  it('core modules map to no resource', () => {
    expect(moduleByKey(BusinessModuleKey.CORE_SALES)?.requiredResource).toBeNull()
  })
})
