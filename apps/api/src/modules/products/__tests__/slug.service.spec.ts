/// <reference types="jest" />
import { SlugService } from '../services/slug.service'
import type { ProductsRepository } from '../repositories/products.repository'
import type { ProductCategoriesRepository } from '../repositories/product-categories.repository'

// The unique index on (business_id, slug) covers soft-deleted rows, so slug uniqueness must be
// checked with `withDeleted: true` — otherwise a base slug still held by a soft-deleted product
// looks free, gets handed back, and the INSERT/UPDATE fails with a duplicate-key violation.
const makeService = (taken: Set<string>) => {
  const findOne = jest.fn(async (opts: { where: { slug: string }; withDeleted?: boolean }) => {
    // Every uniqueness probe must include soft-deleted rows.
    expect(opts.withDeleted).toBe(true)
    return taken.has(opts.where.slug) ? { id: 'other', slug: opts.where.slug } : null
  })
  const productsRepo = { findOne } as unknown as ProductsRepository
  const categoriesRepo = {
    findOne: jest.fn(async () => null),
  } as unknown as ProductCategoriesRepository
  return { svc: new SlugService(productsRepo, categoriesRepo), findOne }
}

describe('SlugService — product slug uniqueness', () => {
  it('returns the base slug when nothing holds it', async () => {
    const { svc } = makeService(new Set())
    await expect(svc.generateProductSlug('Blue Widget', 'biz')).resolves.toBe('blue-widget')
  })

  it('appends a suffix when the base slug is taken — including by soft-deleted rows', async () => {
    const { svc, findOne } = makeService(new Set(['widget']))
    await expect(svc.generateProductSlug('Widget', 'biz')).resolves.toBe('widget-2')
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ withDeleted: true }))
  })

  it('keeps climbing suffixes until a free slug is found', async () => {
    const { svc } = makeService(new Set(['widget', 'widget-2']))
    await expect(svc.generateProductSlug('Widget', 'biz')).resolves.toBe('widget-3')
  })
})
