import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, ILike, In, IsNull, Repository } from 'typeorm'
import { SerialUnitStatus } from '@biztrack/types'
import type { Logger, LogMetadata } from '@biztrack/logger'
import type {
  ListQuery,
  PaginatedResult,
  PreviewVariant,
  PreviewVariantsResponse,
  ProductAttributeSelection,
  ProductVariant as ProductVariantModel,
  VariantOverride,
} from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { AttributeGroup } from '@/entities/attribute-group.entity'
import { AttributeOption } from '@/entities/attribute-option.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement, MovementType } from '@/entities/inventory-movement.entity'
import { Product } from '@/entities/product.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import { ProductVariant } from '@/entities/product-variant.entity'
import { ProductVariantOption } from '@/entities/product-variant-option.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'

/** One attribute dimension: a group and the chosen options (in sort order). */
interface VariantDimension {
  group: AttributeGroup
  options: AttributeOption[]
}

@Injectable()
export class ProductVariantsService {
  constructor(
    @InjectRepository(AttributeGroup)
    private readonly groupsRepo: Repository<AttributeGroup>,
    @InjectRepository(AttributeOption)
    private readonly optionsRepo: Repository<AttributeOption>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepo: Repository<ProductVariant>,
    @InjectRepository(ProductVariantOption)
    private readonly variantOptionsRepo: Repository<ProductVariantOption>,
    @InjectRepository(InventoryLevel)
    private readonly inventoryLevelsRepo: Repository<InventoryLevel>,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('ProductVariantsService')
  }

  /**
   * Enriched, plain-object variants for a product detail response: each carries
   * its attribute options (with group name / colour) and its current stock.
   */
  async listVariantsForProduct(
    businessId: string,
    productId: string,
  ): Promise<ProductVariantModel[]> {
    const variants = await this.variantsRepo.find({
      where: { productId, businessId, deletedAt: IsNull() },
      order: { sortOrder: 'ASC' },
    })
    return this.hydrateVariants(businessId, productId, variants)
  }

