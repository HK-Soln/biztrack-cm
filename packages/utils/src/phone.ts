// Cameroonian phone number utilities.
//
// Mobile numbers are 9 national digits starting with 6 (6XXXXXXXX), optionally
// prefixed with the +237 / 237 country code. The network is decided by the 3-digit
// prefix (source: operator prefix allocations):
//
//   MTN      650–654, 670–679 (67X), 680–683
//   Orange   640, 655–659, 686–689, 690–699 (69X)
//   Camtel   620–629 (62X "Blue" mobile; 242/243 are legacy fixed/CDMA lines)
//   Nexttel  660–669 (66X)

export type CameroonNetwork = 'MTN' | 'ORANGE' | 'CAMTEL' | 'NEXTTEL'

/** Strip formatting + the +237/237 country code, returning the national digits
 * (ideally the 9-digit 6XXXXXXXX number). Does not enforce length. */
export function nationalCMDigits(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '') // replace non-digits with ''
  return digits.startsWith('237') ? digits.slice(3) : digits
}

/** Normalize to E.164 (+237XXXXXXXXX) when possible; otherwise returns the input. */
export function formatCMPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.startsWith('237')) return '+' + digits
  if (digits.startsWith('6')) return '+237' + digits
  return phone
}

// Each pattern is the full 9-digit national number (leading 6 + 8 digits).
const MTN_RE = /^6(5[0-4]|7\d|8[0-3])\d{6}$/
const ORANGE_RE = /^6(40|5[5-9]|8[6-9]|9\d)\d{6}$/
const CAMTEL_RE = /^6(2\d)\d{6}$/
const NEXTTEL_RE = /^6(6\d)\d{6}$/

/** Identify the network from a Cameroonian mobile number, or null if it is not a
 * valid CM mobile number. Accepts numbers with or without the +237 country code. */
export function getCameroonNetwork(phone: string): CameroonNetwork | null {
  const n = nationalCMDigits(phone)
  if (MTN_RE.test(n)) return 'MTN'
  if (ORANGE_RE.test(n)) return 'ORANGE'
  if (CAMTEL_RE.test(n)) return 'CAMTEL'
  if (NEXTTEL_RE.test(n)) return 'NEXTTEL'
  return null
}

/** True when `phone` is a valid Cameroonian mobile number on any network. */
export function isValidCMPhone(phone: string): boolean {
  return getCameroonNetwork(phone) !== null
}

export function isMTNNumber(phone: string): boolean {
  return getCameroonNetwork(phone) === 'MTN'
}

export function isOrangeNumber(phone: string): boolean {
  return getCameroonNetwork(phone) === 'ORANGE'
}

/** Mobile Money operator for a number. Only MTN MoMo and Orange Money exist as MoMo
 * rails today; Camtel/Nexttel (and invalid numbers) resolve to UNKNOWN. */
export function detectMoMoOperator(phone: string): 'MTN' | 'ORANGE' | 'UNKNOWN' {
  const net = getCameroonNetwork(phone)
  return net === 'MTN' || net === 'ORANGE' ? net : 'UNKNOWN'
}
