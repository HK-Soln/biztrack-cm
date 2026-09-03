import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Spec 07 §2.2/§4 [A5] — payment-provider CREDENTIALS must NEVER enter the sync graph. A reversible-
 * use provider secret must not reach a client device (unlike the one-way `member_auth_credentials`
 * hash, which legitimately pull-syncs). This guard fails if the credential table or entity is ever
 * referenced from a sync map/applier on either the API or the desktop side.
 */

const FORBIDDEN = ['business_payment_providers', 'BusinessPaymentProvider']

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (full.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('payment credentials are excluded from the sync graph', () => {
  const apiSyncDir = join(process.cwd(), 'src', 'modules', 'sync')
  const desktopSync = join(
    process.cwd(),
    '..',
    '..',
    'packages',
    'electron-core',
    'src',
    'services',
    'sync.service.ts',
  )

  const files = [...walk(apiSyncDir), ...(existsSync(desktopSync) ? [desktopSync] : [])]

  it('finds sync source files to scan', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(FORBIDDEN)('never references %s from any sync source', (needle) => {
    const offenders = files.filter((f) => readFileSync(f, 'utf8').includes(needle))
    expect(offenders).toEqual([])
  })
})
