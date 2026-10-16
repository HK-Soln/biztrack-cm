import { IsNull, type EntityManager } from 'typeorm'
import { categoryAcceptsProducts, checkCategoryRemoval, placeCategory } from '@biztrack/domain'
import { CategoryAttributeGroup } from '@/entities/category-attribute-group.entity'
import { ProductCategory } from '@/entities/product-category.entity'
import { Product } from '@/entities/product.entity'

// Loads what the category rules in @biztrack/domain need, for the server's own category
// endpoints and for categories and products arriving by sync from a till (ruling R12).
// The rules themselves are placeCategory, checkCategoryRemoval and categoryAcceptsProducts.

const childCount = (
  manager: EntityManager,
  businessId: string,
  parentId: string,
  activeOnly = false,
) =>
  manager.getRepository(ProductCategory).count({
    where: { businessId, parentId, deletedAt: IsNull(), ...(activeOnly ? { isActive: true } : {}) },
  })

const productCount = (manager: EntityManager, businessId: string, categoryId: string) =>
  manager.getRepository(Product).count({ where: { businessId, categoryId, deletedAt: IsNull() } })

/** Where a category may go, by @biztrack/domain's placeCategory. */
export async function decideCategoryPlacement(
  manager: EntityManager,
  input: {
    businessId: string
    selfId?: string | null
    currentParentId?: string | null
    nextParentId: string | null
  },
) {
  const { businessId, selfId, nextParentId } = input
  const parent = nextParentId
    ? await manager
        .getRepository(ProductCategory)
        .findOne({ where: { id: nextParentId, businessId, deletedAt: IsNull() } })
    : null
  return placeCategory({
    selfId,
    currentParentId: input.currentParentId ?? null,
    nextParentId,
    hasChildren: selfId ? (await childCount(manager, businessId, selfId)) > 0 : false,
    parent: parent
      ? {
          id: parent.id,
          depth: parent.depth,
          hasProducts: (await productCount(manager, businessId, parent.id)) > 0,
          hasVariantOptions:
            (await manager.getRepository(CategoryAttributeGroup).count({
              where: { businessId, categoryId: parent.id, deletedAt: IsNull() },
            })) > 0,
        }
      : null,
  })
}

/** Whether a category may be deleted, by @biztrack/domain's checkCategoryRemoval. */
export async function decideCategoryRemoval(
  manager: EntityManager,
  businessId: string,
  categoryId: string,
) {
  return checkCategoryRemoval({
    hasChildren: (await childCount(manager, businessId, categoryId)) > 0,
    productCount: await productCount(manager, businessId, categoryId),
  })
}

/** Whether products may go in a category: only one with no active sub-categories. */
export async function categoryTakesProducts(
  manager: EntityManager,
  businessId: string,
  categoryId: string,
): Promise<boolean> {
  return categoryAcceptsProducts(await childCount(manager, businessId, categoryId, true))
}
