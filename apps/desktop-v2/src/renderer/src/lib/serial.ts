import { validateImei, validateSerialNumber } from '@biztrack/domain'
import type { SerialType } from '@shared/ipc'

// Serial-number validation is @biztrack/domain's (validateSerialNumber), the rule the till
// and the server apply when the units are saved. Shared by the create wizard and the Manage
// serial units panel.

export const SERIAL_TYPES: SerialType[] = ['IMEI', 'SERIAL_NUMBER', 'BARCODE']

export { validateImei }

export function validateSerial(serial: string, type: SerialType): boolean {
  return validateSerialNumber(serial, type)
}
