/// <reference types="jest" />
import { SyncService } from '../sync.service'

// Slice 10: contacts and opening balances synced from a till are checked with the rules the
// till and the server's own path use (@biztrack/domain checkContactInput,
// checkContactArchive, checkOpeningBalance).
const makeService = (contact: Record<string, unknown> | null = null) => {
  const contactsRepo = {
    findOne: jest.fn().mockResolvedValue(contact),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    save: jest.fn(),
    create: jest.fn((v: unknown) => v),
  }
  const openingBalancesRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    create: jest.fn((v: unknown) => v),
    update: jest.fn(),
    delete: jest.fn(),
  }
  const debtRepo = { delete: jest.fn() }
  const service = Object.create(SyncService.prototype) as any
  service.contactsRepo = contactsRepo
  service.openingBalancesRepo = openingBalancesRepo
  service.quotaService = { assertWithinQuota: jest.fn() }
  service.resolveContactCreatedById = jest.fn().mockResolvedValue('u-1')
  service.calendar = { resolveForSync: jest.fn().mockResolvedValue('2026-01-01') }
  service.dataSource = {
    query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    getRepository: () => debtRepo,
  }
  return { service, contactsRepo, openingBalancesRepo, debtRepo }
}

const op = (payload: Record<string, unknown>, action = 'UPSERT') =>
  ({
    recordId: 'r-1',
    action,
    recordUpdatedAt: new Date('2026-10-16T08:00:00.000Z'),
    payload,
  }) as any

describe('SyncService contacts (slice 10)', () => {
  it('refuses a contact whose phone or email is not valid', async () => {
    const { service, contactsRepo } = makeService()
    await expect(
      service.applyContactOperation('biz-1', op({ name: 'Kemi', phone: '12' })),
    ).rejects.toMatchObject({ code: 'CONTACT_PHONE_INVALID' })
    await expect(
      service.applyContactOperation('biz-1', op({ name: 'Kemi', email: 'kemi at shop' })),
    ).rejects.toMatchObject({ code: 'CONTACT_EMAIL_INVALID' })
    expect(contactsRepo.save).not.toHaveBeenCalled()
  })

  it('stores the phone in international form and the email in lower case', async () => {
    const { service, contactsRepo } = makeService()
    await service.applyContactOperation(
      'biz-1',
      op({ name: 'Kemi', phone: '677 12 34 56', email: 'Kemi@Shop.cm' }),
    )
    expect(contactsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+237677123456', email: 'kemi@shop.cm' }),
    )
  })

  it('keeps a contact with open debts from being archived', async () => {
    const { service, contactsRepo } = makeService({
      id: 'r-1',
      isActive: true,
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    })
    await expect(service.applyContactOperation('biz-1', op({}, 'DELETE'))).rejects.toMatchObject({
      code: 'CONTACT_HAS_OPEN_DEBTS',
    })
    expect(contactsRepo.update).not.toHaveBeenCalled()
  })
})

describe('SyncService opening balances (slice 10)', () => {
  const balance = (over: Record<string, unknown>) =>
    op({
      contactId: 'c-1',
      direction: 'RECEIVABLE',
      amount: 1500.4,
      asOfDate: '2026-01-01',
      ...over,
    })

  it('refuses a direction the contact type does not allow', async () => {
    const { service, openingBalancesRepo } = makeService({ id: 'c-1', type: 'SUPPLIER' })
    const result = await service.applyOpeningBalanceOperation('biz-1', balance({}))
    expect(result).toMatchObject({ status: 'failed' })
    expect(openingBalancesRepo.save).not.toHaveBeenCalled()
  })

  it('stores the amount in whole francs', async () => {
    const { service, openingBalancesRepo } = makeService({ id: 'c-1', type: 'CUSTOMER' })
    const result = await service.applyOpeningBalanceOperation('biz-1', balance({}))
    expect(result.status).toBe('applied')
    expect(openingBalancesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ amount: 1500 }))
  })

  it('removes the mirrored debt with the opening balance', async () => {
    const { service, openingBalancesRepo, debtRepo } = makeService()
    openingBalancesRepo.findOne.mockResolvedValue({
      id: 'ob-1',
      contactId: 'c-1',
      direction: 'RECEIVABLE',
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    })
    const result = await service.applyOpeningBalanceOperation(
      'biz-1',
      op({ contactId: 'c-1', direction: 'RECEIVABLE' }, 'DELETE'),
    )
    expect(result.status).toBe('applied')
    expect(openingBalancesRepo.delete).toHaveBeenCalledWith('ob-1')
    expect(debtRepo.delete).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'OPENING_BALANCE', sourceId: 'c-1' }),
    )
  })
})
