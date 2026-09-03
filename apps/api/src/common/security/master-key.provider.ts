/**
 * Spec 07 §10 — the master-key seam. v1 resolves keys from an env var; the interface means swapping
 * to a KMS later is contained. `PAYMENT_MASTER_KEYS` is a versioned JSON map of base64 32-byte keys:
 *   {"1":"<base64>","2":"<base64>"}
 * Decrypt uses a row's stored key_version; encrypt always uses currentVersion(). Rotation: add a
 * higher version, bump current, re-encrypt in a batch job, drop the old version only when no row
 * references it.
 */
export interface MasterKeyProvider {
  /** The version new encryptions use. */
  currentVersion(): number
  /** The 32-byte key for a version. Must resolve ALL versions still referenced by stored rows. */
  keyFor(version: number): Buffer
}

/** DI token for the MasterKeyProvider (null-object when PAYMENT_MASTER_KEYS is unset). */
export const MASTER_KEY_PROVIDER = Symbol('MASTER_KEY_PROVIDER')

const KEY_BYTES = 32

export class EnvMasterKeyProvider implements MasterKeyProvider {
  private readonly keys = new Map<number, Buffer>()
  private readonly current: number

  constructor(rawJson: string) {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(rawJson) as Record<string, unknown>
    } catch {
      throw new Error('PAYMENT_MASTER_KEYS must be a JSON object of {version: base64Key}')
    }
    for (const [version, value] of Object.entries(parsed)) {
      const v = Number(version)
      if (!Number.isInteger(v) || v < 1)
        throw new Error(`PAYMENT_MASTER_KEYS: bad version "${version}"`)
      if (typeof value !== 'string')
        throw new Error(`PAYMENT_MASTER_KEYS: v${v} must be a base64 string`)
      const buf = Buffer.from(value, 'base64')
      if (buf.length !== KEY_BYTES)
        throw new Error(`PAYMENT_MASTER_KEYS: v${v} must decode to 32 bytes (got ${buf.length})`)
      this.keys.set(v, buf)
    }
    if (this.keys.size === 0) throw new Error('PAYMENT_MASTER_KEYS is empty')
    this.current = Math.max(...this.keys.keys())
  }

  currentVersion(): number {
    return this.current
  }

  keyFor(version: number): Buffer {
    const key = this.keys.get(version)
    if (!key) throw new Error(`PAYMENT_MASTER_KEYS: no key for version ${version}`)
    return key
  }
}

/** Used when PAYMENT_MASTER_KEYS is unset — the payments credential feature is disabled; any attempt
 * to encrypt/decrypt fails loudly rather than silently storing plaintext. */
export class NullMasterKeyProvider implements MasterKeyProvider {
  private fail(): never {
    throw new Error('Payment credentials are not configured (PAYMENT_MASTER_KEYS is unset).')
  }
  currentVersion(): number {
    return this.fail()
  }
  keyFor(): Buffer {
    return this.fail()
  }
}
