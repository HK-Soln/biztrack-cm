import { describe, expect, it } from 'vitest'
import { ContactType } from '@biztrack/types'
import { slugify } from '../text/slug'
import {
  checkContactArchive,
  checkContactInput,
  isValidEmail,
  contactNameKey,
  findContactClashes,
  mergeContact,
  normalizeEmail,
  normalizePhone,
} from './contact-rules'

describe('slugify and contactNameKey', () => {
  it('compares names by their slug', () => {
    expect(slugify('  Kémi   Stores! ')).toBe('kemi-stores')
    expect(contactNameKey('Kemi Stores')).toBe(contactNameKey('kemi-stores'))
  })
})

describe('normalizePhone', () => {
  it('stores a valid number from any country in international form', () => {
    expect(normalizePhone('677 12 34 56')).toBe('+237677123456')
    expect(normalizePhone('+237 6 77 12 34 56')).toBe('+237677123456')
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('+33612345678')
    expect(normalizePhone('+1 202 555 0143')).toBe('+12025550143')
  })
  it('has none for a blank or invalid number', () => {
    expect(normalizePhone('  ')).toBeNull()
    expect(normalizePhone('12')).toBeNull()
  })
})

describe('checkContactInput', () => {
  it('needs only a name, and valid phones when given', () => {
    expect(checkContactInput({ name: 'Kemi' })).toBeNull()
    expect(checkContactInput({ name: '  ' })).toBe('CONTACT_NAME_REQUIRED')
    expect(checkContactInput({ name: '!!!' })).toBe('CONTACT_NAME_REQUIRED')
    expect(checkContactInput({ name: 'Kemi', phone: '12' })).toBe('CONTACT_PHONE_INVALID')
    expect(checkContactInput({ name: 'Kemi', phone: '677123456' })).toBeNull()
  })
})

describe('findContactClashes', () => {
  const existing = [
    { id: 'a', name: 'Kemi Stores', phone: '+237677123456', email: 'kemi@shop.cm' },
    { id: 'b', name: 'Ali', phone: null, phoneAlt: '677 00 11 22', email: null },
  ]

  it('finds a name already taken, by its slug', () => {
    expect(findContactClashes({ name: 'kemi-stores' }, existing).nameTaken?.id).toBe('a')
    expect(findContactClashes({ name: 'Kemi Stores', selfId: 'a' }, existing).nameTaken).toBeNull()
  })

  it('finds a duplicate by phone, alternate phone or email, however written', () => {
    expect(
      findContactClashes({ name: 'New', phone: '677 12 34 56', email: 'KEMI@shop.cm' }, existing)
        .duplicates,
    ).toEqual([{ contactId: 'a', name: 'Kemi Stores', matchedOn: ['phone', 'email'] }])
    expect(
      findContactClashes({ name: 'New', phone: '+237677001122' }, existing).duplicates,
    ).toEqual([{ contactId: 'b', name: 'Ali', matchedOn: ['phone'] }])
    expect(findContactClashes({ name: 'New' }, existing)).toEqual({
      nameTaken: null,
      duplicates: [],
    })
  })
})

describe('mergeContact', () => {
  it('takes the new name, becomes both types, and fills only what was missing', () => {
    expect(
      mergeContact(
        { type: ContactType.CUSTOMER, name: 'Kemi', phone: '+237677123456', email: null },
        {
          type: ContactType.SUPPLIER,
          name: 'Kemi Stores',
          phone: '+237699999999',
          email: 'kemi@shop.cm',
        },
      ),
    ).toEqual({
      type: ContactType.BOTH,
      name: 'Kemi Stores',
      phone: '+237677123456',
      phoneAlt: null,
      email: 'kemi@shop.cm',
      address: null,
      notes: null,
    })
  })
  it('lower-cases emails for comparison', () => {
    expect(normalizeEmail('  A@B.CM ')).toBe('a@b.cm')
  })
})

describe('contact email and archiving', () => {
  it('refuses an email not written as one', () => {
    expect(isValidEmail('kemi@shop.cm')).toBe(true)
    expect(isValidEmail('kemi@shop')).toBe(false)
    expect(checkContactInput({ name: 'Kemi', email: 'kemi at shop' })).toBe('CONTACT_EMAIL_INVALID')
    expect(checkContactInput({ name: 'Kemi', email: ' ' })).toBeNull()
  })
  it('keeps a contact with open debts from being archived', () => {
    expect(checkContactArchive({ wasActive: true, isActive: false, hasOpenDebts: true })).toBe(
      'CONTACT_HAS_OPEN_DEBTS',
    )
    expect(
      checkContactArchive({ wasActive: true, isActive: false, hasOpenDebts: false }),
    ).toBeNull()
    expect(
      checkContactArchive({ wasActive: false, isActive: false, hasOpenDebts: true }),
    ).toBeNull()
  })
})
