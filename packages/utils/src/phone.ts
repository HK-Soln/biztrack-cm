// Cameroonian phone number utilities
export function formatCMPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('237')) {
    return '+' + digits
  }
  if (digits.startsWith('6')) {
    return '+237' + digits
  }
  return phone
}

export function isMTNNumber(phone: string): boolean {
  const digits = phone.replace(/\D/g, '').replace(/^237/, '')
  return /^6[5-7]/.test(digits)
}

export function isOrangeNumber(phone: string): boolean {
  const digits = phone.replace(/\D/g, '').replace(/^237/, '')
  return /^6[8-9]/.test(digits)
}

export function detectMoMoOperator(phone: string): 'MTN' | 'ORANGE' | 'UNKNOWN' {
  if (isMTNNumber(phone)) return 'MTN'
  if (isOrangeNumber(phone)) return 'ORANGE'
  return 'UNKNOWN'
}
