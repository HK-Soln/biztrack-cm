/**
 * Seeds the v2 dev SQLite DB (runs all migrations + a `_skeleton_check` row).
 * The app also self-seeds on boot; this script is for explicit setup/testing.
 * Uses its own DB file so v1's dev DB is never touched.
 */
const path = require('path')
const { DatabaseService } = require('@biztrack/electron-core/database')

const dbPath = process.env.DESKTOP_DB_PATH || path.join(__dirname, '..', 'biztrack-v2-dev.db')
const db = new DatabaseService({ path: dbPath, migrate: true })

db.run(
  `CREATE TABLE IF NOT EXISTS _skeleton_check (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     value TEXT NOT NULL,
     checked_at TEXT NOT NULL
   )`,
)
db.run('DELETE FROM _skeleton_check')
db.run('INSERT INTO _skeleton_check (value, checked_at) VALUES (?, ?)', [
  'skeleton OK — read from local SQLite',
  new Date().toISOString(),
])

const { count } = db.get('SELECT COUNT(*) AS count FROM products') || { count: 0 }
db.close()

console.log(`✔ Seeded ${dbPath}`)
console.log(`  _skeleton_check: 1 row · products: ${count}`)
