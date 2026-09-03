import { randomBytes } from 'node:crypto'
import { credentialFingerprint, decryptCredential, encryptCredential } from '../envelope-crypto'

describe('envelope-crypto (AES-256-GCM, AAD = business_id)', () => {
  const key = randomBytes(32)
  const biz = 'biz-123'

  it('round-trips a credential set', () => {
    const plaintext = JSON.stringify({ secret_key: 'sk_test_abc', api_user: 'u1' })
    const blob = encryptCredential(plaintext, key, biz)
    expect(decryptCredential(blob, key, biz)).toBe(plaintext)
  })

  it('rejects a wrong AAD (a stolen row cannot be replayed under another tenant)', () => {
    const blob = encryptCredential('secret', key, biz)
    expect(() => decryptCredential(blob, key, 'other-biz')).toThrow()
  })

  it('rejects a wrong key', () => {
    const blob = encryptCredential('secret', key, biz)
    expect(() => decryptCredential(blob, randomBytes(32), biz)).toThrow()
  })

  it('rejects a tampered ciphertext (GCM auth tag)', () => {
    const blob = encryptCredential('secret', key, biz)
    blob[blob.length - 1] ^= 0xff
    expect(() => decryptCredential(blob, key, biz)).toThrow()
  })

  it('rejects a non-32-byte key', () => {
    expect(() => encryptCredential('x', randomBytes(16), biz)).toThrow()
  })

  it('fingerprint is stable and differs by content', () => {
    expect(credentialFingerprint('a')).toBe(credentialFingerprint('a'))
    expect(credentialFingerprint('a')).not.toBe(credentialFingerprint('b'))
  })
})
