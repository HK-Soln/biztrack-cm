import { describe, expect, it } from 'vitest'
import { slugify, uniqueSlug } from './slug'

describe('slugify', () => {
  it('drops accents and punctuation, joins words with -', () => {
    expect(slugify(' Kémi Stores ')).toBe('kemi-stores')
    expect(slugify('Café/Bar')).toBe('cafebar')
    expect(slugify('T-Shirt & Co')).toBe('t-shirt-co')
  })
})

describe('uniqueSlug', () => {
  it('takes the plain slug when it is free', () => {
    expect(uniqueSlug('Rice 5kg', [])).toBe('rice-5kg')
  })

  it('numbers it from 2 when it is taken', () => {
    expect(uniqueSlug('Rice', ['rice'])).toBe('rice-2')
    expect(uniqueSlug('Rice', ['rice', 'rice-2', 'rice-3'])).toBe('rice-4')
  })

  it('falls back when the name gives no slug', () => {
    expect(uniqueSlug('***', [])).toBe('item')
    expect(uniqueSlug('***', ['item'], 'item')).toBe('item-2')
  })
})
