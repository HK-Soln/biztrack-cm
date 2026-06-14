import type { DatabaseService } from '@biztrack/electron-core'

export interface CachedBusiness {
  id: string
  name: string
  currency: string
  role: string | null
}

export interface CachedUser {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  role: string | null
  businessId: string | null
}

/**
 * Reads/writes the local SQLite mirror that backs OFFLINE auth: the user profile
 * and the businesses they belong to. Populated after online auth; read when the
 * app opens without a network.
 */
export class LocalCache {
  constructor(private readonly db: DatabaseService) {}

  saveUser(user: CachedUser & { language?: string | null }): void {
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO local_user_profiles (id, name, email, phone, role, business_id, language, saved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, email=excluded.email, phone=excluded.phone,
         role=excluded.role, business_id=excluded.business_id,
         language=excluded.language, saved_at=excluded.saved_at`,
      [user.id, user.name, user.email, user.phone, user.role, user.businessId, user.language ?? null, now],
    )
  }

  getUser(id: string): CachedUser | null {
    const row = this.db.get<{
      id: string
      name: string | null
      email: string | null
      phone: string | null
      role: string | null
      business_id: string | null
    }>('SELECT id, name, email, phone, role, business_id FROM local_user_profiles WHERE id = ?', [id])
    if (!row) return null
    return { id: row.id, name: row.name, email: row.email, phone: row.phone, role: row.role, businessId: row.business_id }
  }

  saveBusinesses(userId: string, list: Array<{ id: string; name: string; currency?: string | null; role?: string | null }>): void {
    const now = new Date().toISOString()
    for (const b of list) {
      this.db.run(
        `INSERT INTO local_businesses (id, name, currency, user_id, saved_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, currency=excluded.currency,
           user_id=excluded.user_id, saved_at=excluded.saved_at`,
        [b.id, b.name, b.currency ?? 'XAF', userId, now],
      )
    }
  }

  getBusiness(id: string): CachedBusiness | null {
    const row = this.db.get<{ id: string; name: string; currency: string }>(
      'SELECT id, name, currency FROM local_businesses WHERE id = ?',
      [id],
    )
    return row ? { id: row.id, name: row.name, currency: row.currency, role: null } : null
  }

  listBusinesses(userId: string): CachedBusiness[] {
    const rows = this.db.query<{ id: string; name: string; currency: string }>(
      'SELECT id, name, currency FROM local_businesses WHERE user_id = ? ORDER BY name',
      [userId],
    )
    return rows.map((r) => ({ id: r.id, name: r.name, currency: r.currency, role: null }))
  }
}
