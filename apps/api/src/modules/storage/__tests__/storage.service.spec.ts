/// <reference types="jest" />
import { StorageService } from '../storage.service'
import type { StorageDriver } from '../storage.types'

// A driver whose URLs look like `https://cdn.test/<key>` and which "has" only the
// keys seeded into `present`.
const makeDriver = (present: Set<string>): StorageDriver => ({
  put: jest.fn(),
  url: (key) => `https://cdn.test/${key}`,
  delete: jest.fn(),
  exists: jest.fn(async (key) => present.has(key)),
  keyFromUrl: (url) => (url.startsWith('https://cdn.test/') ? url.slice('https://cdn.test/'.length) || null : null),
})

describe('StorageService.existsByUrl', () => {
  it('accepts a URL we stored whose file exists', async () => {
    const service = new StorageService(makeDriver(new Set(['categories/abc.png'])))
    await expect(service.existsByUrl('https://cdn.test/categories/abc.png')).resolves.toBe(true)
  })

  it('rejects an external URL (not served by us)', async () => {
    const driver = makeDriver(new Set(['categories/abc.png']))
    const service = new StorageService(driver)
    await expect(service.existsByUrl('https://evil.example.com/x.png')).resolves.toBe(false)
    // never even probes existence for a foreign URL
    expect(driver.exists).not.toHaveBeenCalled()
  })

  it('rejects our URL when the file is missing (dangling key)', async () => {
    const service = new StorageService(makeDriver(new Set()))
    await expect(service.existsByUrl('https://cdn.test/categories/gone.png')).resolves.toBe(false)
  })
})
