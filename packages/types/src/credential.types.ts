// BIZ-3.3 — member authorization credentials. "One ledger, many methods": a member may hold a
// PIN and/or one or more scannable cards; verification hashes the presented secret and looks for a
// live credential of the matching type. The secret hash never leaves the server/device boundary —
// these client-facing shapes deliberately omit it.

export enum MemberAuthCredentialType {
  PIN = 'PIN',
  CARD = 'CARD',
  // NFC is a future type — same model, new input source.
}

/** A credential as shown to the owner (never carries the secret hash). */
export interface MemberAuthCredential {
  id: string
  memberId: string
  userId: string
  type: MemberAuthCredentialType
  version: number
  /** Owner-facing label, e.g. "Sam's card". */
  label: string | null
  issuedById: string | null
  createdAt: string
  /** Non-null once revoked — a revoked credential can never authorize again. */
  revokedAt: string | null
}

/** Issue a scannable card for a member (owner-only). The server generates the token, stores only
 * its hash, and returns the one-time token so the client can render/print the QR — it is never
 * persisted in clear and never returned again. */
export interface IssueCardRequest {
  memberId: string
  label?: string | null
}

export interface IssueCardResponse {
  credential: MemberAuthCredential
  /** The one-time card token to encode in the QR. Shown once; only its hash is stored. */
  token: string
}
