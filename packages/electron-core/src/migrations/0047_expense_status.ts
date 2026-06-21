import type { Migration } from './runner'
import { ensureColumn } from './runner'

/** Payment status of an expense (PAID | PENDING), mirroring the API expenses.status
 * column. Existing rows default to PAID. */
export const migration_0047: Migration = {
  id: 47,
  name: '0047_expense_status',
  up(db) {
    ensureColumn(db, 'expenses', 'status', "status TEXT NOT NULL DEFAULT 'PAID'")
  },
}
