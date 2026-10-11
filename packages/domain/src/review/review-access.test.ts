import { describe, expect, it } from 'vitest'
import { canReviewFlags } from './review-access'

const member = (over: Partial<Parameters<typeof canReviewFlags>[0] & object> = {}) => ({
  active: true,
  memberRole: 'CASHIER',
  hasAssignedRole: false,
  roleCanAuthorize: false,
  ...over,
})

describe('canReviewFlags', () => {
  it('lets the owner in, whatever role is assigned', () => {
    expect(canReviewFlags(member({ memberRole: 'OWNER' }))).toBe(true)
    expect(canReviewFlags(member({ memberRole: 'owner', hasAssignedRole: true }))).toBe(true)
  })

  it('follows the assigned role when there is one', () => {
    expect(canReviewFlags(member({ hasAssignedRole: true, roleCanAuthorize: true }))).toBe(true)
    expect(
      canReviewFlags(
        member({ memberRole: 'MANAGER', hasAssignedRole: true, roleCanAuthorize: false }),
      ),
    ).toBe(false)
  })

  it('falls back to the built-in manager when no role is assigned', () => {
    expect(canReviewFlags(member({ memberRole: 'MANAGER' }))).toBe(true)
    expect(canReviewFlags(member({ memberRole: 'CASHIER' }))).toBe(false)
  })

  it('refuses an inactive or missing member', () => {
    expect(canReviewFlags(member({ memberRole: 'OWNER', active: false }))).toBe(false)
    expect(canReviewFlags(null)).toBe(false)
  })
})
