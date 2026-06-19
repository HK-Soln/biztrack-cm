import type { Migration } from './runner'
import { ensureColumn } from './runner'

/** Store the supplier's uploaded quotation document (PDF) URL on the RFQ supplier row. */
export const migration_0042: Migration = {
  id: 42,
  name: '0042_rfq_quote_file',
  up(db) {
    ensureColumn(db, 'rfq_suppliers', 'quote_file_url', 'TEXT')
  },
}
