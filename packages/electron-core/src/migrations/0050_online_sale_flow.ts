import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Online-order → sale flow, Phase 0 (mirrors the API migration; ships dark). Adds the
 * sale channel/order link, the signed-ledger columns on sale_payments, and the
 * return/refund tables. Online sales are created server-side and pulled down, so these
 * are populated by the sync applier — see the desktop sync.service maps.
 */
export const migration_0050: Migration = {
  id: 50,
  name: '0050_online_sale_flow',
  up(db) {
    // sales: channel + bidirectional online-order link
    ensureColumn(db, 'sales', 'source', "TEXT NOT NULL DEFAULT 'IN_STORE'")
    ensureColumn(db, 'sales', 'online_order_id', 'TEXT')
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_online_order_id ON sales(online_order_id)`)

    // sale_payments: signed ledger (PAYMENT/REFUND) + append metadata
    ensureColumn(db, 'sale_payments', 'kind', "TEXT NOT NULL DEFAULT 'PAYMENT'")
    ensureColumn(db, 'sale_payments', 'recorded_at', 'TEXT')
    ensureColumn(db, 'sale_payments', 'recorded_by_id', 'TEXT')
    ensureColumn(db, 'sale_payments', 'note', 'TEXT')

    // sale_returns / sale_return_items — children of the sale aggregate
    db.exec(`
      CREATE TABLE IF NOT EXISTS sale_returns (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        business_id TEXT NOT NULL,
        online_order_id TEXT,
        reason TEXT,
        restock INTEGER NOT NULL DEFAULT 1,
        refund_amount REAL NOT NULL DEFAULT 0,
        created_by_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_id ON sale_returns(sale_id);
      CREATE INDEX IF NOT EXISTS idx_sale_returns_business_id ON sale_returns(business_id);

      CREATE TABLE IF NOT EXISTS sale_return_items (
        id TEXT PRIMARY KEY,
        sale_return_id TEXT NOT NULL,
        business_id TEXT NOT NULL,
        sale_item_id TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        serial_unit_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (sale_return_id) REFERENCES sale_returns(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sale_return_items_return_id ON sale_return_items(sale_return_id);
      CREATE INDEX IF NOT EXISTS idx_sale_return_items_business_id ON sale_return_items(business_id);
    `)
  },
}