  /** Paginated variants for the product-detail management section (server-side LIMIT/OFFSET
   * + COUNT so the client never receives the full list). */
  async listVariantsPageForProduct(
    businessId: string,
    productId: string,
    query: ListQuery,
  ): Promise<PaginatedResult<ProductVariantModel>> {
    const page = Math.max(query.page ?? 1, 1)
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
    const search = query.search?.trim()
    const base = { productId, businessId, deletedAt: IsNull() }
    // Search matches the variant name or its SKU (tile code).
    const where = search
      ? [
          { ...base, name: ILike(`%${search}%`) },
          { ...base, sku: ILike(`%${search}%`) },
        ]
      : base
    const [variants, total] = await this.variantsRepo.findAndCount({
      where,
      order: { sortOrder: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    })
    const data = await this.hydrateVariants(businessId, productId, variants)
    return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
  }

  /** Attach each variant's options (with group/option display data) and current stock. */
  private async hydrateVariants(
    businessId: string,
    productId: string,
    variants: ProductVariant[],
  ): Promise<ProductVariantModel[]> {
    if (variants.length === 0) {
      return []
    }

    const variantIds = variants.map((variant) => variant.id)
    const [links, levels] = await Promise.all([
      this.variantOptionsRepo.find({
        where: { variantId: In(variantIds), businessId, deletedAt: IsNull() },
      }),
      this.inventoryLevelsRepo.find({ where: { businessId, productId } }),
    ])

    const groupIds = [...new Set(links.map((link) => link.attributeGroupId))]
    const optionIds = [...new Set(links.map((link) => link.attributeOptionId))]
    const [groups, options] = await Promise.all([
      groupIds.length ? this.groupsRepo.find({ where: { id: In(groupIds), businessId } }) : [],
      optionIds.length ? this.optionsRepo.find({ where: { id: In(optionIds), businessId } }) : [],
    ])
    const groupById = new Map(groups.map((group) => [group.id, group]))
    const optionById = new Map(options.map((option) => [option.id, option]))
    const levelByVariant = new Map(
      levels.filter((level) => level.variantId).map((level) => [level.variantId as string, level]),
    )

    // For serialized products a variant's stock is the count of its IN_STOCK serial units
    // (inventory levels aren't the source of truth there), computed here so the client
    // never has to load every serial to count.
    const manager = this.inventoryLevelsRepo.manager
    const product = await manager
      .getRepository(Product)
      .findOne({ where: { id: productId, businessId }, select: ['id', 'isSerialized'] })
    const serialStock = new Map<string, number>()
    if (product?.isSerialized) {
      const rows = await manager
        .getRepository(ProductSerialUnit)
        .createQueryBuilder('su')
        .select('su.variantId', 'variantId')
        .addSelect('COUNT(*)', 'n')
        .where('su.businessId = :businessId', { businessId })
        .andWhere('su.productId = :productId', { productId })
        .andWhere('su.status = :status', { status: SerialUnitStatus.IN_STOCK })
        .andWhere('su.deletedAt IS NULL')
        .andWhere('su.variantId IS NOT NULL')
        .groupBy('su.variantId')
        .getRawMany<{ variantId: string; n: string }>()
      for (const r of rows) serialStock.set(r.variantId, Number(r.n))
    }
    const linksByVariant = new Map<string, typeof links>()
    for (const link of links) {
      const list = linksByVariant.get(link.variantId) ?? []
      list.push(link)
      linksByVariant.set(link.variantId, list)
    }

    return variants.map((variant) => {
      const level = levelByVariant.get(variant.id)
      const currentStock = product?.isSerialized
        ? (serialStock.get(variant.id) ?? 0)
        : (level?.quantity ?? 0)
      return {
        id: variant.id,
        businessId: variant.businessId,
        productId: variant.productId,
        name: variant.name,
        displayNameOverride: variant.displayNameOverride ?? null,
        priceOverride: variant.priceOverride ?? null,
        costPriceOverride: variant.costPriceOverride ?? null,
        sku: variant.sku ?? null,
        barcode: variant.barcode ?? null,
        isActive: variant.isActive,
        sortOrder: variant.sortOrder,
        options: (linksByVariant.get(variant.id) ?? []).map((link) => ({
          id: link.id,
          variantId: link.variantId,
          attributeGroupId: link.attributeGroupId,
          attributeOptionId: link.attributeOptionId,
          businessId: link.businessId,
          groupName: groupById.get(link.attributeGroupId)?.name,
          optionValue: optionById.get(link.attributeOptionId)?.value,
          colorHex: optionById.get(link.attributeOptionId)?.colorHex ?? null,
        })),
        currentStock,
        lowStockThreshold: level?.lowStockThreshold ?? null,
      }
    })
  }

  /**
   * Pure Cartesian product of the option lists, preserving dimension order.
   * Exposed for direct unit testing of the matrix maths.
   */
  buildCombinations(dimensions: VariantDimension[]): AttributeOption[][] {
    const active = dimensions.filter((dimension) => dimension.options.length > 0)
    if (active.length === 0) {
      return []
    }
    let combinations: AttributeOption[][] = [[]]
    for (const dimension of active) {
      combinations = combinations.flatMap((existing) =>
        dimension.options.map((option) => [...existing, option]),
      )
    }
    return combinations
  }

  /** Preview the variant matrix without persisting anything. */
  async previewVariantMatrix(
    businessId: string,
    selections: ProductAttributeSelection[],
    overrides: VariantOverride[] = [],
  ): Promise<PreviewVariantsResponse> {
    try {
      const dimensions = await this.loadDimensions(businessId, selections)
      return this.buildMatrix(dimensions, overrides)
    } catch (error) {
      return this.handleServiceError('previewVariantMatrix', error, { businessId })
    }
  }

  /**
   * Generate and persist variants for a product from attribute selections.
   * Runs inside the caller's transaction (manager).
   */
  async createVariantsFromAttributeSelections(
    manager: EntityManager,
    product: Product,
    selections: ProductAttributeSelection[],
    overrides: VariantOverride[] = [],
    businessId: string,
    userId: string,
  ): Promise<ProductVariant[]> {
    const dimensions = await this.loadDimensions(businessId, selections, manager)
    const combinations = this.buildCombinations(dimensions)
    const variantRepo = manager.getRepository(ProductVariant)
    const optionLinkRepo = manager.getRepository(ProductVariantOption)
    const inventoryRepo = manager.getRepository(InventoryLevel)
    const movementRepo = manager.getRepository(InventoryMovement)

    const created: ProductVariant[] = []
    for (let sortIdx = 0; sortIdx < combinations.length; sortIdx++) {
      const combo = combinations[sortIdx]!
      const override = this.findOverride(overrides, combo)
      if (override?.excluded) {
        continue
      }

      const autoName = combo.map((option) => option.value).join(' ')
      const variant = await variantRepo.save(
        variantRepo.create({
          businessId,
          productId: product.id,
          name: override?.nameOverride ?? autoName,
          displayNameOverride: override?.nameOverride ?? null,
          priceOverride: override?.priceOverride ?? null,
          costPriceOverride: override?.costPriceOverride ?? null,
          isActive: true,
          sortOrder: sortIdx,
        }),
      )

      await optionLinkRepo.save(
        combo.map((option, dimIdx) =>
          optionLinkRepo.create({
            variantId: variant.id,
            attributeGroupId: dimensions[dimIdx]!.group.id,
            attributeOptionId: option.id,
            businessId,
          }),
        ),
      )

      // Per-variant stock. Serialised variants derive stock from serial units.
      if (product.trackInventory && !product.isSerialized) {
        const quantity = override?.openingStock ?? 0
        await inventoryRepo.save(
          inventoryRepo.create({
            businessId,
            productId: product.id,
            variantId: variant.id,
            quantity,
            lowStockThreshold: null,
          }),
        )
        if (quantity > 0) {
          await movementRepo.save(
            movementRepo.create({
              businessId,
              productId: product.id,
              type: MovementType.OPENING_STOCK,
              quantityChange: quantity,
              quantityBefore: 0,
              quantityAfter: quantity,
              referenceType: 'product_variant',
              referenceId: variant.id,
              notes: 'Opening stock set during product creation',
              performedById: userId,
            }),
          )
        }
      }

      created.push(variant)
    }

    if (created.length < 2) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.variant_min_two'),
        'VARIANT_MIN_TWO',
      )
    }

