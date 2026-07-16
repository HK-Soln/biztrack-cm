import { randomUUID } from 'crypto'
import type { Migration } from './runner'

/**
 * Materialize existing opening balances as OPENING_BALANCE debts so they can be paid through the
 * normal debt-payment flow. Idempotent: only inserts where no OPENING_BALANCE debt yet exists for
 * the (business, contact, direction). `source_id = contact_id` matches the runtime materialization
 * (deterministic natural key that converges with the cloud on sync). `created_at` is pinned to the
 * opening-balance `as_of_date` so the debt sorts to the top of the account statement.
 *
 * These rows are NOT enqueued to the outbox: the API runs its own equivalent backfill, and both
 * sides converge on the natural key, so there is nothing to push. Payments recorded later enqueue
 * the debt (with its payments) as usual.
 */
export const migration_0051: Migration = {
  id: 51,
  name: '0051_backfill_opening_balance_debts',
  up(db) {
    const obs = db
      .prepare(
        `SELECT business_id, contact_id, direction, amount, as_of_date FROM contact_opening_balances`,
      )
      .all() as Array<{
      business_id: string
      contact_id: string
      direction: string
      amount: number
      as_of_date: string
    }>

    const exists = db.prepare(
      `SELECT id FROM debts WHERE business_id = ? AND source_type = 'OPENING_BALANCE' AND source_id = ? AND direction = ?`,
    )
    const insert = db.prepare(
      `INSERT INTO debts (id, business_id, contact_id, direction, source_type, source_id, source_reference, original_amount, status, due_date, notes, created_at)
       VALUES (?, ?, ?, ?, 'OPENING_BALANCE', ?, 'Opening balance', ?, 'OUTSTANDING', NULL, NULL, ?)`,
    )

    for (const ob of obs) {
      if (exists.get(ob.business_id, ob.contact_id, ob.direction)) continue
      insert.run(
        randomUUID(),
        ob.business_id,
        ob.contact_id,
        ob.direction,
        ob.contact_id,
        ob.amount,
        `${ob.as_of_date}T00:00:00.000Z`,
      )
    }
  },
}
