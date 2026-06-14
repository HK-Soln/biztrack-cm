import { randomUUID } from 'crypto'
import { SecureStoreService } from '@biztrack/electron-core'

export interface StoredTokens {
  accessToken: string
  refreshToken: string
}

const TOKENS_KEY = 'auth.tokens'
const PASSWORD_HASH_KEY = 'auth.passwordHash'
const SYNC_CREDENTIAL_KEY = 'sync.deviceCredential'
const LAST_USER_KEY = 'auth.lastUserId'
const LAST_BUSINESS_KEY = 'auth.lastBusinessId'

/**
 * Encrypted token vault, main-process only. The renderer has no IPC path to these
 * — it only ever receives derived session status. Backed by Electron safeStorage.
 */
export class TokenStore {
  constructor(private readonly secure: SecureStoreService) {}

  getTokens(): StoredTokens | null {
    const raw = this.secure.get(TOKENS_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as StoredTokens
    } catch {
      return null
    }
  }

  setTokens(tokens: StoredTokens): void {
    this.secure.set(TOKENS_KEY, JSON.stringify(tokens))
  }

  clearTokens(): void {
    this.secure.delete(TOKENS_KEY)
    this.secure.delete(SYNC_CREDENTIAL_KEY)
  }

  getPasswordHash(): string | null {
    return this.secure.get(PASSWORD_HASH_KEY)
  }

  setPasswordHash(hash: string): void {
    this.secure.set(PASSWORD_HASH_KEY, hash)
  }

  getSyncCredential(): string | null {
    return this.secure.get(SYNC_CREDENTIAL_KEY)
  }

  setSyncCredential(value: string): void {
    this.secure.set(SYNC_CREDENTIAL_KEY, value)
  }

  getLastUserId(): string | null {
    return this.secure.get(LAST_USER_KEY)
  }

  getLastBusinessId(): string | null {
    return this.secure.get(LAST_BUSINESS_KEY)
  }

  setLastSession(userId: string | null, businessId: string | null): void {
    if (userId) this.secure.set(LAST_USER_KEY, userId)
    if (businessId) this.secure.set(LAST_BUSINESS_KEY, businessId)
  }

  /** Stable per-install device id (for sync token + audit headers). */
  ensureDeviceId(): string {
    const existing = this.secure.get(DEVICE_ID_KEY)
    if (existing) return existing
    const id = randomUUID()
    this.secure.set(DEVICE_ID_KEY, id)
    return id
  }
}

const DEVICE_ID_KEY = 'audit.device-id'
