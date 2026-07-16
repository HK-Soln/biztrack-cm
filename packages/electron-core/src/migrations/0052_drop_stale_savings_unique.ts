import type { Migration } from './runner'

/**
 * Deposit sessions (0049) let a customer have many closed savings accounts + at most one OPEN
 * (enforced by the partial index uq_savings_open_per_customer). But the ORIGINAL full unique index
 * from 0015 — unq_savings_accounts_business_customer on (business_id, customer_id), i.e. one account
 * per customer EVER — was never dropped. So a customer's 2nd deposit session, or an account pulled
 * from the cloud for a customer who already has one locally, violates it and fails the sync batch.
 *
 * Drop the stale index to match the API, whose deposit-sessions migration
 * (apps/api/.../1782100000000-deposit-sessions.ts) drops unq_savings_business_customer and keeps
 * only the partial one-open-per-customer index.
 */
export const migration_0052: Migration = {
  id: 52,
  name: '0052_drop_stale_savings_unique',
  up(db) {
    db.exec(`DROP INDEX IF EXISTS unq_savings_accounts_business_customer`)
  },
}
