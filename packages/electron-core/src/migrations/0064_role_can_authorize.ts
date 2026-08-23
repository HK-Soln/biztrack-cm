import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * BIZ (device): mirror the roles.can_authorize flag so the till can decide, offline,
 * whether a role's members may authorize step-up (set PIN / approve discounts). The
 * value arrives via the existing roles sync pull; the default 0 is a safe fallback.
 */
export const migration_0064: Migration = {
  id: 64,
  name: '0064_role_can_authorize',
  up(db) {
    ensureColumn(db, 'roles', 'can_authorize', 'INTEGER NOT NULL DEFAULT 0')
  },
}
