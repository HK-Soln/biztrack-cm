import { beforeEach, describe, expect, it } from 'vitest'
import { PaymentMethod } from '@biztrack/types'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { DebtsService } from '../services/debts.service'
import { SalesService } from '../services/sales.service'
import { SavingsService } from '../services/savings.service'

// Customer savings on the till. The rules are @biztrack/domain's (savingsDeposit,
// savingsPurchase, savingsPurchaseReversal, decideSavingsClose), the ones the server runs.

const BIZ = 'biz-1'
const NOW = '2026-08-28T12:00:00.000Z'

describe('customer savings on the till', () => {
  let db: DatabaseService
  let savings: SavingsService
  let sales: SalesService

  beforeEach(() => {
    db = createTestDatabase()
    db.run(
      `INSERT INTO products (id, business_id, name, price, cost_price, stock_quantity, track_inventory, unit, created_at, updated_at)
       VALUES ('p-1', ?, 'Rice', 1000, 500, 100, 1, 'kg', ?, ?)`,
      [BIZ, NOW, NOW],
    )
    db.run(
      `INSERT INTO contacts (id, business_id, type, name, phone, is_active, created_at, updated_at)
       VALUES ('c-1', ?, 'CUSTOMER', 'Kemi', '+237600000000', 1, ?, ?)`,
      [BIZ, NOW, NOW],
    )
    savings = new SavingsService(db, () => BIZ)
    sales = new SalesService(
      db,
      () => BIZ,
      () => {},
      () => 'u-1',
      () => 'Cashier',
      new DebtsService(
        db,
        () => BIZ,
        () => {},
        () => 'u-1',
      ),
      savings,
    )
  })

  const open = (amount: number) =>
    savings.createSession({
      customerId: 'c-1',
      initialDeposit: { amount, method: 'CASH' },
    } as never)
  const account = (id: string) =>
    db.get<{ balance: number; total_used: number; total_deposited: number }>(
      `SELECT balance, total_used, total_deposited FROM savings_accounts WHERE id = ?`,
      [id],
    )!
  const payFromSavings = (accountId: string, amount: number) =>
    sales.createSale({
      clientId: `client-${amount}`,
      soldAt: NOW,
      customerId: 'c-1',
      items: [{ productId: 'p-1', quantity: amount / 1000, unitPrice: 1000 }],
      payments: [{ method: PaymentMethod.SAVINGS, amount, savingsAccountId: accountId }],
    })

  it('takes a purchase off the balance and gives it back when the sale is voided', () => {
    const acc = open(5000)
    const sale = payFromSavings(acc.id, 3000)
    expect(account(acc.id)).toMatchObject({ balance: 2000, total_used: 3000 })

    sales.voidSale(sale.id, 'Rang up by mistake at the till')
    expect(account(acc.id)).toMatchObject({ balance: 5000, total_used: 0 })
  })

  it('refuses a sale paid from more savings than the customer has', () => {
    const acc = open(2000)
    expect(() => payFromSavings(acc.id, 3000)).toThrow('Insufficient deposit balance')
    // Nothing of the sale was kept, and the account is untouched.
    expect(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM sales`)!.n).toBe(0)
    expect(account(acc.id)).toMatchObject({ balance: 2000, total_used: 0 })
  })

  it('adds a payment in whole francs and refuses one of nothing', () => {
    const acc = open(1000)
    savings.addPayment(acc.id, { amount: 2500.4, method: 'CASH' } as never)
    expect(account(acc.id)).toMatchObject({ balance: 3500, total_deposited: 3500 })
    expect(() => savings.addPayment(acc.id, { amount: 0, method: 'CASH' } as never)).toThrow(
      'greater than 0',
    )
  })

  it('closes with a refund less the charge, and refuses a refund that does not add up', () => {
    const acc = open(10000)
    expect(() =>
      savings.close(acc.id, {
        settlement: 'REFUND',
        cancellationCharge: 1000,
        refunds: [{ method: 'CASH', amount: 5000 }],
      } as never),
    ).toThrow('add up')

    const closed = savings.close(acc.id, {
      settlement: 'REFUND',
      cancellationCharge: 1000,
    } as never)
    expect(closed.balance).toBe(0)
    expect(
      db.get<{ total_refunded: number }>(
        `SELECT total_refunded FROM savings_accounts WHERE id = ?`,
        [acc.id],
      )!.total_refunded,
    ).toBe(9000)
  })
})
