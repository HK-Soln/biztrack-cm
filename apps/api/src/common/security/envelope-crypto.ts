import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Spec 07 §10 — envelope encryption for payment-provider credentials. AES-256-GCM with a random IV
 * per encryption and the tenant's `business_id` as AAD, so a stolen ciphertext cannot be replayed
 * under another tenant. Stored blob layout: iv(12) || authTag(16) || ciphertext. The 32-byte key is
 * supplied by a MasterKeyProvider; the row records only the key_version used.
 *
 * Server-only. This file must never be imported by a client bundle (see the packages/payments and
 * sync-map guards) — provider secrets are reversible-use and must never reach a device.
 */

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32

/** Encrypt UTF-8 plaintext. `aad` MUST be the owning `business_id`. */
export function encryptCredential(plaintext: string, key: Buffer, aad: string): Buffer {
  if (key.length !== KEY_BYTES) throw new Error('envelope-crypto: key must be 32 bytes')
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext])
}

/** Decrypt a blob produced by {@link encryptCredential}. Throws if the tag/AAD don't verify. */
export function decryptCredential(blob: Buffer, key: Buffer, aad: string): string {
  if (key.length !== KEY_BYTES) throw new Error('envelope-crypto: key must be 32 bytes')
  if (blob.length < IV_BYTES + TAG_BYTES) throw new Error('envelope-crypto: ciphertext too short')
  const iv = blob.subarray(0, IV_BYTES)
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const ciphertext = blob.subarray(IV_BYTES + TAG_BYTES)
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES })
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

/** SHA-256 of the plaintext credential set — for change detection only, never for verification. */
export function credentialFingerprint(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex')
}
