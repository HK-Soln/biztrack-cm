import type { SerialType } from '@shared/ipc'

// Serial-number validation, mirrors @biztrack/validators (which isn't a renderer
// dependency). Shared by the create wizard and the Manage serial units panel.

export const SERIAL_TYPES: SerialType[] = ['IMEI', 'SERIAL_NUMBER', 'BARCODE']

/** IMEI = 15 digits passing the Luhn checksum. */
export function validateImei(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false
  let sum = 0
  for (let i = 0; i < 15; i++) {
    let digit = Number.parseInt(imei[i]!, 10)
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

export function validateSerial(serial: string, type: SerialType): boolean {
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
