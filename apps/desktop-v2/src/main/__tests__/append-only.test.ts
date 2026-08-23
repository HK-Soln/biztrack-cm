import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { AuditService, type AuditContext } from '../services/audit.service'

/**
 * BIZ-2.8 — DB-level append-only guards on local_audit_logs + sale_payments. These assert
 * the SQLite triggers reject tampering at the database, not in application code.
 */
describe('append-only guards (BIZ-2.8)', () => {
  let db: DatabaseService
  beforeEach(() => {
    db = createTestDatabase()
  })

  const insertAudit = (id: string): void => {
    const now = new Date().toISOString()
    db.run(
      `INSERT INTO local_audit_logs
        (id, business_id, actor_type, action, entity_type, entity_id, amount, created_at, device_time)
       VALUES (?, 'biz-1', 'USER', 'CREATE', 'sale', 's1', 5000, ?, ?)`,
      [id, now, now],
    )
  }

  it('rejects DELETE on local_audit_logs', () => {
    insertAudit('a1')
    expect(() => db.run(`DELETE FROM local_audit_logs WHERE id = 'a1'`)).toThrow(/append-only/i)
  })

  it('allows deleting a SYNCED audit row (prune) but still blocks an unsynced one (BIZ-2.10)', () => {
    const now = new Date().toISOString()
    db.run(
      `INSERT INTO local_audit_logs
        (id, business_id, actor_type, action, entity_type, entity_id, created_at, device_time, synced_at)
       VALUES ('synced', 'biz-1', 'USER', 'CREATE', 'sale', 'x', ?, ?, ?)`,
      [now, now, now],
    )
    insertAudit('unsynced') // synced_at stays NULL
    // Unsynced rows remain append-only; only pushed rows may be pruned.
    expect(() => db.run(`DELETE FROM local_audit_logs WHERE id = 'unsynced'`)).toThrow(
      /append-only/i,
    )
    expect(() => db.run(`DELETE FROM local_audit_logs WHERE id = 'synced'`)).not.toThrow()
  })

  it('rejects UPDATE of audit content, but allows the sync bookkeeping columns', () => {
    insertAudit('a2')
    // Tampering with the recorded event is rejected.
    expect(() => db.run(`UPDATE local_audit_logs SET action = 'DELETE' WHERE id = 'a2'`)).toThrow(
      /append-only/i,
    )
    expect(() => db.run(`UPDATE local_audit_logs SET amount = 1 WHERE id = 'a2'`)).toThrow(
      /append-only/i,
    )
    // The future audit bridge must still be able to mark a row shipped.
    const now = new Date().toISOString()
    expect(() =>
      db.run(`UPDATE local_audit_logs SET synced_at = ?, server_time = ? WHERE id = 'a2'`, [
        now,
        now,
      ]),
    ).not.toThrow()
  })

  it('rejects DELETE on sale_payments (append-only)', () => {
    const now = new Date().toISOString()
    db.run(
      `INSERT INTO sales
        (id, business_id, client_id, cashier_id, sale_number, receipt_number, subtotal,
         total_amount, discount_amount, charges_amount, tax_amount, net_amount, amount_paid,
         credit_amount, change_given, payment_method, currency, sale_date, sold_at,
         status, is_deleted, created_at, updated_at)
       VALUES ('sale-1', 'biz-1', 'c', 'u-1', 'S1', 'R1', 5000, 5000, 0, 0, 0, 5000, 5000, 0, 0,
               'CASH', 'XAF', ?, ?, 'COMPLETED', 0, ?, ?)`,
      [now.slice(0, 10), now, now, now],
    )
    db.run(
      `INSERT INTO sale_payments (id, sale_id, business_id, method, amount, created_at)
       VALUES ('pay-1', 'sale-1', 'biz-1', 'CASH', 5000, ?)`,
      [now],
    )
    expect(() => db.run(`DELETE FROM sale_payments WHERE id = 'pay-1'`)).toThrow(/append-only/i)
    // The idempotent sync echo (re-writing the same row) must still be allowed.
    expect(() => db.run(`UPDATE sale_payments SET amount = 5000 WHERE id = 'pay-1'`)).not.toThrow()
  })

  it('stamps a monotonic sequence per device (BIZ-2.9)', () => {
    const ctxFor =
      (deviceId: string): (() => AuditContext) =>
      () => ({
        businessId: 'biz-1',
        actorId: 'u-1',
        actorName: 'Alice',
        actorRole: 'OWNER',
        deviceId,
      })
    const svcA = new AuditService(db, ctxFor('dev-1'))
    const svcB = new AuditService(db, ctxFor('dev-2'))
    svcA.log({ action: 'CREATE', entityType: 'sale', entityId: 's1' })
    svcA.log({ action: 'SALE_VOIDED', entityType: 'sale', entityId: 's1' })
    svcB.log({ action: 'CREATE', entityType: 'sale', entityId: 's2' })

    const seq = (deviceId: string): number[] =>
      db
        .query<{
          sequence: number
        }>(`SELECT sequence FROM local_audit_logs WHERE device_id = ? ORDER BY sequence`, [
          deviceId,
        ])
        .map((r) => r.sequence)
    // Each device counts independently from 1.
    expect(seq('dev-1')).toEqual([1, 2])
    expect(seq('dev-2')).toEqual([1])
  })
})
