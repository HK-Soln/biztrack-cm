import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { ContactsService } from '../services/contacts.service'

// Contacts on the till follow the rules the server applies (ruling R16, @biztrack/domain):
// only a name is required and it is unique in the business by its slug; a phone or email
// already on another contact is refused unless the person merges or creates anyway.

const BIZ = 'biz-1'

describe('contact rules on the till', () => {
  let db: DatabaseService
  let contacts: ContactsService

  beforeEach(() => {
    db = createTestDatabase()
    contacts = new ContactsService(
      db,
      () => BIZ,
      () => {},
    )
  })

  const create = (input: Record<string, unknown>) =>
    contacts.create({ type: 'CUSTOMER', ...input } as never)
  const count = () =>
    db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM contacts WHERE business_id = ?`, [BIZ])!.n

  it('needs only a name, and stores the phone in international form', () => {
    expect(create({ name: 'Walk-in' }).phone ?? null).toBeNull()
    expect(create({ name: 'Kemi', phone: '677 12 34 56' }).phone).toBe('+237677123456')
    expect(() => create({ name: 'Bad', phone: '12' })).toThrow('valid phone')
  })

  it('refuses a name already taken, however it is written, on create and rename', () => {
    create({ name: 'Kemi Stores' })
    expect(() => create({ name: 'kemi-stores' })).toThrow('already has this name')
    const other = create({ name: 'Other' })
    expect(() => contacts.update(other.id, { name: 'KEMI STORES' })).toThrow(
      'already has this name',
    )
  })

  it('refuses a duplicate phone or email with the contact it matches', () => {
    const first = create({ name: 'Kemi', phone: '+237677123456', email: 'kemi@shop.cm' })
    let message = ''
    try {
      create({ name: 'Kemi Two', phone: '677123456', email: 'KEMI@shop.cm' })
    } catch (e) {
      message = (e as Error).message
    }
    expect(message.startsWith('CONTACT_DUPLICATE ')).toBe(true)
    expect(JSON.parse(message.slice('CONTACT_DUPLICATE '.length))).toEqual({
      contactId: first.id,
      name: 'Kemi',
      matchedOn: ['phone', 'email'],
    })
  })

  it('merges into the existing contact, or creates a separate one when asked', () => {
    const first = create({ name: 'Kemi', phone: '+237677123456' })
    const merged = create({
      type: 'SUPPLIER',
      name: 'Kemi Stores',
      phone: '677123456',
      email: 'kemi@shop.cm',
      onDuplicate: 'MERGE',
    })
    expect(merged).toMatchObject({
      id: first.id,
      name: 'Kemi Stores',
      type: 'BOTH',
      email: 'kemi@shop.cm',
    })
    expect(count()).toBe(1)

    const second = create({ name: 'Kemi Junior', phone: '677123456', onDuplicate: 'CREATE' })
    expect(second.name).toBe('Kemi Junior')
    expect(count()).toBe(2)
  })
})
