import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Receive-from-PO settlement: let a goods receipt carry supplier discount lines,
 * additional charge lines (tax/transport/packaging from the charge_types catalog),
 * and a supplier invoice (number + date + file) for audit. Mirrors the sale charge/
 * discount model (sale_charges / sale_discounts). Split payments already use the
 * pre-existing restock_payments table.
 *
 *   subtotal (total_cost) − discount_amount + charges_amount = total_amount (invoice)
 *   total_amount − Σ payments = credit (supplier payable)
 */
export const migration_0043: Migration = {
  id: 43,
  name: '0043_restock_settlement',
  up(db) {
    ensureColumn(db, 'restock_records', 'discount_amount', 'REAL NOT NULL DEFAULT 0')
    ensureColumn(db, 'restock_records', 'charges_amount', 'REAL NOT NULL DEFAULT 0')
    ensureColumn(db, 'restock_records', 'invoice_number', 'TEXT')
    ensureColumn(db, 'restock_records', 'invoice_date', 'TEXT')
    ensureColumn(db, 'restock_records', 'invoice_file_url', 'TEXT')

    db.exec(`
      CREATE TABLE IF NOT EXISTS restock_charges (
        id                TEXT PRIMARY KEY,
        restock_record_id TEXT NOT NULL,
        business_id       TEXT NOT NULL,
        charge_type_id    TEXT,
        name              TEXT NOT NULL,
        rate_type         TEXT NOT NULL DEFAULT 'FIXED',
        rate_value        REAL NOT NULL DEFAULT 0,
        amount            REAL NOT NULL DEFAULT 0,
        created_at        TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_restock_charges_record ON restock_charges(restock_record_id);
      CREATE INDEX IF NOT EXISTS idx_restock_charges_business ON restock_charges(business_id);

      CREATE TABLE IF NOT EXISTS restock_discounts (
        id                TEXT PRIMARY KEY,
        restock_record_id TEXT NOT NULL,
        business_id       TEXT NOT NULL,
        description       TEXT NOT NULL DEFAULT '',
        discount_type     TEXT NOT NULL DEFAULT 'FIXED_AMOUNT',
        rate              REAL,
        amount            REAL NOT NULL DEFAULT 0,
        created_at        TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_restock_discounts_record ON restock_discounts(restock_record_id);
      CREATE INDEX IF NOT EXISTS idx_restock_discounts_business ON restock_discounts(business_id);
    `)
  },
}
