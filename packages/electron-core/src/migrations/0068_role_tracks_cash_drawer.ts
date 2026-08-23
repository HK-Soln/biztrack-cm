import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * BIZ (device): mirror roles.tracks_cash_drawer so the renderer can decide, offline,
 * whether the signed-in user's role runs a till (prompt to open a shift at login, show
 * the shift control in the nav). Arrives via the roles sync pull; default 0 is safe.
 */
export const migration_0068: Migration = {
  id: 68,
  name: '0068_role_tracks_cash_drawer',
  up(db) {
    ensureColumn(db, 'roles', 'tracks_cash_drawer', 'INTEGER NOT NULL DEFAULT 0')
  },
}
