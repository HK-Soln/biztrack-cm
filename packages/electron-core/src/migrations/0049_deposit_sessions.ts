import type { Migration } from './runner'
import { ensureColumn } from './runner'

/** Deposit sessions: a customer may have many closed sessions but at most one OPEN.
 * Adds lifecycle columns + a partial-unique index enforcing one open session. Existing
 * accounts become OPEN sessions. Mirrors the API deposit-sessions migration. */
export const migration_0049: Migration = {
  id: 49,
  name: '0049_deposit_sessions',
  up(db) {
    ensureColumn(db, 'savings_accounts', 'total_transferred', "REAL NOT NULL DEFAULT 0")
    ensureColumn(db, 'savings_accounts', 'status', "TEXT NOT NULL DEFAULT 'OPEN'")
    ensureColumn(db, 'savings_accounts', 'outcome', 'TEXT')
    ensureColumn(db, 'savings_accounts', 'closed_at', 'TEXT')
    ensureColumn(db, 'savings_accounts', 'closed_by_id', 'TEXT')
    ensureColumn(db, 'savings_accounts', 'transferred_to_id', 'TEXT')
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_savings_open_per_customer
       ON savings_accounts (business_id, customer_id) WHERE status = 'OPEN' AND is_deleted = 0`,
    )
  },
}
