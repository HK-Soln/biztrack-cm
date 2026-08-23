import type { JwtPayload } from '@biztrack/types'

/** Decode a JWT payload (no signature verification — that's the API's job). */
export function decodeJwt(token: string): JwtPayload | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return JSON.parse(json) as JwtPayload
  } catch {
    return null
  }
}

/**
 * True when the token carries an `exp` claim that is already in the past. A token
 * with no decodable `exp` returns false (unknown → let the API be the authority).
 * Used on cold start so an expired session isn't restored into an empty dashboard.
 */
export function isJwtExpired(token: string, nowMs: number = Date.now()): boolean {
  const payload = decodeJwt(token) as (JwtPayload & { exp?: number }) | null
  if (!payload || typeof payload.exp !== 'number') return false
  return payload.exp * 1000 <= nowMs
}
