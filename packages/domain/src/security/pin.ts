// ---------------------------------------------------------------------------
// Manager-PIN strength rules (BIZ-3.1). The PIN is hashed on-device and its hash
// is distributed to every in-business device, so a weak PIN is trivially
// brute-forced offline. These rules reject the easily-guessable PINs; a future
// enhancement will additionally check a breach/compromised-credential service.
// Shared by the renderer (to guide the user) and the main process (to enforce).
// ---------------------------------------------------------------------------

/** Required PIN shape: exactly 6 digits. */
export const PIN_LENGTH = 6
const PIN_FORMAT = /^\d{6}$/

/** Why a PIN was rejected as too weak (null = strong enough). */
export type PinWeakness = 'FORMAT' | 'REPEATED' | 'SEQUENTIAL' | 'PATTERN' | 'COMMON'

// Well-known/predictable 6-digit PINs not already caught by the structural rules
// below (repeats, sequences, and repeating-group patterns are handled separately).
const COMMON_PINS = new Set(['159753', '147258', '789456', '456123', '135790', '102030'])

/** True when every adjacent digit steps by +1 (ascending) or −1 (descending). */
function isSequential(pin: string): boolean {
  let ascending = true
  let descending = true
  for (let i = 1; i < pin.length; i++) {
    const step = pin.charCodeAt(i) - pin.charCodeAt(i - 1)
    if (step !== 1) ascending = false
    if (step !== -1) descending = false
  }
  return ascending || descending
}

/** Low-entropy repeating group layouts: AABBCC (001122), ABABAB (010101), ABCABC (123123). */
function isRepeatingGroup(pin: string): boolean {
  return (
    /^(\d)\1(\d)\2(\d)\3$/.test(pin) || // AABBCC — 001122, 224466, 998877
    /^(\d)(\d)\1\2\1\2$/.test(pin) || // ABABAB — 010101, 696969
    /^(\d)(\d)(\d)\1\2\3$/.test(pin) // ABCABC — 123123, 456456
  )
}

/**
 * Classify a PIN's weakness, or return null if it passes all rules. Rejects:
 * non-6-digit input (FORMAT); any run of ≥3 identical digits e.g. 111xxx (REPEATED);
 * fully ascending/descending runs e.g. 123456 / 654321 (SEQUENTIAL); low-entropy
 * repeating-group layouts e.g. 001122 / 010101 / 123123 (PATTERN); and a small
 * blocklist of other well-known PINs (COMMON).
 */
export function pinWeakness(pin: string): PinWeakness | null {
  if (!PIN_FORMAT.test(pin)) return 'FORMAT'
  if (/(\d)\1\1/.test(pin)) return 'REPEATED'
  if (isSequential(pin)) return 'SEQUENTIAL'
  if (isRepeatingGroup(pin)) return 'PATTERN'
  if (COMMON_PINS.has(pin)) return 'COMMON'
  return null
}

/** True when the PIN is a well-formed 6 digits AND passes every weakness rule. */
export function isStrongPin(pin: string): boolean {
  return pinWeakness(pin) === null
}
