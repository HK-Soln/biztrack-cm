/// <reference types="jest" />
import { validateImei, validateSerialNumber } from '@biztrack/validators'

describe('validateImei (Luhn)', () => {
  it('accepts valid 15-digit Luhn IMEIs', () => {
    expect(validateImei('490154203237518')).toBe(true)
    expect(validateImei('356938035643809')).toBe(true)
  })

  it('rejects wrong-length or non-numeric input', () => {
    expect(validateImei('35693803564380')).toBe(false) // 14 digits
    expect(validateImei('3569380356438099')).toBe(false) // 16 digits
    expect(validateImei('49015420323751A')).toBe(false)
    expect(validateImei('')).toBe(false)
  })

  it('rejects a failed checksum', () => {
    expect(validateImei('490154203237519')).toBe(false)
  })
})

describe('validateSerialNumber', () => {
  it('validates IMEI via Luhn', () => {
    expect(validateSerialNumber('490154203237518', 'IMEI')).toBe(true)
    expect(validateSerialNumber('490154203237519', 'IMEI')).toBe(false)
  })

  it('validates SERIAL_NUMBER as alphanumeric up to 30 chars', () => {
    expect(validateSerialNumber('SN-12345_AB', 'SERIAL_NUMBER')).toBe(true)
    expect(validateSerialNumber('has spaces', 'SERIAL_NUMBER')).toBe(false)
    expect(validateSerialNumber('x'.repeat(31), 'SERIAL_NUMBER')).toBe(false)
  })

  it('validates BARCODE as any 1-30 char string', () => {
    expect(validateSerialNumber('012345678905', 'BARCODE')).toBe(true)
    expect(validateSerialNumber('', 'BARCODE')).toBe(false)
  })
})
