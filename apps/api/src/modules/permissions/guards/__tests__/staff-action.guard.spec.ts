/// <reference types="jest" />
import { ResourceGuard } from '../resource.guard'

// Ruling R21: voids, refunds, stock adjustments and product deletes need an owner or a
// manager (@biztrack/domain staffMay), checked by ResourceGuard before the plan check.

const makeGuard = (action: string | undefined) => {
  const reflector = {
    getAllAndOverride: jest.fn(() => undefined),
    get: jest.fn(() => action),
  }
  const permissions = { getEffectivePermissions: jest.fn(), getMinimumPlanFor: jest.fn() }
  const i18n = { translate: jest.fn(async (key: string) => key) }
  return new ResourceGuard(reflector as any, permissions as any, i18n as any)
}

const contextFor = (role: string) =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user: { businessId: 'biz-1', role } }) }),
  }) as any

describe('ResourceGuard — staff actions (R21)', () => {
  it('lets a manager refund', async () => {
    await expect(makeGuard('SALE_REFUND').canActivate(contextFor('MANAGER'))).resolves.toBe(true)
  })

  it('refuses a cashier', async () => {
    await expect(
      makeGuard('STOCK_ADJUST').canActivate(contextFor('CASHIER')),
    ).rejects.toMatchObject({ code: 'STAFF_ACTION_FORBIDDEN' })
  })

  it('leaves endpoints without a staff action alone', async () => {
    await expect(makeGuard(undefined).canActivate(contextFor('CASHIER'))).resolves.toBe(true)
  })
})
