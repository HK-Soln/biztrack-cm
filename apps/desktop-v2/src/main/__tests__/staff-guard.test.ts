import { describe, expect, it } from 'vitest'
import { requireStaff } from '../ipc/staff-guard'

// Ruling R21: the till's main process refuses a void, a refund, a stock adjustment or a
// product delete to anyone but an owner or a manager, whatever the screen shows.

describe('requireStaff (R21)', () => {
  it('lets an owner or a manager through', () => {
    expect(() => requireStaff(() => 'OWNER', 'SALE_REFUND')).not.toThrow()
    expect(() => requireStaff(() => 'MANAGER', 'PRODUCT_DELETE')).not.toThrow()
  })

  it('refuses a cashier, and anyone signed out', () => {
    expect(() => requireStaff(() => 'CASHIER', 'SALE_VOID')).toThrow('Only owners and managers')
    expect(() => requireStaff(() => null, 'STOCK_ADJUST')).toThrow('Only owners and managers')
  })
})
