import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

export class DatabaseService {
  private db: Database.Database

  constructor() {
    const dbPath = app.isPackaged
      ? join(app.getPath('userData'), 'biztrack.db')
      : join(__dirname, '../../../biztrack-dev.db')

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.initialize()
  }

  private initialize() {
    // Schema mirrors WatermelonDB schema column-for-column
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        sku TEXT,
        barcode TEXT,
        price REAL NOT NULL,
        cost_price REAL,
        stock_quantity INTEGER NOT NULL DEFAULT 0,
        low_stock_threshold INTEGER NOT NULL DEFAULT 5,
        unit TEXT NOT NULL DEFAULT 'piece',
        category_id TEXT,
        image_url TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS product_categories (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        name TEXT NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        cashier_id TEXT NOT NULL,
        device_id TEXT,
        total_amount REAL NOT NULL,
        discount_amount REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        net_amount REAL NOT NULL,
        payment_method TEXT NOT NULL,
        momo_reference TEXT,
        notes TEXT,
        receipt_number TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'COMPLETED',
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id)
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        recorded_by_id TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_method TEXT NOT NULL,
        receipt_url TEXT,
        date TEXT NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_log (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        synced_at TEXT NOT NULL,
        pushed_count INTEGER DEFAULT 0,
        pulled_count INTEGER DEFAULT 0,
        conflict_count INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_sales_business ON sales(business_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_expenses_business ON expenses(business_id, date);
    `)
  }

  query(sql: string, params?: unknown[]): unknown[] {
    return this.db.prepare(sql).all(params ?? [])
  }

  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    return this.db.prepare(sql).run(params ?? [])
  }

  close() {
    this.db.close()
  }
}
