import { beforeEach, describe, expect, it } from 'vitest'
import { MIGRATIONS, type DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { DebtsService } from '../services/debts.service'
import { SalesService } from '../services/sales.service'
import { SavingsService } from '../services/savings.service'
import type { SaleInput } from '../../shared/ipc'

// Rulings R9 to R11 on the till (docs/design/domain-package.md): what a return and a void do
// to what the customer owes. The rules are @biztrack/domain's (`settleSaleFromLedger`,
// `decideSaleRefund`, `reduceDebt`, `debtCanBeWrittenOff`), the same ones the server runs.

const BIZ = 'biz-1'
const NOW = '2026-08-28T12:00:00.000Z'
const CASH = 'CASH' as SaleInput['payments'][number]['method']

describe('what a return and a void do to what the customer owes', () => {
  let db: DatabaseService
  let sales: SalesService
  let debts: DebtsService
  let n = 0

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
    debts = new DebtsService(
      db,
      () => BIZ,
      () => {},
      () => 'u-1',
    )
    sales = new SalesService(
      db,
      () => BIZ,
      () => {},
      () => 'u-1',
      () => 'Cashier',
      debts,
      new SavingsService(db, () => BIZ),
    )
  })

  // Ten units at 1,000 to a known customer.
  const sell = (paid: number) =>
    sales.createSale({
      clientId: `client-${++n}`,
      soldAt: NOW,
      customerId: 'c-1',
      items: [{ productId: 'p-1', quantity: 10, unitPrice: 1000 }],
      payments: paid > 0 ? [{ method: CASH, amount: paid }] : [],
    })
  const giveBack = (saleId: string, quantity: number) => {
    const detail = sales.get(saleId)!
    return sales.refundSale(saleId, {
      items: [{ saleItemId: detail.items[0]!.id, quantity }],
      restock: true,
    } as never)
  }
  const debtOf = (saleId: string) =>
    db.get<{ id: string; original_amount: number; status: string }>(
      `SELECT id, original_amount, status FROM debts WHERE source_type = 'SALE' AND source_id = ?`,
      [saleId],
    )
  const refundedCash = (saleId: string) =>
    db.get<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM sale_payments WHERE sale_id = ? AND kind = 'REFUND'`,
      [saleId],
    )!.total

  it('a sale paid in full owes nothing after part of it is returned (R9)', () => {
    const sale = sell(10000)
    const after = giveBack(sale.id, 2)

    expect(refundedCash(sale.id)).toBe(2000)
    expect(after).toMatchObject({ amountPaid: 8000, creditAmount: 0 })
    expect(debtOf(sale.id)).toBeUndefined()
  })

  it('returned goods come off the debt first, with no money handed back (R10)', () => {
    const sale = sell(4000)
    const after = giveBack(sale.id, 2)

    expect(refundedCash(sale.id)).toBe(0)
    expect(after).toMatchObject({ amountPaid: 4000, creditAmount: 4000 })
    expect(debtOf(sale.id)).toMatchObject({ original_amount: 4000, status: 'OUTSTANDING' })
  })

  it('only what is beyond the debt is refunded (R10)', () => {
    const sale = sell(4000)
    const after = giveBack(sale.id, 8)

    expect(refundedCash(sale.id)).toBe(2000)
    expect(after).toMatchObject({ amountPaid: 2000, creditAmount: 0 })
    expect(debtOf(sale.id)).toMatchObject({ original_amount: 0, status: 'SETTLED' })
  })

  it('a debt partly paid off is reduced no further than what is left of it (R10)', () => {
    const sale = sell(4000)
    debts.recordPayment(debtOf(sale.id)!.id, {
      amount: 5000,
      method: CASH,
      paymentDate: NOW,
    } as never)
    // 1,000 still owed; 3,000 of goods come back: 1,000 off the debt, 2,000 in cash.
    giveBack(sale.id, 3)

    expect(refundedCash(sale.id)).toBe(2000)
    expect(debtOf(sale.id)).toMatchObject({ original_amount: 5000, status: 'SETTLED' })
  })

  it('voiding a sale whose debt was paid in full leaves the debt settled (R11)', () => {
    const sale = sell(4000)
    debts.recordPayment(debtOf(sale.id)!.id, {
      amount: 6000,
      method: CASH,
      paymentDate: NOW,
    } as never)
    sales.voidSale(sale.id, 'Rang up by mistake at the till')

    expect(debtOf(sale.id)).toMatchObject({ original_amount: 6000, status: 'SETTLED' })
  })

  describe('the one-time repair of debts the old triggers got wrong', () => {
    const repair = () => MIGRATIONS.find((m) => m.id === 85)!.up(db.connection)

    it('removes the receivable a refund created on a sale that was paid in full', () => {
      const sale = sell(10000)
      giveBack(sale.id, 2)
      // What the trigger used to leave behind: a balance and a receivable for the refund.
      db.run(`UPDATE sales SET credit_amount = 2000 WHERE id = ?`, [sale.id])
      db.run(
        `INSERT INTO debts (id, business_id, contact_id, direction, source_type, source_id, source_reference, original_amount, status, created_at)
         VALUES (?, ?, 'c-1', 'RECEIVABLE', 'SALE', ?, 'VTE-1', 2000, 'OUTSTANDING', ?)`,
        [`debt:sale:${sale.id}`, BIZ, sale.id, NOW],
      )

      repair()

      expect(debtOf(sale.id)).toBeUndefined()
      expect(sales.get(sale.id)!.creditAmount).toBe(0)
    })

    it('puts back a receivable the trigger had increased by the cash refunded', () => {
      // The old behaviour on a credit sale: 2,000 handed back, debt raised from 6,000 to 8,000.
      const sale = sell(4000)
      const itemId = sales.get(sale.id)!.items[0]!.id
      db.run(
        `INSERT INTO sale_returns (id, sale_id, business_id, restock, refund_amount, created_at)
         VALUES ('ret-1', ?, ?, 1, 2000, ?)`,
        [sale.id, BIZ, NOW],
      )
      db.run(
        `INSERT INTO sale_return_items (id, sale_return_id, business_id, sale_item_id, quantity, created_at)
         VALUES ('ri-1', 'ret-1', ?, ?, 2, ?)`,
        [BIZ, itemId, NOW],
      )
      db.run(
        `INSERT INTO sale_payments (id, sale_id, business_id, method, amount, kind, created_at)
         VALUES ('pay-refund', ?, ?, 'CASH', 2000, 'REFUND', ?)`,
        [sale.id, BIZ, NOW],
      )
      db.run(
        `UPDATE sales SET status = 'PARTIALLY_REFUNDED', amount_paid = 2000, credit_amount = 8000 WHERE id = ?`,
        [sale.id],
      )
      db.run(`UPDATE debts SET original_amount = 8000 WHERE source_id = ?`, [sale.id])

      repair()

      // 8,000 of goods kept, 2,000 still paid: 6,000 owed, as before the return.
      expect(debtOf(sale.id)).toMatchObject({ original_amount: 6000, status: 'OUTSTANDING' })
      expect(sales.get(sale.id)!.creditAmount).toBe(6000)
    })

    it('leaves sales with no returns and written-off debts alone', () => {
      const sale = sell(4000)
      const voided = sell(4000)
      sales.voidSale(voided.id, 'Rang up by mistake at the till')

      repair()

      expect(debtOf(sale.id)).toMatchObject({ original_amount: 6000, status: 'OUTSTANDING' })
      expect(debtOf(voided.id)).toMatchObject({ original_amount: 6000, status: 'WRITTEN_OFF' })
    })
  })
})
