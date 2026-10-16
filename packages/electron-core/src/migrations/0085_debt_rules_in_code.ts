import {
  debtSettledAt,
  debtStanding,
  refundProfitImpact,
  settleSaleFromLedger,
} from '@biztrack/domain'
import type { Migration } from './runner'

/**
 * Debts: the rules move out of SQLite triggers into @biztrack/domain, called by the sale,
 * void, refund, restock and debt-payment code (docs/design/domain-package.md, slice 6).
 *
 * 1. Drop the triggers that created and updated a sale's receivable and a restock's payable,
 *    and recomputed a debt's status when a payment row changed.
 * 2. Repair what the sale trigger got wrong after a partial return. It set the receivable
 *    to the sale's balance, and the balance did not take off the goods that came back
 *    (ruling R9): a sale paid in full and partly refunded got a receivable for the cash
 *    handed back, and a credit sale's receivable grew by it. Each partly returned sale gets
 *    its balance worked out again; its receivable is set to that balance, or removed when
 *    nothing was ever owed and nothing was paid against it.
 *
 * Nothing here is pushed: the server never applied the trigger's rule, so its records are
 * already right.
 */
export const migration_0085: Migration = {
  id: 85,
  name: '0085_debt_rules_in_code',
  up(db) {
    db.exec(`
      DROP TRIGGER IF EXISTS trg_sales_source_debt_after_insert;
      DROP TRIGGER IF EXISTS trg_sales_source_debt_after_update;
      DROP TRIGGER IF EXISTS trg_sales_source_debt_write_off;
      DROP TRIGGER IF EXISTS trg_restock_source_debt_after_insert;
      DROP TRIGGER IF EXISTS trg_restock_source_debt_after_update;
      DROP TRIGGER IF EXISTS trg_debt_payments_after_insert;
      DROP TRIGGER IF EXISTS trg_debt_payments_after_delete;
    `)

    const hasTable = (name: string): boolean =>
      !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name)
    if (!hasTable('sale_returns') || !hasTable('sale_return_items')) return

    const sales = db
      .prepare(
        `SELECT id, total_amount, credit_amount FROM sales WHERE status = 'PARTIALLY_REFUNDED'`,
      )
      .all() as Array<{ id: string; total_amount: number; credit_amount: number | null }>
    const paymentsOf = db.prepare(`SELECT kind, amount FROM sale_payments WHERE sale_id = ?`)
    const returnedOf = db.prepare(
      `SELECT ri.quantity AS returnedQuantity, si.quantity AS soldQuantity, si.line_total AS lineTotal
         FROM sale_return_items ri
         JOIN sale_returns r ON r.id = ri.sale_return_id
         JOIN sale_items si ON si.id = ri.sale_item_id
        WHERE r.sale_id = ?`,
    )
    const debtOf = db.prepare(
      `SELECT d.id, d.status, d.settled_at, d.created_at,
              COALESCE((SELECT SUM(amount) FROM debt_payments WHERE debt_id = d.id), 0) AS paid
         FROM debts d
        WHERE d.source_type = 'SALE' AND d.source_id = ? AND d.direction = 'RECEIVABLE'`,
    )
    const setSaleCredit = db.prepare(`UPDATE sales SET credit_amount = ? WHERE id = ?`)
    const setDebt = db.prepare(
      `UPDATE debts SET original_amount = ?, status = ?, settled_at = ? WHERE id = ?`,
    )
    const removeDebt = db.prepare(`DELETE FROM debts WHERE id = ?`)

    for (const sale of sales) {
      const returned = returnedOf.all(sale.id) as Array<{
        returnedQuantity: number
        soldQuantity: number
        lineTotal: number
      }>
      if (returned.length === 0) continue
      const { creditAmount } = settleSaleFromLedger({
        totalAmount: sale.total_amount,
        entries: paymentsOf.all(sale.id) as Array<{ kind: 'PAYMENT' | 'REFUND'; amount: number }>,
        returnedGoodsValue: refundProfitImpact({
          restock: false,
          lines: returned.map((line) => ({ ...line, costPrice: null })),
        }).revenue,
      })
      if (creditAmount !== Number(sale.credit_amount ?? 0)) setSaleCredit.run(creditAmount, sale.id)

      const debt = debtOf.get(sale.id) as
        | {
            id: string
            status: string
            settled_at: string | null
            created_at: string
            paid: number
          }
        | undefined
      if (!debt || debt.status === 'WRITTEN_OFF') continue
      if (creditAmount <= 0 && debt.paid <= 0) {
        removeDebt.run(debt.id)
        continue
      }
      const originalAmount = Math.max(creditAmount, debt.paid)
      const standing = debtStanding({ originalAmount, paidAmount: debt.paid })
      setDebt.run(
        originalAmount,
        standing.status,
        debtSettledAt(standing, debt.settled_at, debt.created_at),
        debt.id,
      )
    }
  },
}
