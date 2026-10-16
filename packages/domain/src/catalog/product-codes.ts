// ---------------------------------------------------------------------------
// The codes a product carries: its SKU, made the same way on the server and on the till
// (ruling R17), and its barcode, which is any text the shop wants (R17) or, when the server
// makes one up, an internal 13-digit code derived from the SKU.
// ---------------------------------------------------------------------------

/** Letters and digits a generated SKU ends with; no 0/O or 1/I, which are easily misread. */
export const SKU_RANDOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Three letters from the category's slug, padded with X; GEN with no category. */
export function productSkuPrefix(categorySlug?: string | null): string {
  if (!categorySlug) return 'GEN'
  return categorySlug.replace(/-/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X')
}

/**
 * A new SKU: category prefix, the last six base-36 digits of the moment it is made, and
 * four random characters, e.g. `BEV-K3Z9QX-7HNC`. The caller supplies the moment and the
 * random characters (picked from SKU_RANDOM_ALPHABET) and retries on a clash.
 */
export function buildProductSku(input: {
  categorySlug?: string | null
  now: number
  random: string
}): string {
  const stamp = Math.floor(input.now).toString(36).toUpperCase().slice(-6)
  return `${productSkuPrefix(input.categorySlug)}-${stamp}-${input.random.toUpperCase()}`
}

/** A barcode as stored: any text, trimmed; none when blank. */
export function normalizeBarcode(raw: string | null | undefined): string | null {
  const value = raw?.trim()
  return value ? value : null
}

export type BarcodeKind = 'EAN13' | 'EAN8' | 'UPCA' | 'INTERNAL' | 'QR' | 'CODE128'

/** What kind of barcode a value looks like, for printing labels. Never a reason to refuse it. */
export function barcodeKind(value: string): BarcodeKind {
  if (/^\d{13}$/.test(value)) return value.startsWith('200') ? 'INTERNAL' : 'EAN13'
  if (/^\d{8}$/.test(value)) return 'EAN8'
  if (/^\d{12}$/.test(value)) return 'UPCA'
  if (/^https?:\/\//.test(value) || /\s/.test(value)) return 'QR'
  return 'CODE128'
}
