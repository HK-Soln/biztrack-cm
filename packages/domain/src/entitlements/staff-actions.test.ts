import { describe, expect, it } from 'vitest'
import { staffMay } from './staff-actions'

describe('staffMay (R21)', () => {
  it('lets owners and managers void, refund, adjust stock and delete products', () => {
    for (const action of ['SALE_VOID', 'SALE_REFUND', 'STOCK_ADJUST', 'PRODUCT_DELETE'] as const) {
      expect(staffMay('OWNER', action)).toBe(true)
      expect(staffMay('manager', action)).toBe(true)
      expect(staffMay('CASHIER', action)).toBe(false)
      expect(staffMay('ACCOUNTANT', action)).toBe(false)
      expect(staffMay('STAFF', action)).toBe(false)
      expect(staffMay(null, action)).toBe(false)
    }
  })
})
