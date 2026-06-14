import 'server-only'
import { getDataSource } from '@/server/data-source'

// Walking-skeleton BFF queries. Real feature modules (products, sales, …) will be
// ported here from v1's *.local.ts, all going through the DataSource abstraction.

export async function getSkeletonCheck(): Promise<{ value: string; checkedAt: string } | null> {
  const ds = getDataSource()
  try {
    const row = await ds.get<{ value: string; checked_at: string }>(
      'SELECT value, checked_at FROM _skeleton_check ORDER BY id DESC LIMIT 1',
    )
    if (!row) return null
    return { value: row.value, checkedAt: row.checked_at }
  } catch {
    // _skeleton_check is a dev-seed artifact (not a migration); absent before seed.
    return null
  }
}

export async function getProductCount(): Promise<number> {
  const ds = getDataSource()
  const row = await ds.get<{ count: number }>('SELECT COUNT(*) AS count FROM products')
  return row?.count ?? 0
}
