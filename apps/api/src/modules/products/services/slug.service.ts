import { Injectable } from '@nestjs/common'
import { slugify, uniqueSlug } from '@biztrack/domain'
import { ProductCategoriesRepository } from '../repositories/product-categories.repository'
import { ProductsRepository } from '../repositories/products.repository'

/**
 * Product and category slugs by @biztrack/domain's uniqueSlug, the rule the till uses too
 * (ruling R12): the name's slug, numbered from -2 when the business already has it.
 */
@Injectable()
export class SlugService {
  constructor(
    private readonly productsRepo: ProductsRepository,
    private readonly categoriesRepo: ProductCategoriesRepository,
  ) {}

  async generateProductSlug(name: string, businessId: string, excludeId?: string): Promise<string> {
    return this.ensureUnique(name, businessId, 'product', excludeId)
  }

  async generateCategorySlug(
    name: string,
    businessId: string,
    excludeId?: string,
  ): Promise<string> {
    return this.ensureUnique(name, businessId, 'category', excludeId)
  }

  private async ensureUnique(
    name: string,
    businessId: string,
    type: 'product' | 'category',
    excludeId?: string,
  ) {
    const base = slugify(name) || 'item'
    const repo = type === 'product' ? this.productsRepo : this.categoriesRepo
    // withDeleted: the unique index on (business_id, slug) covers soft-deleted rows, so a
    // slug still "owned" by a soft-deleted record counts as taken. A slug holds only
    // a-z, 0-9 and '-', so it needs no LIKE escaping.
    const qb = repo
      .createQueryBuilder('r')
      .withDeleted()
      .select('r.slug', 'slug')
      .where('r.business_id = :businessId', { businessId })
      .andWhere('(r.slug = :base OR r.slug LIKE :numbered)', { base, numbered: `${base}-%` })
    if (excludeId) qb.andWhere('r.id <> :excludeId', { excludeId })
    const rows = (await qb.getRawMany()) as Array<{ slug: string | null }>
    return uniqueSlug(
      name,
      rows.map((r) => r.slug).filter((s): s is string => !!s),
    )
  }
}
