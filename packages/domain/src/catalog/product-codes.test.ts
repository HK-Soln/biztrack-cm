import { describe, expect, it } from 'vitest'
import {
  barcodeKind,
  buildProductSku,
  internalBarcodeFromSku,
  normalizeBarcode,
  productSkuPrefix,
} from './product-codes'

describe('product SKU generation', () => {
  it('takes three letters from the category, GEN without one', () => {
    expect(productSkuPrefix('soft-drinks')).toBe('SOF')
    expect(productSkuPrefix('tv')).toBe('TVX')
    expect(productSkuPrefix(null)).toBe('GEN')
  })

  it('builds prefix, time stamp and the random part', () => {
    const now = Date.parse('2026-10-16T10:00:00.000Z')
    const sku = buildProductSku({ categorySlug: 'soft-drinks', now, random: 'ab7c' })
    expect(sku).toBe(`SOF-${now.toString(36).toUpperCase().slice(-6)}-AB7C`)
    expect(sku).toMatch(/^[A-Z0-9-]+$/)
  })
})

describe('barcodes', () => {
  it('takes any text, trimmed, and none when blank', () => {
    expect(normalizeBarcode('  ABC 123  ')).toBe('ABC 123')
    expect(normalizeBarcode('   ')).toBeNull()
    expect(normalizeBarcode(undefined)).toBeNull()
  })

  it('tells the kind for labels', () => {
    expect(barcodeKind('4006381333931')).toBe('EAN13')
    expect(barcodeKind('2001234567893')).toBe('INTERNAL')
    expect(barcodeKind('96385074')).toBe('EAN8')
    expect(barcodeKind('036000291452')).toBe('UPCA')
    expect(barcodeKind('https://x.test/p')).toBe('QR')
    expect(barcodeKind('SHELF-12')).toBe('CODE128')
  })

  it('makes an internal 13-digit code from a SKU, the same every time', () => {
    const code = internalBarcodeFromSku('SOF-K3Z9QX-AB7C')
    expect(code).toMatch(/^200\d{10}$/)
    expect(internalBarcodeFromSku('SOF-K3Z9QX-AB7C')).toBe(code)
  })
})
