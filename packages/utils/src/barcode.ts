export function generateSKU(name: string, id: string): string {
  const prefix = name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X')
  const suffix = id.replace(/-/g, '').substring(0, 6).toUpperCase()
  return `${prefix}-${suffix}`
}

export function isValidBarcode(barcode: string): boolean {
  // EAN-13, EAN-8, UPC-A, Code128
  return /^[0-9]{8,14}$/.test(barcode) || /^[A-Za-z0-9\-. $/+%]{1,48}$/.test(barcode)
}

export function generateReceiptNumber(businessId: string, timestamp: Date): string {
  const date = timestamp.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `RCP-${date}-${random}`
}
