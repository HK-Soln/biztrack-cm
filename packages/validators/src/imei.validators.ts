/**
 * Serial-number validation for serialised inventory (Phase 3G).
 * IMEI uses the Luhn checksum over 15 digits.
 */

export type SerialType = 'IMEI' | 'SERIAL_NUMBER' | 'BARCODE'

/** Validate a 15-digit IMEI using the Luhn algorithm. */
export function validateImei(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false

  let sum = 0
  for (let i = 0; i < 15; i++) {
    let digit = Number.parseInt(imei[i] as string, 10)
    if (i % 2 === 1) {
      // Double every second digit (0-indexed from the left).
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

/** Validate a serial identifier according to its type. */
export function validateSerialNumber(serial: string, type: SerialType): boolean {
  switch (type) {
    case 'IMEI':
      return validateImei(serial)
    case 'SERIAL_NUMBER':
      return /^[A-Za-z0-9\-_]{1,30}$/.test(serial)
    case 'BARCODE':
      return serial.length >= 1 && serial.length <= 30
    default:
      return false
  }
}
