import { describe, expect, it } from 'vitest'
import { ContactType, DebtDirection } from '@biztrack/types'
import { checkOpeningBalance } from './opening-balance'

describe('checkOpeningBalance', () => {
  const base = {
    amount: 1500.4,
    direction: DebtDirection.RECEIVABLE,
    contactType: ContactType.CUSTOMER,
    asOfDate: '2026-01-01',
  }
  it('takes a dated amount in whole francs', () => {
    expect(checkOpeningBalance(base)).toEqual({ ok: true, amount: 1500 })
    expect(
      checkOpeningBalance({
        ...base,
        direction: DebtDirection.PAYABLE,
        contactType: ContactType.BOTH,
      }),
    ).toEqual({ ok: true, amount: 1500 })
  })
  it('refuses nothing, a direction the type does not allow, or a bad date', () => {
    expect(checkOpeningBalance({ ...base, amount: 0.2 })).toMatchObject({
      code: 'OPENING_BALANCE_AMOUNT_INVALID',
    })
    expect(checkOpeningBalance({ ...base, contactType: ContactType.SUPPLIER })).toMatchObject({
      code: 'OPENING_BALANCE_DIRECTION_INVALID',
    })
    expect(checkOpeningBalance({ ...base, asOfDate: '01/01/2026' })).toMatchObject({
      code: 'OPENING_BALANCE_DATE_INVALID',
    })
  })
})
