import { describe, expect, it } from 'vitest'
import { findOnlineCustomer, onlineBuyerKeys } from './online-customers'

describe('onlineBuyerKeys', () => {
  it('puts the phone in international form and the email in lower case', () => {
    expect(onlineBuyerKeys({ phone: '677 12 34 56', email: ' Kemi@Shop.CM ' })).toEqual({
      phone: '+237677123456',
      email: 'kemi@shop.cm',
    })
  })

  it('keeps a phone that cannot be read as typed, and empties blank values', () => {
    expect(onlineBuyerKeys({ phone: ' 12 ', email: '  ' })).toEqual({ phone: '12', email: null })
  })
})

describe('findOnlineCustomer', () => {
  const customers = [
    { id: 'a', phone: '+237677123456', email: null },
    { id: 'b', phone: null, email: 'kemi@shop.cm' },
  ]

  it('recognises a returning buyer by phone, however it is typed', () => {
    expect(findOnlineCustomer({ phone: '677123456' }, customers)?.id).toBe('a')
  })

  it('falls back to the email when the phone is new', () => {
    expect(findOnlineCustomer({ phone: '699000111', email: 'KEMI@shop.cm' }, customers)?.id).toBe(
      'b',
    )
  })

  it('returns null for a first-time buyer', () => {
    expect(findOnlineCustomer({ phone: '699000111', email: 'new@shop.cm' }, customers)).toBeNull()
  })
})