    return created
  }

  // ---- internals ----------------------------------------------------------

  /** Load groups + their selected options, validated and ordered by sort order. */
  private async loadDimensions(
    businessId: string,
    selections: ProductAttributeSelection[],
    manager?: EntityManager,
  ): Promise<VariantDimension[]> {
    const groupRepo = manager ? manager.getRepository(AttributeGroup) : this.groupsRepo
    const optionRepo = manager ? manager.getRepository(AttributeOption) : this.optionsRepo

    const dimensions: VariantDimension[] = []
    for (const selection of selections) {
      if (!selection.selectedOptionIds || selection.selectedOptionIds.length === 0) {
        continue
      }
      const group = await groupRepo.findOne({
        where: { id: selection.attributeGroupId, businessId, deletedAt: IsNull() },
      })
      if (!group) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.attribute_group_not_found'),
          'ATTRIBUTE_GROUP_NOT_FOUND',
        )
      }
      const options = await optionRepo.find({
        where: {
          id: In(selection.selectedOptionIds),
          groupId: group.id,
          businessId,
          deletedAt: IsNull(),
        },
        order: { sortOrder: 'ASC', value: 'ASC' },
      })
      if (options.length !== selection.selectedOptionIds.length) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.attribute_option_not_found'),
          'ATTRIBUTE_OPTION_NOT_FOUND',
        )
      }
      dimensions.push({ group, options })
    }

    // Order dimensions by the group's sort order so names read consistently
    // (e.g. "Black 128GB", Color before Storage).
    dimensions.sort((a, b) => a.group.sortOrder - b.group.sortOrder)
    return dimensions
  }

  private buildMatrix(
    dimensions: VariantDimension[],
    overrides: VariantOverride[],
  ): PreviewVariantsResponse {
    const combinations = this.buildCombinations(dimensions)
    const groupById = new Map(dimensions.map((dimension) => [dimension.group.id, dimension.group]))

    const variants: PreviewVariant[] = combinations.map((combo) => {
      const override = this.findOverride(overrides, combo)
      const autoName = combo.map((option) => option.value).join(' ')
      return {
        name: override?.nameOverride ?? autoName,
        optionIds: combo.map((option) => option.id),
        attributes: combo.map((option) => {
          const group = groupById.get(option.groupId)
          return {
            groupId: option.groupId,
            groupName: group?.name ?? '',
            optionId: option.id,
            optionValue: option.value,
            colorHex: option.colorHex ?? null,
          }
        }),
        excluded: override?.excluded ?? false,
        priceOverride: override?.priceOverride ?? null,
        costPriceOverride: override?.costPriceOverride ?? null,
        openingStock: override?.openingStock ?? null,
      }
    })

    return { totalCombinations: combinations.length, variants }
  }

  /** Match an override to a combination by its (order-independent) option id set. */
  private findOverride(
    overrides: VariantOverride[],
    combo: AttributeOption[],
  ): VariantOverride | undefined {
    const key = combo
      .map((option) => option.id)
      .sort()
      .join('|')
    return overrides.find((override) => [...override.optionIds].sort().join('|') === key)
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('ProductVariantsService error', 'ProductVariantsService', {
        action,
        code: error.code,
        ...(metadata ?? {}),
      })
      throw error
    }
    this.logger.error('ProductVariantsService unexpected error', 'ProductVariantsService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })
    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'PRODUCT_VARIANTS_SERVICE_ERROR',
      { action },
    )
  }
}
