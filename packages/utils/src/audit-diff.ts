/**
 * Audit diffing helpers (AUDIT_AND_EVENTS_SPEC §9.1).
 *
 * Introduced in Phase 3C for variant generation; consumed in full by the audit
 * module (Phase 3H). computeChanges() produces a minimal before/after snapshot:
 * full snapshot for CREATE/DELETE, only changed fields for UPDATE.
 */

export interface AuditChanges {
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

// Never persist these in an audit trail, regardless of which entity they came from.
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'pin',
  'pinHash',
  'pin_hash',
  'refreshToken',
  'refresh_token',
  'token',
  'secret',
  'otp',
])

/** Strip sensitive fields before a value is written to the audit log. */
export function sanitizeForAudit<T extends Record<string, unknown>>(
  value: T,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) {
      continue
    }
    result[key] = val
  }
  return result
}

/**
 * Compute the audit diff between two snapshots.
 * - both null  → null
 * - before null → CREATE (full after snapshot)
 * - after null  → DELETE (full before snapshot)
 * - both set    → UPDATE (only changed fields), or null when nothing changed
 */
export function computeChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): AuditChanges | null {
  if (!before && !after) return null

  const sanitized = {
    before: before ? sanitizeForAudit(before) : null,
    after: after ? sanitizeForAudit(after) : null,
  }

  if (!sanitized.before) return { before: null, after: sanitized.after }
  if (!sanitized.after) return { before: sanitized.before, after: null }

  const changed: AuditChanges = { before: {}, after: {} }
  const allKeys = new Set([
    ...Object.keys(sanitized.before),
    ...Object.keys(sanitized.after),
  ])

  let hasChanges = false
  for (const key of allKeys) {
    const beforeValue = sanitized.before[key]
    const afterValue = sanitized.after[key]
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      ;(changed.before as Record<string, unknown>)[key] = beforeValue
      ;(changed.after as Record<string, unknown>)[key] = afterValue
      hasChanges = true
    }
  }

  return hasChanges ? changed : null
}
