import { IsNull, type EntityManager } from 'typeorm'
import {
  checkAttributeGroupRemoval,
  checkAttributeOptionRemoval,
  checkBrandRemoval,
  checkModelRemoval,
} from '@biztrack/domain'
import { AttributeGroup } from '@/entities/attribute-group.entity'
import { AttributeOption } from '@/entities/attribute-option.entity'
import { BrandCategory } from '@/entities/brand-category.entity'
import { Brand } from '@/entities/brand.entity'
import { CategoryAttributeGroup } from '@/entities/category-attribute-group.entity'
import { Model } from '@/entities/model.entity'

// Loads what the brand, model and attribute removal rules in @biztrack/domain need, and
// removes a brand or an attribute with what belongs to it. The server's own endpoints and
// deletes arriving by sync from a till both use these (ruling R12).

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

export async function decideBrandRemoval(
  manager: EntityManager,
  businessId: string,
  brandId: string,
) {
  return checkBrandRemoval(await liveProductsUsing(manager, 'brand_id', businessId, brandId))
}

export async function decideModelRemoval(
  manager: EntityManager,
  businessId: string,
  modelId: string,
) {
  return checkModelRemoval(await liveProductsUsing(manager, 'model_id', businessId, modelId))
}

export async function decideAttributeGroupRemoval(
  manager: EntityManager,
  businessId: string,
  groupId: string,
) {
  return checkAttributeGroupRemoval({
    variantUses: await liveVariantsUsing(manager, 'attribute_group_id', businessId, groupId),
    categoryLinks: await manager.getRepository(CategoryAttributeGroup).count({
      where: { attributeGroupId: groupId, businessId, deletedAt: IsNull() },
    }),
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

/** Deletes a brand with its models and its category links. Run in a transaction. */
export async function removeBrand(
  manager: EntityManager,
  businessId: string,
  brandId: string,
  at: Date,
): Promise<void> {
  await manager
    .getRepository(Model)
    .update({ brandId, businessId, deletedAt: IsNull() }, { isActive: false, deletedAt: at })
  await manager
    .getRepository(BrandCategory)
    .update({ brandId, businessId, deletedAt: IsNull() }, { deletedAt: at })
  await manager
    .getRepository(Brand)
    .update({ id: brandId, businessId }, { isActive: false, deletedAt: at, updatedAt: at })
}

/** Deletes an attribute with its options. Run in a transaction. */
export async function removeAttributeGroup(
  manager: EntityManager,
  businessId: string,
  groupId: string,
  at: Date,
): Promise<void> {
  await manager
    .getRepository(AttributeGroup)
    .update({ id: groupId, businessId }, { isActive: false, deletedAt: at, updatedAt: at })
  await manager
    .getRepository(AttributeOption)
    .update({ groupId, businessId, deletedAt: IsNull() }, { isActive: false, deletedAt: at })
}
