import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Spec 07 build-order 5b [A11] — mirror the API's sale_payments.payment_attempt_id so a synced
 * ledger row can be traced back to the provider attempt that produced it. Additive nullable column;
 * pulled down via SALE_PAYMENT_MAP.
 */
export const migration_0080: Migration = {
  id: 80,
  name: '0080_sale_payment_attempt_id',
  up(db) {
    ensureColumn(db, 'sale_payments', 'payment_attempt_id', 'TEXT')
  },
}
