/// <reference types="jest" />
import { SlugService } from '../services/slug.service'
import type { ProductsRepository } from '../repositories/products.repository'
import type { ProductCategoriesRepository } from '../repositories/product-categories.repository'

// The unique index on (business_id, slug) covers soft-deleted rows, so slug uniqueness must be
// checked with `withDeleted: true` — otherwise a base slug still held by a soft-deleted product
// looks free, gets handed back, and the INSERT/UPDATE fails with a duplicate-key violation.
const makeService = (taken: Set<string>) => {
  const qb = {
    withDeleted: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(async () => [...taken].map((slug) => ({ slug }))),
  }
  const productsRepo = { createQueryBuilder: jest.fn(() => qb) } as unknown as ProductsRepository
  const categoriesRepo = {
    createQueryBuilder: jest.fn(() => qb),
  } as unknown as ProductCategoriesRepository
  return { svc: new SlugService(productsRepo, categoriesRepo), withDeleted: qb.withDeleted }
}

describe('SlugService — product slug uniqueness', () => {
  it('returns the base slug when nothing holds it', async () => {
    const { svc } = makeService(new Set())
    await expect(svc.generateProductSlug('Blue Widget', 'biz')).resolves.toBe('blue-widget')
  })

  it('appends a suffix when the base slug is taken — including by soft-deleted rows', async () => {
    const { svc, withDeleted } = makeService(new Set(['widget']))
    await expect(svc.generateProductSlug('Widget', 'biz')).resolves.toBe('widget-2')
    expect(withDeleted).toHaveBeenCalled()
  })

  it('keeps climbing suffixes until a free slug is found', async () => {
    const { svc } = makeService(new Set(['widget', 'widget-2']))
    await expect(svc.generateProductSlug('Widget', 'biz')).resolves.toBe('widget-3')
  })
})
