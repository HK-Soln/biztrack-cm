/// <reference types="jest" />
import { checkProductPublishable } from '@biztrack/types'

// Storefront-readiness — advisory checks shared by the desktop admin and the API.
// The public storefront only surfaces active + published products; these flag the
// products that would publish but render poorly (no price, no image, disabled).
describe('checkProductPublishable', () => {
  it('is ready when active, priced and imaged', () => {
    const r = checkProductPublishable({ isActive: true, sellingPrice: 1500, imageUrl: 'x.png' })
    expect(r.ready).toBe(true)
    expect(r.blockers).toEqual([])
  })

  it('flags a disabled product', () => {
    const r = checkProductPublishable({ isActive: false, sellingPrice: 1500, imageUrl: 'x.png' })
    expect(r.ready).toBe(false)
    expect(r.blockers).toContain('inactive')
  })

  it('flags a zero/absent price', () => {
    expect(
      checkProductPublishable({ isActive: true, sellingPrice: 0, imageUrl: 'x.png' }).blockers,
    ).toContain('no_price')
  })

  it('flags a missing image', () => {
    expect(
      checkProductPublishable({ isActive: true, sellingPrice: 100, imageUrl: null }).blockers,
    ).toContain('no_image')
  })

  it('accumulates every blocker', () => {
    const r = checkProductPublishable({ isActive: false, sellingPrice: 0, imageUrl: '' })
    expect(r.ready).toBe(false)
    expect(r.blockers).toEqual(['inactive', 'no_price', 'no_image'])
  })
})
