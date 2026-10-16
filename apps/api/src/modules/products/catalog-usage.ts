import { In, IsNull, type EntityManager } from 'typeorm'
import {
  checkAttributeOptionRemoval,
  checkModelRemoval,
  planAttributeGroupRemoval,
  planBrandRemoval,
} from '@biztrack/domain'
import { AttributeGroup } from '@/entities/attribute-group.entity'
import { AttributeOption } from '@/entities/attribute-option.entity'
import { BrandCategory } from '@/entities/brand-category.entity'
import { Brand } from '@/entities/brand.entity'
import { CategoryAttributeGroup } from '@/entities/category-attribute-group.entity'
import { Model } from '@/entities/model.entity'

// Loads what the brand, model and attribute removal rules in @biztrack/domain need, and
// saves the removal plan the domain returns (what goes, the brand's models and links, the
// attribute's options). The server's own endpoints and deletes arriving by sync from a
// till both use these (ruling R12); nothing here decides what is removed.

const liveProductsUsing = async (
  manager: EntityManager,
  column: 'brand_id' | 'model_id',
  businessId: string,
  id: string,
): Promise<number> => {
  const [row] = (await manager.query(
    `SELECT COUNT(*)::int AS n FROM products
      WHERE ${column} = $1 AND business_id = $2 AND deleted_at IS NULL`,
    [id, businessId],
  )) as Array<{ n: number }>
  return row?.n ?? 0
}

const liveVariantsUsing = async (
  manager: EntityManager,
  column: 'attribute_group_id' | 'attribute_option_id',
  businessId: string,
  id: string,
): Promise<number> => {
  const [row] = (await manager.query(
    `SELECT COUNT(*)::int AS n FROM product_variant_options pvo
       JOIN product_variants pv ON pv.id = pvo.variant_id
       JOIN products p ON p.id = pv.product_id
     WHERE pvo.${column} = $1 AND pvo.business_id = $2
       AND pvo.deleted_at IS NULL AND pv.deleted_at IS NULL AND p.deleted_at IS NULL`,
    [id, businessId],
  )) as Array<{ n: number }>
  return row?.n ?? 0
}

/** @biztrack/domain's plan for deleting a brand, from what is loaded here. */
export async function loadBrandRemovalPlan(
  manager: EntityManager,
  businessId: string,
  brandId: string,
) {
  const [models, links] = await Promise.all([
    manager.getRepository(Model).find({
      select: { id: true },
      where: { brandId, businessId, deletedAt: IsNull() },
    }),
    manager.getRepository(BrandCategory).find({
      select: { id: true },
      where: { brandId, businessId, deletedAt: IsNull() },
    }),
  ])
  return planBrandRemoval({
    brandId,
    productCount: await liveProductsUsing(manager, 'brand_id', businessId, brandId),
    modelIds: models.map((m) => m.id),
    categoryLinkIds: links.map((l) => l.id),
  })
}

export async function decideModelRemoval(
  manager: EntityManager,
  businessId: string,
  modelId: string,
) {
  return checkModelRemoval(await liveProductsUsing(manager, 'model_id', businessId, modelId))
}

/** @biztrack/domain's plan for deleting an attribute, from what is loaded here. */
export async function loadAttributeGroupRemovalPlan(
  manager: EntityManager,
  businessId: string,
  groupId: string,
) {
  const options = await manager.getRepository(AttributeOption).find({
    select: { id: true },
    where: { groupId, businessId, deletedAt: IsNull() },
  })
  return planAttributeGroupRemoval({
    groupId,
    variantUses: await liveVariantsUsing(manager, 'attribute_group_id', businessId, groupId),
    categoryLinks: await manager.getRepository(CategoryAttributeGroup).count({
      where: { attributeGroupId: groupId, businessId, deletedAt: IsNull() },
    }),
    optionIds: options.map((o) => o.id),
  })
}

export async function decideAttributeOptionRemoval(
  manager: EntityManager,
  businessId: string,
  optionId: string,
) {
  return checkAttributeOptionRemoval(
    await liveVariantsUsing(manager, 'attribute_option_id', businessId, optionId),
  )
}

/** Saves a brand removal plan. Run in a transaction. */
export async function applyBrandRemoval(
  manager: EntityManager,
  businessId: string,
  plan: { brandIds: string[]; modelIds: string[]; categoryLinkIds: string[] },
  at: Date,
): Promise<void> {
  if (plan.modelIds.length) {
    await manager
      .getRepository(Model)
      .update({ id: In(plan.modelIds), businessId }, { isActive: false, deletedAt: at })
  }
  if (plan.categoryLinkIds.length) {
    await manager
      .getRepository(BrandCategory)
      .update({ id: In(plan.categoryLinkIds), businessId }, { deletedAt: at })
  }
  await manager
    .getRepository(Brand)
    .update(
      { id: In(plan.brandIds), businessId },
      { isActive: false, deletedAt: at, updatedAt: at },
    )
}

/** Saves an attribute removal plan. Run in a transaction. */
export async function applyAttributeGroupRemoval(
  manager: EntityManager,
  businessId: string,
  plan: { groupIds: string[]; optionIds: string[] },
  at: Date,
): Promise<void> {
  await manager
    .getRepository(AttributeGroup)
    .update(
      { id: In(plan.groupIds), businessId },
      { isActive: false, deletedAt: at, updatedAt: at },
    )
  if (plan.optionIds.length) {
    await manager
      .getRepository(AttributeOption)
      .update({ id: In(plan.optionIds), businessId }, { isActive: false, deletedAt: at })
  }
}
