import { describe, expect, it } from 'vitest'
import {
  decideSavingsClose,
  savingsDeposit,
  savingsPurchase,
  savingsPurchaseReversal,
  savingsRefundable,
  savingsRunningBalances,
} from './savings-account'

const account = {
  balance: 10000,
  totalDeposited: 15000,
  totalUsed: 5000,
  totalRefunded: 0,
  totalTransferred: 0,
}

describe('savingsDeposit', () => {
  it('adds to the balance and the total paid in', () => {
    expect(savingsDeposit(account, 2500)).toEqual({
      ok: true,
      amount: 2500,
      balance: 12500,
      totalDeposited: 17500,
    })
  })
  it('refuses nothing, a negative or a non-number', () => {
    expect(savingsDeposit(account, 0)).toEqual({ ok: false, code: 'DEPOSIT_AMOUNT_INVALID' })
    expect(savingsDeposit(account, -5)).toEqual({ ok: false, code: 'DEPOSIT_AMOUNT_INVALID' })
    expect(savingsDeposit(account, Number.NaN)).toEqual({
      ok: false,
      code: 'DEPOSIT_AMOUNT_INVALID',
    })
  })
})

describe('savingsPurchase', () => {
  const open = { ...account, open: true }
  it('takes the amount off the balance', () => {
    expect(savingsPurchase(open, 4000)).toEqual({
      ok: true,
      amount: 4000,
      balance: 6000,
      totalUsed: 9000,
    })
  })
  it('refuses more than the balance, or a closed session', () => {
    expect(savingsPurchase(open, 10001)).toEqual({
      ok: false,
      code: 'DEPOSIT_INSUFFICIENT_BALANCE',
    })
    expect(savingsPurchase({ ...open, open: false }, 100)).toEqual({
      ok: false,
      code: 'DEPOSIT_CLOSED',
    })
  })
  it('does nothing for an amount of nothing', () => {
    expect(savingsPurchase({ ...open, open: false }, 0)).toMatchObject({ ok: true, amount: 0 })
  })
})

describe('savingsPurchaseReversal', () => {
  it('puts the amount back, and never leaves the total used below zero', () => {
    expect(savingsPurchaseReversal(account, 4000)).toEqual({
      amount: 4000,
      balance: 14000,
      totalUsed: 1000,
    })
    expect(savingsPurchaseReversal(account, 6000).totalUsed).toBe(0)
  })
})

describe('decideSavingsClose', () => {
  it('closes with nothing left, and refuses to while money is left', () => {
    expect(
      decideSavingsClose({
        account: { ...account, balance: 0 },
        hasSales: true,
        settlement: 'NONE',
      }),
    ).toMatchObject({ ok: true, settlement: 'NONE' })
    expect(decideSavingsClose({ account, hasSales: true, settlement: 'NONE' })).toEqual({
      ok: false,
      code: 'DEPOSIT_LEFTOVER',
    })
  })

  it('refunds the balance less the charge, as one line or split', () => {
    expect(
      decideSavingsClose({
        account,
        hasSales: false,
        settlement: 'REFUND',
        cancellationCharge: 1000,
      }),
    ).toEqual({
      ok: true,
      settlement: 'REFUND',
      leftover: 10000,
      charge: 1000,
      refundTotal: 9000,
      refundLines: [{ method: 'CASH', amount: 9000, mobileMoneyReference: null }],
      cashRefunded: 9000,
      totalRefunded: 9000,
    })
    const split = decideSavingsClose({
      account,
      hasSales: false,
      settlement: 'REFUND',
      refunds: [
        { method: 'CASH', amount: 4000 },
        { method: 'MTN_MOMO', amount: 6000, mobileMoneyReference: 'ref' },
      ],
    })
    expect(split).toMatchObject({ ok: true, cashRefunded: 4000, refundTotal: 10000 })
  })

  it('refuses a refund that does not add up, a bad line, or a charge above the balance', () => {
    const refund = { account, hasSales: false, settlement: 'REFUND' as const }
    expect(decideSavingsClose({ ...refund, refunds: [{ amount: 5000 }] })).toEqual({
      ok: false,
      code: 'DEPOSIT_REFUND_MISMATCH',
    })
    expect(decideSavingsClose({ ...refund, refunds: [{ amount: 10000 }, { amount: 0 }] })).toEqual({
      ok: false,
      code: 'DEPOSIT_REFUND_LINE_INVALID',
    })
    expect(decideSavingsClose({ ...refund, cancellationCharge: 10001 })).toEqual({
      ok: false,
      code: 'DEPOSIT_CHARGE_TOO_HIGH',
    })
    expect(decideSavingsClose({ ...refund, account: { ...account, balance: 0 } })).toEqual({
      ok: false,
      code: 'DEPOSIT_NOTHING_TO_REFUND',
    })
  })

  it('keeps the whole balance as the charge with no refund lines', () => {
    expect(
      decideSavingsClose({
        account,
        hasSales: false,
        settlement: 'REFUND',
        cancellationCharge: 10000,
      }),
    ).toMatchObject({ ok: true, refundTotal: 0, refundLines: [], cashRefunded: 0 })
  })

  it('transfers the balance only when goods were collected', () => {
    expect(decideSavingsClose({ account, hasSales: true, settlement: 'TRANSFER' })).toEqual({
      ok: true,
      settlement: 'TRANSFER',
      leftover: 10000,
      transferAmount: 10000,
      totalTransferred: 10000,
    })
    expect(decideSavingsClose({ account, hasSales: false, settlement: 'TRANSFER' })).toEqual({
      ok: false,
      code: 'DEPOSIT_TRANSFER_NO_SALES',
    })
  })
})

describe('savingsRefundable and savingsRunningBalances', () => {
  it('works out the refund and the balance after each movement', () => {
    expect(savingsRefundable({ balance: 10000, cancellationCharge: 1500 })).toEqual({
      charge: 1500,
      refundTotal: 8500,
    })
    expect(
      savingsRunningBalances([
        { direction: 'inbound', amount: 5000 },
        { direction: 'outbound', amount: 2000 },
        { direction: 'inbound', amount: 1000 },
      ]),
    ).toEqual([5000, 3000, 4000])
  })
})
