import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import {
  SerialUnitStatus,
  type AddProductVariantRequest,
  type AuditContext,
  type ListQuery,
  type PaginatedResult,
  type ProductVariant as ProductVariantModel,
  type RemoveProductVariantRequest,
  type UpdateProductVariantRequest,
} from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { AttributeOption } from '@/entities/attribute-option.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement, MovementType } from '@/entities/inventory-movement.entity'
import { Product } from '@/entities/product.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import { ProductVariant } from '@/entities/product-variant.entity'
import { ProductVariantOption } from '@/entities/product-variant-option.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { AuditService } from '@/modules/audit/audit.service'
import { ProductVariantsService } from './product-variants.service'

const sig = (optionIds: string[]): string => [...optionIds].sort().join('|')

/**
 * Granular, movement-based variant management (Phase 4). The variant SET is
 * catalog/structure, but each add/remove changes stock so it writes a movement:
 *  - add a variant (opening stock, non-serialised) → stock-in
 *  - remove a variant → write off its remaining stock (stock-out); for serialised
 *    products this also retires the variant's IN_STOCK serial units
 *  - edit a variant's name/price/sku/active → catalog change, NO movement
 * Every mutation is audited with the full actor context.
 */
@Injectable()
export class ProductVariantManagementService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepo: Repository<ProductVariant>,
    @InjectRepository(ProductVariantOption)
    private readonly variantOptionsRepo: Repository<ProductVariantOption>,
    @InjectRepository(AttributeOption)
    private readonly optionsRepo: Repository<AttributeOption>,
    private readonly dataSource: DataSource,
    private readonly variantsService: ProductVariantsService,
    private readonly auditService: AuditService,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('ProductVariantManagementService')
  }

  list(productId: string, businessId: string): Promise<ProductVariantModel[]> {
    return this.variantsService.listVariantsForProduct(businessId, productId)
  }

  listPaged(
    productId: string,
    businessId: string,
    query: ListQuery,
  ): Promise<PaginatedResult<ProductVariantModel>> {
    return this.variantsService.listVariantsPageForProduct(businessId, productId, query)
  }

  async addVariant(
    productId: string,
    businessId: string,
    dto: AddProductVariantRequest,
    context: AuditContext,
  ): Promise<ProductVariantModel> {
    try {
      const product = await this.requireProduct(productId, businessId)
      if (!dto.options?.length) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.variant_options_required'),
          'VARIANT_OPTIONS_REQUIRED',
        )
      }

      const existing = await this.variantsRepo.find({
        where: { productId, businessId, deletedAt: IsNull() },
      })
      if (existing.length) {
        const links = await this.variantOptionsRepo.find({
          where: { variantId: In(existing.map((v) => v.id)), businessId, deletedAt: IsNull() },
        })
        const sigsByVariant = new Map<string, string[]>()
        for (const link of links) {
          const list = sigsByVariant.get(link.variantId) ?? []
          list.push(link.attributeOptionId)
          sigsByVariant.set(link.variantId, list)
        }
        const taken = new Set([...sigsByVariant.values()].map((ids) => sig(ids)))
        if (taken.has(sig(dto.options.map((o) => o.attributeOptionId)))) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.variant_duplicate_combination'),
            'VARIANT_DUPLICATE_COMBINATION',
          )
        }
      }

      await this.assertSkuUnique(businessId, dto.sku?.trim() || null, null)

      let name = dto.name?.trim()
      if (!name) {
        const opts = await this.optionsRepo.find({
          where: { id: In(dto.options.map((o) => o.attributeOptionId)), businessId },
        })
        const valueById = new Map(opts.map((o) => [o.id, o.value]))
        name = dto.options.map((o) => valueById.get(o.attributeOptionId) ?? '?').join(' ')
      }

      const variantId = await this.dataSource.transaction(async (manager) => {
        const vRepo = manager.getRepository(ProductVariant)
        const olRepo = manager.getRepository(ProductVariantOption)
        const invRepo = manager.getRepository(InventoryLevel)

        const variant = await vRepo.save(
          vRepo.create({
            businessId,
            productId,
            name,
            displayNameOverride: dto.name?.trim() ?? null,
            priceOverride: dto.priceOverride ?? null,
            costPriceOverride: dto.costPriceOverride ?? null,
            sku: dto.sku?.trim() ?? null,
            isActive: dto.isActive ?? true,
            sortOrder: existing.length,
          }),
        )
        await olRepo.save(
          dto.options.map((o) =>
            olRepo.create({
              businessId,
              variantId: variant.id,
              attributeGroupId: o.attributeGroupId,
              attributeOptionId: o.attributeOptionId,
            }),
          ),
        )

        if (product.trackInventory && !product.isSerialized) {
          const quantity = dto.openingStock ?? 0
          await invRepo.save(
            invRepo.create({
              businessId,
              productId,
              variantId: variant.id,
              quantity,
              lowStockThreshold: null,
            }),
          )
          if (quantity > 0) {
            const before =
              (await this.productStockTotal(manager, businessId, productId, false)) - quantity
            await this.writeMovement(manager, businessId, productId, quantity, before, {
              referenceId: variant.id,
              notes: `Added variant "${name}" (+${quantity})`,
              performedById: context.actorId ?? null,
            })
          }
        }

        if (!product.hasVariants) {
          await manager.getRepository(Product).update({ id: productId }, { hasVariants: true })
        }
        return variant.id
      })

      this.auditService.log(context, {
        action: 'CREATE',
        entityType: 'product_variant',
        entityId: variantId,
        entityLabel: name,
        changes: { before: null, after: { productId, name, openingStock: dto.openingStock ?? 0 } },
      })

      return this.requireVariantModel(productId, businessId, variantId)
    } catch (error) {
      return this.handleServiceError('addVariant', error, { productId, businessId })
    }
  }

  async updateVariant(
    productId: string,
    variantId: string,
    businessId: string,
    dto: UpdateProductVariantRequest,
    context: AuditContext,
  ): Promise<ProductVariantModel> {
    try {
      await this.requireProduct(productId, businessId)
      const variant = await this.requireVariant(productId, variantId, businessId)

      if (dto.sku !== undefined) {
        await this.assertSkuUnique(businessId, dto.sku?.trim() || null, variantId)
      }

      const before = {
        name: variant.name,
        priceOverride: variant.priceOverride ?? null,
        costPriceOverride: variant.costPriceOverride ?? null,
        sku: variant.sku ?? null,
        isActive: variant.isActive,
      }
      await this.variantsRepo.update(
        { id: variantId },
        {
          name: dto.name?.trim() ?? variant.name,
          displayNameOverride:
            dto.name === undefined ? variant.displayNameOverride : (dto.name?.trim() ?? null),
          priceOverride:
            dto.priceOverride === undefined ? variant.priceOverride : (dto.priceOverride ?? null),
          costPriceOverride:
            dto.costPriceOverride === undefined
              ? variant.costPriceOverride
              : (dto.costPriceOverride ?? null),
          sku: dto.sku === undefined ? variant.sku : (dto.sku?.trim() ?? null),
          isActive: dto.isActive ?? variant.isActive,
        },
      )

      const updated = await this.requireVariantModel(productId, businessId, variantId)
      this.auditService.log(context, {
        action: 'UPDATE',
        entityType: 'product_variant',
        entityId: variantId,
        entityLabel: updated.name,
        changes: {
          before,
          after: {
            name: updated.name,
            priceOverride: updated.priceOverride ?? null,
            costPriceOverride: updated.costPriceOverride ?? null,
            sku: updated.sku ?? null,
            isActive: updated.isActive,
          },
        },
      })
      return updated
    } catch (error) {
      return this.handleServiceError('updateVariant', error, { productId, variantId, businessId })
    }
  }

  /**
   * The variant SKU doubles as the tile "code" and must resolve to exactly one variant, so it's
   * unique per business. Friendly guard on top of the partial unique index (also catches races
   * across products). No-op when sku is null.
   */
  private async assertSkuUnique(
    businessId: string,
    sku: string | null,
    excludeVariantId: string | null,
  ): Promise<void> {
    if (!sku) return
    const dup = await this.variantsRepo.findOne({
      where: { businessId, sku, deletedAt: IsNull() },
    })
    if (dup && dup.id !== excludeVariantId) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.variant_duplicate_sku', { args: { sku } }),
        'VARIANT_DUPLICATE_SKU',
      )
    }
  }

  async removeVariant(
    productId: string,
    variantId: string,
    businessId: string,
    dto: RemoveProductVariantRequest,
    context: AuditContext,
  ): Promise<void> {
    try {
      const product = await this.requireProduct(productId, businessId)
      const variant = await this.requireVariant(productId, variantId, businessId)
      const reason = dto.reason.trim()

      await this.dataSource.transaction(async (manager) => {
        const before = await this.productStockTotal(
          manager,
          businessId,
          productId,
          product.isSerialized,
        )
        let writeOff = 0

        if (product.isSerialized) {
          const serialRepo = manager.getRepository(ProductSerialUnit)
          const units = await serialRepo.find({
            where: { businessId, productId, variantId, status: SerialUnitStatus.IN_STOCK },
          })
          writeOff = units.length
          for (const unit of units) {
            await serialRepo.update(
              { id: unit.id },
              { status: SerialUnitStatus.DAMAGED, notes: reason },
            )
            await serialRepo.softDelete({ id: unit.id })
          }
        } else {
          const invRepo = manager.getRepository(InventoryLevel)
          const level = await invRepo.findOne({ where: { businessId, productId, variantId } })
          writeOff = level?.quantity ?? 0
          if (level) await invRepo.update({ id: level.id }, { quantity: 0 })
        }

        // Soft-delete the variant and its option links.
        await manager.getRepository(ProductVariantOption).softDelete({ variantId, businessId })
        await manager.getRepository(ProductVariant).softDelete({ id: variantId })

        if (writeOff > 0) {
          await this.writeMovement(manager, businessId, productId, -writeOff, before, {
            referenceId: variantId,
            notes: reason,
            performedById: context.actorId ?? null,
          })
        }

        const remaining = await manager
          .getRepository(ProductVariant)
          .count({ where: { productId, businessId, deletedAt: IsNull() } })
        if (remaining === 0) {
          await manager.getRepository(Product).update({ id: productId }, { hasVariants: false })
        }
      })

      this.auditService.log(context, {
        action: 'DELETE',
        entityType: 'product_variant',
        entityId: variantId,
        entityLabel: variant.name,
        changes: { before: { name: variant.name, removeReason: reason }, after: null },
      })
    } catch (error) {
      return this.handleServiceError('removeVariant', error, { productId, variantId, businessId })
    }
  }

  // ---- internals -----------------------------------------------------------

  /** Product-level stock balance: sum of variant levels, or count of IN_STOCK serials. */
  private async productStockTotal(
    manager: EntityManager,
    businessId: string,
    productId: string,
    serialized: boolean,
  ): Promise<number> {
    if (serialized) {
      return manager.getRepository(ProductSerialUnit).count({
        where: { businessId, productId, status: SerialUnitStatus.IN_STOCK },
      })
    }
    const row = await manager
      .getRepository(InventoryLevel)
      .createQueryBuilder('l')
      .select('COALESCE(SUM(l.quantity), 0)', 's')
      .where('l.business_id = :b AND l.product_id = :p AND l.variant_id IS NOT NULL', {
        b: businessId,
        p: productId,
      })
      .getRawOne<{ s: string }>()
    return Number(row?.s ?? 0)
  }

  /** Write a product-level movement; first ever positive change is OPENING_STOCK. */
  private async writeMovement(
    manager: EntityManager,
    businessId: string,
    productId: string,
    change: number,
    before: number,
    opts: { referenceId: string; notes: string; performedById: string | null },
  ): Promise<void> {
    const movementRepo = manager.getRepository(InventoryMovement)
    const hasHistory = (await movementRepo.count({ where: { businessId, productId } })) > 0
    const type =
      change > 0 && !hasHistory ? MovementType.OPENING_STOCK : MovementType.MANUAL_ADJUSTMENT
    await movementRepo.save(
      movementRepo.create({
        businessId,
        productId,
        type,
        quantityChange: change,
        quantityBefore: before,
        quantityAfter: before + change,
        referenceType: 'product_variant',
        referenceId: opts.referenceId,
        notes: opts.notes,
        performedById: opts.performedById,
      }),
    )
  }

  private async requireProduct(productId: string, businessId: string): Promise<Product> {
    const product = await this.productsRepo.findOne({ where: { id: productId, businessId } })
    if (!product) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.product_not_found'),
        'PRODUCT_NOT_FOUND',
      )
    }
    return product
  }

  private async requireVariant(
    productId: string,
    variantId: string,
    businessId: string,
  ): Promise<ProductVariant> {
    const variant = await this.variantsRepo.findOne({
      where: { id: variantId, productId, businessId, deletedAt: IsNull() },
    })
    if (!variant) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.variant_not_found'),
        'VARIANT_NOT_FOUND',
      )
    }
    return variant
  }

  private async requireVariantModel(
    productId: string,
    businessId: string,
    variantId: string,
  ): Promise<ProductVariantModel> {
    const all = await this.variantsService.listVariantsForProduct(businessId, productId)
    const found = all.find((v) => v.id === variantId)
    if (!found) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.variant_not_found'),
        'VARIANT_NOT_FOUND',
      )
    }
    return found
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('ProductVariantManagementService error', 'ProductVariantManagementService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }
    this.logger.error(
      'ProductVariantManagementService unexpected error',
      'ProductVariantManagementService',
      {
        action,
        message: error instanceof Error ? error.message : 'Unknown error',
        ...(metadata ?? {}),
      },
    )
    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'VARIANT_MANAGEMENT_SERVICE_ERROR',
      { action },
    )
  }
}
