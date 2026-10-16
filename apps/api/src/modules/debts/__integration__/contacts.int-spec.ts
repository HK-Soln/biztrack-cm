import type { DataSource } from 'typeorm'
import { ContactType } from '@biztrack/types'
import { Contact } from '@/entities/contact.entity'
import { Debt } from '@/entities/debt.entity'
import { ContactsService } from '@/modules/debts/services/contacts.service'
import {
  closeIntegrationDataSource,
  getIntegrationDataSource,
} from '@/testing/integration-database'
import { createSalesSyncHarness, type SalesSyncHarness } from '@/testing/sales-sync-harness'

// Contacts (ruling R16) against a real Postgres: only the name is required and it is unique
// by its slug (index unq_contacts_business_name_key); a phone or email already on another
// contact is refused with CONTACT_DUPLICATE unless the person merges or creates anyway.

describe('contacts', () => {
  let dataSource: DataSource
  let h: SalesSyncHarness
  let contacts: ContactsService

  beforeAll(async () => {
    dataSource = await getIntegrationDataSource()
  })
  afterAll(async () => {
    await closeIntegrationDataSource()
  })
  beforeEach(async () => {
    h = await createSalesSyncHarness(dataSource)
    const noop = () => undefined
    contacts = new ContactsService(
      dataSource.getRepository(Contact),
      dataSource.getRepository(Debt),
      {} as never,
      {} as never,
      { assertWithinQuota: async () => undefined } as never,
      { translate: async (key: string) => key } as never,
      { setContext: noop, log: noop, warn: noop, error: noop, debug: noop } as never,
    )
  })

  const user = () => ({ sub: h.userId }) as never
  const create = (input: Record<string, unknown>) =>
    contacts.create(h.businessId, user(), { type: ContactType.CUSTOMER, ...input } as never)
  const all = () => dataSource.getRepository(Contact).find({ where: { businessId: h.businessId } })

  it('needs only a name, and stores the phone in international form', async () => {
    const plain = await create({ name: 'Walk-in' })
    expect(plain).toMatchObject({ name: 'Walk-in', phone: null })
    const withPhone = await create({ name: 'Kemi', phone: '677 12 34 56' })
    expect(withPhone).toMatchObject({ phone: '+237677123456' })
    await expect(create({ name: 'Bad', phone: '12' })).rejects.toMatchObject({
      code: 'CONTACT_PHONE_INVALID',
    })
  })

  it('refuses a name already taken, however it is written', async () => {
    await create({ name: 'Kemi Stores' })
    await expect(create({ name: 'kemi-stores' })).rejects.toMatchObject({
      code: 'CONTACT_NAME_TAKEN',
    })
  })

  it('refuses a duplicate phone or email by default, with the contact it matches', async () => {
    const first = await create({ name: 'Kemi', phone: '+237677123456', email: 'kemi@shop.cm' })
    await expect(
      create({ name: 'Kemi Two', phone: '677123456', email: 'KEMI@shop.cm' }),
    ).rejects.toMatchObject({
      code: 'CONTACT_DUPLICATE',
      details: { contactId: first.id, name: 'Kemi', matchedOn: ['phone', 'email'] },
    })
  })

  it('merges into the existing contact, taking the new name and both types', async () => {
    const first = await create({ name: 'Kemi', phone: '+237677123456' })
    const merged = await create({
      type: ContactType.SUPPLIER,
      name: 'Kemi Stores',
      phone: '677123456',
      email: 'kemi@shop.cm',
      onDuplicate: 'MERGE',
    })
    expect(merged).toMatchObject({
      id: first.id,
      name: 'Kemi Stores',
      type: ContactType.BOTH,
      email: 'kemi@shop.cm',
    })
    expect(await all()).toHaveLength(1)
  })

  it('creates a separate contact when asked to, under a different name', async () => {
    await create({ name: 'Kemi', phone: '+237677123456' })
    const second = await create({ name: 'Kemi Junior', phone: '677123456', onDuplicate: 'CREATE' })
    expect(second.name).toBe('Kemi Junior')
    expect(await all()).toHaveLength(2)
    // A name already taken is refused even then.
    await expect(
      create({ name: 'kemi', phone: '677123456', onDuplicate: 'CREATE' }),
    ).rejects.toMatchObject({ code: 'CONTACT_NAME_TAKEN' })
  })

  it('keeps names unique in the database too', async () => {
    await create({ name: 'Kemi' })
    await expect(
      dataSource.getRepository(Contact).save(
        dataSource.getRepository(Contact).create({
          businessId: h.businessId,
          type: ContactType.CUSTOMER,
          name: 'KEMI',
          isActive: true,
          createdById: h.userId,
        }),
      ),
    ).rejects.toThrow(/unq_contacts_business_name_key/)
  })
})
