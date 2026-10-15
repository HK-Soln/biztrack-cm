import { In, IsNull, type EntityManager } from 'typeorm'
import { SerialUnitStatus } from '@biztrack/types'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement, MovementType } from '@/entities/inventory-movement.entity'
import { ProductImage } from '@/entities/product-image.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import { ProductVariantOption } from '@/entities/product-variant-option.entity'
import { ProductVariant } from '@/entities/product-variant.entity'
import { Product } from '@/entities/product.entity'

// Removing catalog records and what they still hold in stock. One implementation for the
// API's own deletes and for deletes that arrive by sync from a till (ruling R18), so a
// product, variant or serial unit deleted on a till leaves the server's stock exactly as
// deleting it on the server would. Each runs inside the caller's transaction.

interface RemovalContext {
  businessId: string
  /** Who removed it; null when it came from a till with no user on the record. */
  actorId: string | null
  /** The trading day the stock write-off is booked on. */
  businessDate: string
  at: Date
}

async function writeOff(
  manager: EntityManager,
  ctx: RemovalContext,
  input: {
    productId: string
    variantId?: string | null
    quantity: number
    before: number
    referenceType: string
    referenceId: string
    notes: string
  },
): Promise<void> {
  if (!(input.quantity > 0)) return
  const repo = manager.getRepository(InventoryMovement)
  await repo.save(
    repo.create({
      businessId: ctx.businessId,
      productId: input.productId,
      ...(input.variantId ? { variantId: input.variantId } : {}),
      type: MovementType.MANUAL_ADJUSTMENT,
      quantityChange: -input.quantity,
      quantityBefore: input.before,
      quantityAfter: input.before - input.quantity,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      notes: input.notes,
      performedById: ctx.actorId,
      businessDate: ctx.businessDate,
    }),
  )
}

const inStockSerials = (manager: EntityManager, businessId: string, productId: string) =>
  manager.getRepository(ProductSerialUnit).count({
    where: { businessId, productId, status: SerialUnitStatus.IN_STOCK },
  })

/**
 * Delete a product: its variants, option links, serial units (as DAMAGED), images and stock
 * levels go with it, and whatever was still in stock is written off.
 */
export async function removeProduct(
  manager: EntityManager,
  ctx: RemovalContext,
  product: Pick<Product, 'id' | 'isSerialized'>,
): Promise<void> {
  const { businessId, at } = ctx
  const id = product.id
  let stockBefore = 0
  if (product.isSerialized) {
    stockBefore = await inStockSerials(manager, businessId, id)
    await manager
      .getRepository(ProductSerialUnit)
      .createQueryBuilder()
      .update()
      .set({ status: SerialUnitStatus.DAMAGED, deletedAt: at })
      .where('business_id = :businessId AND product_id = :id AND deleted_at IS NULL', {
        businessId,
        id,
      })
      .execute()
  } else {
    const row = await manager
      .getRepository(InventoryLevel)
      .createQueryBuilder('l')
      .select('COALESCE(SUM(l.quantity), 0)', 's')
      .where('l.business_id = :businessId AND l.product_id = :id', { businessId, id })
      .getRawOne<{ s: string }>()
    stockBefore = Number(row?.s ?? 0)
  }

  const variantRepo = manager.getRepository(ProductVariant)
  const variants = await variantRepo.find({
    where: { productId: id, businessId, deletedAt: IsNull() },
  })
  if (variants.length) {
    await manager
      .getRepository(ProductVariantOption)
      .softDelete({ variantId: In(variants.map((v) => v.id)), businessId })
    await variantRepo.update(
      { productId: id, businessId, deletedAt: IsNull() },
      { isActive: false, deletedAt: at },
    )
  }
  await manager
    .getRepository(InventoryLevel)
    .update({ productId: id, businessId }, { quantity: 0, updatedAt: at })
  await manager.getRepository(ProductImage).delete({ productId: id })

  await writeOff(manager, ctx, {
    productId: id,
    quantity: stockBefore,
    before: stockBefore,
    referenceType: 'product',
    referenceId: id,
    notes: 'Product deleted',
  })
  await manager.getRepository(Product).update(id, { isActive: false, deletedAt: at, updatedAt: at })
}

/**
 * Remove one variant: its stock is written off (serial units become DAMAGED), it and its
 * option links are deleted, and a product left with no variants stops being a variant
 * product.
 */
export async function removeVariant(
  manager: EntityManager,
  ctx: RemovalContext,
  input: { product: Pick<Product, 'id' | 'isSerialized'>; variantId: string; reason: string },
): Promise<void> {
  const { businessId } = ctx
  const productId = input.product.id
  const { variantId, reason } = input
  let before: number
  let quantity: number

  if (input.product.isSerialized) {
    before = await inStockSerials(manager, businessId, productId)
    const serialRepo = manager.getRepository(ProductSerialUnit)
    const units = await serialRepo.find({
      where: { businessId, productId, variantId, status: SerialUnitStatus.IN_STOCK },
    })
    quantity = units.length
    for (const unit of units) {
      await serialRepo.update({ id: unit.id }, { status: SerialUnitStatus.DAMAGED, notes: reason })
      await serialRepo.softDelete({ id: unit.id })
    }
  } else {
    const levels = manager.getRepository(InventoryLevel)
    const row = await levels
      .createQueryBuilder('l')
      .select('COALESCE(SUM(l.quantity), 0)', 's')
      .where('l.business_id = :b AND l.product_id = :p AND l.variant_id IS NOT NULL', {
        b: businessId,
        p: productId,
      })
      .getRawOne<{ s: string }>()
    before = Number(row?.s ?? 0)
    const level = await levels.findOne({ where: { businessId, productId, variantId } })
    quantity = level?.quantity ?? 0
    if (level) await levels.update({ id: level.id }, { quantity: 0 })
  }

  await manager.getRepository(ProductVariantOption).softDelete({ variantId, businessId })
  await manager.getRepository(ProductVariant).softDelete({ id: variantId })
  await writeOff(manager, ctx, {
    productId,
    quantity,
    before,
    referenceType: 'product_variant',
    referenceId: variantId,
    notes: reason,
  })

  const remaining = await manager
    .getRepository(ProductVariant)
    .count({ where: { productId, businessId, deletedAt: IsNull() } })
  if (remaining === 0) {
    await manager.getRepository(Product).update({ id: productId }, { hasVariants: false })
  }
}

/** Retire one in-stock serial unit: it becomes DAMAGED and is deleted, a stock-out of one. */
export async function retireSerialUnit(
  manager: EntityManager,
  ctx: RemovalContext,
  unit: Pick<ProductSerialUnit, 'id' | 'productId' | 'variantId'>,
  reason: string,
): Promise<void> {
  const serialRepo = manager.getRepository(ProductSerialUnit)
  const before = await inStockSerials(manager, ctx.businessId, unit.productId)
  await serialRepo.update({ id: unit.id }, { status: SerialUnitStatus.DAMAGED, notes: reason })
  await serialRepo.softDelete({ id: unit.id })
  await writeOff(manager, ctx, {
    productId: unit.productId,
    variantId: unit.variantId ?? null,
    quantity: 1,
    before,
    referenceType: 'serial_unit',
    referenceId: unit.id,
    notes: reason,
  })
}
