import type { ContactDuplicateDetails } from '@biztrack/types'

/**
 * The contact a new one matched by phone or email (CONTACT_DUPLICATE, ruling R16), read from
 * either build: the cloud API's error envelope (`response.data.error`), or the till's error,
 * whose message carries the code and the details as JSON (Electron passes only the message).
 */
export function readContactDuplicate(e: unknown): ContactDuplicateDetails | null {
  const error = (e as { response?: { data?: { error?: { code?: unknown; details?: unknown } } } })
    ?.response?.data?.error
  if (error?.code === 'CONTACT_DUPLICATE' && error.details && typeof error.details === 'object') {
    return error.details as ContactDuplicateDetails
  }
  const message = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  const match = message.match(/CONTACT_DUPLICATE (\{[\s\S]*\})/)
  if (!match) return null
  try {
    return JSON.parse(match[1] ?? '') as ContactDuplicateDetails
  } catch {
    return null
  }
}
