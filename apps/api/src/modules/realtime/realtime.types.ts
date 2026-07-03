/** The authenticated identity behind a realtime socket (from the ACCESS token only). */
export interface Principal {
  userId: string
  businessId: string | null
  role: string | null
  deviceId: string | null
  type: 'phase1' | 'phase2'
  /** Token expiry (unix seconds), used to drive re-auth before relying on stale claims. */
  exp: number | null
}

export type ParsedChannel =
  | { type: 'user'; userId: string }
  | { type: 'business'; businessId: string; topic?: string }
  | { type: 'device'; deviceId: string }
  | { type: 'unknown'; raw: string }

export function parseChannel(raw: string): ParsedChannel {
  const parts = raw.split(':')
  if (parts[0] === 'user' && parts[1]) return { type: 'user', userId: parts[1] }
  if (parts[0] === 'business' && parts[1]) return { type: 'business', businessId: parts[1], topic: parts[2] }
  if (parts[0] === 'device' && parts[1]) return { type: 'device', deviceId: parts[1] }
  return { type: 'unknown', raw }
}
