import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import {
  deriveProductTypeFlags,
  inferProductType,
  ProductType,
  SerialUnitStatus,
  type AuditContext,
  type AssignBarcodeRequest,
  type CreateProductRequest,
  type PreviewVariantsRequest,
  type PreviewVariantsResponse,
  type ProductsQuery,
  type UpdateProductRequest,
} from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { DataSource, In, IsNull, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { Business } from '@/entities/business.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement, MovementType } from '@/entities/inventory-movement.entity'
import { Product } from '@/entities/product.entity'
import { ProductBundleComponent } from '@/entities/product-bundle-component.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import { ProductVariant } from '@/entities/product-variant.entity'
import { ProductVariantOption } from '@/entities/product-variant-option.entity'
import { ProductImage } from '@/entities/product-image.entity'
import { UnitOfMeasure } from '@/entities/unit-of-measure.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { ProductCategoriesRepository } from '../repositories/product-categories.repository'
import { ProductsRepository } from '../repositories/products.repository'
import { computeChanges, sanitizeForAudit } from '@biztrack/utils'
import { AuditService } from '@/modules/audit/audit.service'
import { BarcodeService } from './barcode.service'
import { ProductVariantsService } from './product-variants.service'
import { QuotaService } from '@/modules/permissions/quota.service'
import { SlugService } from './slug.service'
import { SkuService } from './sku.service'
import {
  stockExpr,
  costExpr,
  priceExpr,
  displayPriceExpr,
  thresholdExpr,
  round2,
  type ProductStats,
} from '@/common/stats/stock-stats'

@Injectable()
export class ProductsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly productsRepo: ProductsRepository,
    private readonly categoriesRepo: ProductCategoriesRepository,
    @InjectRepository(Business)
    private readonly businessesRepo: Repository<Business>,
    @InjectRepository(UnitOfMeasure)
    private readonly unitsRepo: Repository<UnitOfMeasure>,
    @InjectRepository(InventoryLevel)
    private readonly inventoryLevelsRepo: Repository<InventoryLevel>,
    @InjectRepository(ProductImage)
    private readonly imagesRepo: Repository<ProductImage>,
    @InjectRepository(ProductBundleComponent)
    private readonly bundleComponentsRepo: Repository<ProductBundleComponent>,
    @InjectRepository(ProductSerialUnit)
    private readonly serialUnitsRepo: Repository<ProductSerialUnit>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepo: Repository<ProductVariant>,
    private readonly slugService: SlugService,
    private readonly skuService: SkuService,
    private readonly barcodeService: BarcodeService,
    private readonly variantsService: ProductVariantsService,
    private readonly auditService: AuditService,
    private readonly quotaService: QuotaService,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('ProductsService')
  }

  /** Preview the variant matrix for a set of attribute selections (no writes). */
  async previewVariants(
    businessId: string,
    dto: PreviewVariantsRequest,
  ): Promise<PreviewVariantsResponse> {
    return this.variantsService.previewVariantMatrix(
      businessId,
      dto.attributeSelections,
      dto.variantOverrides ?? [],
    )
  }

  async create(
    businessId: string,
    userId: string,
    dto: CreateProductRequest,
    context?: AuditContext,
  ) {
    try {
      // Count-based gating lives in the owning service, not only in guards,
      // because only the service can tell whether this write would consume a
      // new quota slot.
      await this.quotaService.assertWithinQuota(businessId, 'products')

      const [business, category, unitOfMeasure] = await Promise.all([
        this.findBusiness(businessId),
        dto.categoryId ? this.findCategory(dto.categoryId, businessId) : Promise.resolve(null),
        this.findUnitOfMeasure(dto.unitOfMeasureId, businessId),
      ])

      const slug = await this.slugService.generateProductSlug(dto.name, businessId)
      const sku = dto.sku
        ? await this.skuService.validateAndNormalize(businessId, dto.sku)
        : await this.skuService.generate(businessId, category?.slug)
      const barcode = dto.barcode
        ? await this.barcodeService.validateAndNormalize(businessId, dto.barcode)
        : this.barcodeService.generateFromSKU(sku)

      // productType is authoritative; isService/trackInventory are derived from it.
      // Legacy clients that send only isService get a best-effort classification.
      const productType = dto.productType ?? inferProductType(dto.isService)
      const { isService, trackInventory } = deriveProductTypeFlags(productType, dto.trackInventory)

      // Variants are driven by attribute selections (Phase 3C). A selection only
      // counts when it has at least one chosen option.
      const wantsVariants = (dto.attributeSelections ?? []).some(
        (selection) => (selection.selectedOptionIds?.length ?? 0) > 0,
      )
      const variantsAllowed =
        productType === ProductType.SIMPLE || productType === ProductType.VARIABLE_QUANTITY
      if (wantsVariants && !variantsAllowed) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.variants_not_supported'),
          'VARIANTS_NOT_SUPPORTED',
        )
      }
      const hasVariants = wantsVariants && variantsAllowed

      // Composite (bundle) products (Phase 3F) — validate components up front.
      const isComposite = productType === ProductType.COMPOSITE
      const bundleComponents = dto.bundleComponents ?? []
      if (isComposite) {
        if (bundleComponents.length === 0) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.bundle_components_required'),
            'BUNDLE_COMPONENTS_REQUIRED',
          )
        }
        const componentIds = [...new Set(bundleComponents.map((c) => c.componentProductId))]
        const componentProducts = await this.productsRepo.find({
          where: { id: In(componentIds), businessId, deletedAt: IsNull() },
        })
        if (componentProducts.length !== componentIds.length) {
          throw new AppNotFoundException(
            await this.i18n.translate('errors.product_not_found'),
            'PRODUCT_NOT_FOUND',
          )
        }
        // A bundle cannot contain another bundle.
        if (componentProducts.some((c) => c.productType === ProductType.COMPOSITE)) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.bundle_component_nested'),
            'BUNDLE_COMPONENT_NESTED',
          )
        }
      }

      // Serialised inventory (Phase 3G) — only valid for SIMPLE products.
      const isSerialized = dto.isSerialized === true
      if (isSerialized) {
        if (productType !== ProductType.SIMPLE) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.serialized_only_simple'),
            'SERIALIZED_ONLY_SIMPLE',
          )
        }
        if (!dto.serialType) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.serial_type_required'),
            'SERIAL_TYPE_REQUIRED',
          )
        }
      }

      const product = await this.dataSource.transaction(async (manager) => {
        const created = await manager.getRepository(Product).save(
          manager.getRepository(Product).create({
            businessId,
            categoryId: category?.id ?? null,
            unitOfMeasureId: unitOfMeasure.id,
            name: dto.name.trim(),
            slug,
            description: dto.description?.trim() ?? null,
            sku,
            barcode: barcode.value,
            barcodeType: barcode.type,
            isBarcodeGenerated: barcode.isGenerated,
            sellingPrice: dto.sellingPrice,
            costPrice: dto.costPrice ?? null,
            currency: business.currency,
            taxRate: dto.taxRate ?? 0,
            isActive: dto.isActive ?? true,
            productType,
            isService,
            trackInventory,
            hasVariants,
            isSerialized,
            serialType: isSerialized ? (dto.serialType ?? null) : null,
            warrantyMonths: dto.warrantyMonths ?? null,
            imageUrl: dto.imageUrl?.trim() ?? null,
            createdById: userId,
          }),
        )

        if (hasVariants) {
          // Stock lives per-variant; no product-level inventory_level row.
          await this.variantsService.createVariantsFromAttributeSelections(
            manager,
            created,
            dto.attributeSelections!,
            dto.variantOverrides ?? [],
            businessId,
            userId,
          )
        } else if (isComposite) {
          // No stock of its own — selling deducts components.
          const componentRepo = manager.getRepository(ProductBundleComponent)
          await componentRepo.save(
            bundleComponents.map((component, index) =>
              componentRepo.create({
                businessId,
                bundleProductId: created.id,
                componentProductId: component.componentProductId,
                quantity: component.quantity,
                sortOrder: component.sortOrder ?? index,
              }),
            ),
          )
        } else if (trackInventory && !isSerialized) {
          // Serialised products derive stock from IN_STOCK serial units — no level row.
          const quantity = dto.openingStock ?? 0
          await manager.getRepository(InventoryLevel).save(
            manager.getRepository(InventoryLevel).create({
              businessId,
              productId: created.id,
              quantity,
              lowStockThreshold: dto.lowStockThreshold ?? null,
            }),
          )

          if (quantity > 0) {
            await manager.getRepository(InventoryMovement).save(
              manager.getRepository(InventoryMovement).create({
                businessId,
                productId: created.id,
                type: MovementType.OPENING_STOCK,
                quantityChange: quantity,
                quantityBefore: 0,
                quantityAfter: quantity,
                referenceType: 'product',
                referenceId: created.id,
                notes: 'Opening stock set during product creation',
                performedById: userId,
              }),
            )
          }
        }

        return created
      })

      const result = await this.findById(product.id, businessId)
      if (context) {
        this.auditService.log(context, {
          action: 'CREATE',
          entityType: 'product',
          entityId: product.id,
          entityLabel: product.name,
          changes: { before: null, after: sanitizeForAudit({ ...product }) },
        })
      }
      return result
    } catch (error) {
      return this.handleServiceError('create', error, { businessId, userId, name: dto.name })
    }
  }

  async findAll(
    businessId: string,
    query: ProductsQuery & { brandId?: string; stockStatus?: 'in' | 'low' | 'out' },
  ) {
    try {
      const qb = this.productsRepo
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('product.unitOfMeasure', 'unitOfMeasure')
        .where('product.business_id = :businessId', { businessId })
        .andWhere('product.deleted_at IS NULL')

      // Apply filters
      if (query.categoryId) {
        qb.andWhere('product.category_id = :categoryId', { categoryId: query.categoryId })
      }

      if (query.isActive !== undefined) {
        qb.andWhere('product.is_active = :isActive', { isActive: query.isActive })
      }

      if (query.isService !== undefined) {
        qb.andWhere('product.is_service = :isService', { isService: query.isService })
      }

      if (query.trackInventory !== undefined) {
        qb.andWhere('product.track_inventory = :trackInventory', {
          trackInventory: query.trackInventory,
        })
      }

      if (query.brandId) {
        qb.andWhere('product.brand_id = :brandId', { brandId: query.brandId })
      }

      // Effective-stock status filter (variant/serial-aware), mirroring the desktop.
      if (query.stockStatus) {
        const stock = stockExpr('product')
        const thr = thresholdExpr('product')
        if (query.stockStatus === 'out') {
          qb.andWhere(`product.track_inventory = true AND ${stock} <= 0`)
        } else if (query.stockStatus === 'low') {
          qb.andWhere(
            `product.track_inventory = true AND ${stock} > 0 AND ${thr} > 0 AND ${stock} <= ${thr}`,
          )
        } else if (query.stockStatus === 'in') {
          qb.andWhere(
            `product.track_inventory = true AND ${stock} > 0 AND (${thr} = 0 OR ${stock} > ${thr})`,
          )
        }
      }

      // Apply search
      if (query.search) {
        // Match the product's own name/sku/barcode OR any of its variants' sku/name — so a
        // scanned/typed variant code (the tile "code") surfaces its product.
        qb.andWhere(
          `(LOWER(product.name) LIKE LOWER(:search)
            OR LOWER(product.sku) LIKE LOWER(:search)
            OR LOWER(product.barcode) LIKE LOWER(:search)
            OR EXISTS (
              SELECT 1 FROM product_variants pv
              WHERE pv.product_id = product.id AND pv.deleted_at IS NULL
                AND (LOWER(pv.sku) LIKE LOWER(:search) OR LOWER(pv.name) LIKE LOWER(:search))
            ))`,
          { search: `%${query.search}%` },
        )
      }

      // Apply sorting
      const sortField = this.validateSortField(query.sortBy)
      const sortOrder = query.sortOrder || 'ASC'
      qb.orderBy(`product.${sortField}`, sortOrder)

      // Calculate pagination
      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
      const skip = (page - 1) * limit

      // Execute query with pagination
      const [products, total] = await qb.skip(skip).take(limit).getManyAndCount()

      const data = await this.attachInventoryAndImages(products, businessId)

      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    } catch (error) {
      return this.handleServiceError('findAll', error, { businessId })
    }
  }

  private validateSortField(field?: string): string {
    const allowedFields = ['name', 'sku', 'createdAt', 'sellingPrice', 'costPrice', 'updatedAt']
    return allowedFields.includes(field ?? '') ? field! : 'name'
  }

  async findById(id: string, businessId: string) {
    try {
      const product = await this.productsRepo.findOne({
        where: { id, businessId, deletedAt: IsNull() },
        relations: ['category', 'unitOfMeasure', 'createdBy'],
      })

      if (!product) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.product_not_found'),
          'PRODUCT_NOT_FOUND',
        )
      }

      const isComposite = product.productType === ProductType.COMPOSITE
      const [inventoryLevel, images, variants, bundleRows, serialUnitRows] = await Promise.all([
        this.inventoryLevelsRepo.findOne({
          where: { businessId, productId: id, variantId: IsNull() },
        }),
        this.imagesRepo.find({
          where: { productId: id },
          order: { sortOrder: 'ASC', createdAt: 'ASC' },
        }),
        product.hasVariants
          ? this.variantsService.listVariantsForProduct(businessId, id)
          : Promise.resolve(undefined),
        isComposite
          ? this.bundleComponentsRepo.find({
              where: { businessId, bundleProductId: id, deletedAt: IsNull() },
              relations: ['componentProduct'],
              order: { sortOrder: 'ASC' },
            })
          : Promise.resolve(undefined),
        product.isSerialized
          ? this.serialUnitsRepo.find({
              where: {
                businessId,
                productId: id,
                status: In([SerialUnitStatus.IN_STOCK, SerialUnitStatus.RESERVED]),
                deletedAt: IsNull(),
              },
              order: { createdAt: 'ASC' },
            })
          : Promise.resolve(undefined),
      ])

      const bundleComponents = bundleRows?.map((row) => ({
        id: row.id,
        businessId: row.businessId,
        bundleProductId: row.bundleProductId,
        componentProductId: row.componentProductId,
        quantity: row.quantity,
        sortOrder: row.sortOrder,
        componentName: row.componentProduct?.name,
      }))

      const serialUnits = serialUnitRows?.map((row) => ({
        id: row.id,
        businessId: row.businessId,
        productId: row.productId,
        variantId: row.variantId ?? null,
        serialNumber: row.serialNumber,
        serialType: row.serialType,
        status: row.status,
        purchasePrice: row.purchasePrice,
        warrantyExpiresAt: row.warrantyExpiresAt?.toISOString() ?? null,
        reservedAt: row.reservedAt?.toISOString() ?? null,
        reservedBy: row.reservedBy ?? null,
      }))
      // Serialised stock is the count of IN_STOCK units.
      const inStockSerialCount =
        serialUnitRows?.filter((row) => row.status === SerialUnitStatus.IN_STOCK).length ?? 0

      // Derived stock / display price / cost — must match the desktop's STOCK/DISPLAY_PRICE/
      // COST expressions so both builds show the same figures. For variant products: stock is
      // the SUM of variant stock, the displayed price is the LOWEST variant price ("from"), and
      // the cost is the AVERAGE variant cost.
      const activeVariants = variants ?? []
      const variantPrices = activeVariants.map((v) => v.priceOverride ?? product.sellingPrice)
      const variantCosts = activeVariants.map((v) => v.costPriceOverride ?? product.costPrice ?? 0)
      const displayPrice = variantPrices.length ? Math.min(...variantPrices) : product.sellingPrice
      const avgCost = variantCosts.length
        ? Math.round(variantCosts.reduce((sum, c) => sum + c, 0) / variantCosts.length)
        : (product.costPrice ?? null)

      const currentStock = product.isSerialized
        ? inStockSerialCount
        : product.hasVariants
          ? activeVariants.reduce((sum, v) => sum + (v.currentStock ?? 0), 0)
          : product.trackInventory
            ? (inventoryLevel?.quantity ?? 0)
            : null

      return {
        ...product,
        currentStock,
        effectiveSellingPrice: product.hasVariants ? displayPrice : product.sellingPrice,
        effectiveCostPrice: product.hasVariants ? avgCost : (product.costPrice ?? null),
        lowStockThreshold: inventoryLevel?.lowStockThreshold ?? null,
        reorderPoint: inventoryLevel?.reorderPoint ?? null,
        primaryImageUrl: images[0]?.url ?? product.imageUrl ?? null,
        images,
        variants,
        bundleComponents,
        serialUnits,
      }
    } catch (error) {
      return this.handleServiceError('findById', error, { id, businessId })
    }
  }

  /** Real-time "how many bundles can be made" for a COMPOSITE product. */
  async getBundleAvailability(productId: string, businessId: string) {
    try {
      const product = await this.productsRepo.findOne({
        where: { id: productId, businessId, deletedAt: IsNull() },
      })
      if (!product) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.product_not_found'),
          'PRODUCT_NOT_FOUND',
        )
      }
      if (product.productType !== ProductType.COMPOSITE) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.not_composite'),
          'NOT_COMPOSITE',
        )
      }

      const components = await this.bundleComponentsRepo.find({
        where: { bundleProductId: productId, businessId, deletedAt: IsNull() },
        relations: ['componentProduct'],
        order: { sortOrder: 'ASC' },
      })
      const componentIds = components.map((component) => component.componentProductId)
      const levels = componentIds.length
        ? await this.inventoryLevelsRepo.find({
            where: { businessId, productId: In(componentIds), variantId: IsNull() },
          })
        : []
      const stockByProduct = new Map(
        levels.map((level) => [level.productId, Number(level.quantity)]),
      )

      let minCanMake = Infinity
      let limitedBy: string | null = null
      const componentSummaries = components.map((component) => {
        const inStock = stockByProduct.get(component.componentProductId) ?? 0
        const canMakeFromThis = Math.floor(inStock / component.quantity)
        if (canMakeFromThis < minCanMake) {
          minCanMake = canMakeFromThis
          limitedBy = component.componentProduct?.name ?? null
        }
        return {
          productId: component.componentProductId,
          productName: component.componentProduct?.name ?? '',
          requiredPerBundle: component.quantity,
          inStock,
        }
      })

      const canMake = components.length === 0 || minCanMake === Infinity ? 0 : minCanMake
      return {
        productId,
        canMake,
        limitedBy: canMake === 0 ? limitedBy : null,
        components: componentSummaries,
      }
    } catch (error) {
      return this.handleServiceError('getBundleAvailability', error, { productId, businessId })
    }
  }

  async findByBarcode(barcode: string, businessId: string) {
    try {
      const product = await this.productsRepo.findOne({
        where: { businessId, barcode, deletedAt: IsNull() },
      })
      if (!product) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.product_not_found'),
          'PRODUCT_NOT_FOUND',
        )
      }
      return this.findById(product.id, businessId)
    } catch (error) {
      return this.handleServiceError('findByBarcode', error, { businessId, barcode })
    }
  }

  async findBySku(sku: string, businessId: string) {
    try {
      const product = await this.productsRepo.findOne({
        where: { businessId, sku: sku.trim().toUpperCase(), deletedAt: IsNull() },
      })
      if (!product) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.product_not_found'),
          'PRODUCT_NOT_FOUND',
        )
      }
      return this.findById(product.id, businessId)
    } catch (error) {
      return this.handleServiceError('findBySku', error, { businessId, sku })
    }
  }

  /**
   * Resolve a scanned/typed code to what it identifies, in priority order: an in-stock
   * serialised unit (by serial number) → a product (barcode or SKU) → a variant (barcode
   * or SKU). Mirrors the desktop `resolveScan`. Returns null when nothing matches.
   */
  async resolveScan(code: string, businessId: string) {
    try {
      const c = code.trim()
      if (!c) return null

      const serial = await this.serialUnitsRepo.findOne({
        where: {
          businessId,
          serialNumber: c,
          status: SerialUnitStatus.IN_STOCK,
          deletedAt: IsNull(),
        },
      })
      if (serial) {
        const product = await this.findById(serial.productId, businessId)
        if (product) return { kind: 'serial' as const, product, serial }
      }

      const productMatch = await this.productsRepo.findOne({
        where: [
          { businessId, barcode: c, deletedAt: IsNull() },
          { businessId, sku: c, deletedAt: IsNull() },
        ],
      })
      if (productMatch) {
        const product = await this.findById(productMatch.id, businessId)
        if (product) return { kind: 'product' as const, product }
      }

      const variantMatch = await this.variantsRepo.findOne({
        where: [
          { businessId, barcode: c, deletedAt: IsNull() },
          { businessId, sku: c, deletedAt: IsNull() },
        ],
      })
      if (variantMatch) {
        const product = await this.findById(variantMatch.productId, businessId)
        const variants = await this.variantsService.listVariantsForProduct(
          businessId,
          variantMatch.productId,
        )
        const variant = variants.find((v) => v.id === variantMatch.id)
        if (product && variant) return { kind: 'variant' as const, product, variant }
      }

      return null
    } catch (error) {
      return this.handleServiceError('resolveScan', error, { businessId, code })
    }
  }

  async findBySlug(slug: string, businessId: string) {
    try {
      const product = await this.productsRepo.findOne({
        where: { businessId, slug, deletedAt: IsNull() },
      })
      if (!product) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.product_not_found'),
          'PRODUCT_NOT_FOUND',
        )
      }
      return this.findById(product.id, businessId)
    } catch (error) {
      return this.handleServiceError('findBySlug', error, { businessId, slug })
    }
  }

  async update(id: string, businessId: string, dto: UpdateProductRequest, context?: AuditContext) {
    try {
      const product = await this.findById(id, businessId)
      const beforeSnapshot = sanitizeForAudit({
        name: product.name,
        sellingPrice: product.sellingPrice,
        costPrice: product.costPrice,
        taxRate: product.taxRate,
        categoryId: product.categoryId,
        isActive: product.isActive,
      })

      if (dto.sku && dto.sku.trim().toUpperCase() !== product.sku) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.product_sku_immutable'),
          'PRODUCT_SKU_IMMUTABLE',
        )
      }

      const category = dto.categoryId
        ? await this.findCategory(dto.categoryId, businessId)
        : (product.category ?? null)
      const unitOfMeasure = dto.unitOfMeasureId
        ? await this.findUnitOfMeasure(dto.unitOfMeasureId, businessId)
        : product.unitOfMeasure

      const barcode = dto.barcode
        ? await this.barcodeService.validateAndNormalize(businessId, dto.barcode, id)
        : {
            value: product.barcode,
            type: product.barcodeType,
            isGenerated: product.isBarcodeGenerated,
          }

      const isService = dto.isService ?? product.isService
      const trackInventory =
        dto.trackInventory !== undefined
          ? dto.trackInventory
          : dto.isService === true
            ? false
            : product.trackInventory

      // Only regenerate the slug when the name actually changes — an unchanged name must keep
      // the existing slug untouched (regenerating can shift it, e.g. reclaiming a base slug a
      // soft-deleted product still holds, which then collides on the unique index).
      const slug =
        dto.name && dto.name.trim() !== product.name
          ? await this.slugService.generateProductSlug(dto.name, businessId, id)
          : product.slug

      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(Product).update(id, {
          categoryId: category?.id ?? null,
          unitOfMeasureId: unitOfMeasure.id,
          name: dto.name?.trim() ?? product.name,
          slug,
          description:
            dto.description === undefined ? product.description : (dto.description?.trim() ?? null),
          barcode: barcode.value ?? null,
          barcodeType: barcode.type ?? null,
          isBarcodeGenerated: barcode.isGenerated ?? false,
          sellingPrice: dto.sellingPrice ?? product.sellingPrice,
          costPrice: dto.costPrice === undefined ? product.costPrice : (dto.costPrice ?? null),
          taxRate: dto.taxRate ?? product.taxRate,
          isActive: dto.isActive ?? product.isActive,
          isService,
          trackInventory,
          imageUrl: dto.imageUrl === undefined ? product.imageUrl : (dto.imageUrl?.trim() ?? null),
          updatedAt: new Date(),
        })

        const inventoryRepo = manager.getRepository(InventoryLevel)
        const inventoryLevel = await inventoryRepo.findOne({ where: { businessId, productId: id } })

        if (trackInventory && !inventoryLevel) {
          await inventoryRepo.save(
            inventoryRepo.create({
              businessId,
              productId: id,
              quantity: 0,
              lowStockThreshold: dto.lowStockThreshold ?? null,
            }),
          )
        } else if (trackInventory && inventoryLevel) {
          await inventoryRepo.update(inventoryLevel.id, {
            lowStockThreshold:
              dto.lowStockThreshold === undefined
                ? inventoryLevel.lowStockThreshold
                : dto.lowStockThreshold,
          })
        } else if (!trackInventory && inventoryLevel) {
          await inventoryRepo.delete({ id: inventoryLevel.id })
        }
      })

      const updated = await this.findById(id, businessId)
      if (context) {
        const afterSnapshot = sanitizeForAudit({
          name: updated.name,
          sellingPrice: updated.sellingPrice,
          costPrice: updated.costPrice,
          taxRate: updated.taxRate,
          categoryId: updated.categoryId,
          isActive: updated.isActive,
        })
        this.auditService.log(context, {
          action: 'UPDATE',
          entityType: 'product',
          entityId: id,
          entityLabel: updated.name,
          changes: computeChanges(beforeSnapshot, afterSnapshot),
        })
      }
      return updated
    } catch (error) {
      return this.handleServiceError('update', error, { id, businessId })
    }
  }

  async assignBarcode(id: string, businessId: string, dto: AssignBarcodeRequest) {
    try {
      await this.findById(id, businessId)
      const barcode = await this.barcodeService.validateAndNormalize(businessId, dto.barcode, id)
      await this.productsRepo.update(id, {
        barcode: barcode.value,
        barcodeType: barcode.type,
        isBarcodeGenerated: false,
        updatedAt: new Date(),
      })
      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('assignBarcode', error, { id, businessId })
    }
  }

  /**
   * Delete a product. Soft-deletes the product AND cascades to its children
   * (variants + options, serial units, images, inventory levels), then writes off
   * any remaining stock as a stock-out movement so the ledger balances to zero.
   * Mirrors the desktop offline path and the per-variant removal semantics.
   */
  async softDelete(id: string, businessId: string, context?: AuditContext): Promise<void> {
    try {
      const product = await this.findById(id, businessId)
      const now = new Date()

      await this.dataSource.transaction(async (manager) => {
        const variantRepo = manager.getRepository(ProductVariant)
        const optionRepo = manager.getRepository(ProductVariantOption)
        const serialRepo = manager.getRepository(ProductSerialUnit)
        const imageRepo = manager.getRepository(ProductImage)
        const levelRepo = manager.getRepository(InventoryLevel)
        const movementRepo = manager.getRepository(InventoryMovement)

        // Remaining stock = serial count / sum of variant+product levels.
        let stockBefore = 0
        if (product.isSerialized) {
          stockBefore = await serialRepo.count({
            where: { businessId, productId: id, status: SerialUnitStatus.IN_STOCK },
          })
          await serialRepo
            .createQueryBuilder()
            .update()
            .set({ status: SerialUnitStatus.DAMAGED, deletedAt: now })
            .where('business_id = :businessId AND product_id = :id AND deleted_at IS NULL', {
              businessId,
              id,
            })
            .execute()
        } else {
          const row = await levelRepo
            .createQueryBuilder('l')
            .select('COALESCE(SUM(l.quantity), 0)', 's')
            .where('l.business_id = :businessId AND l.product_id = :id', { businessId, id })
            .getRawOne<{ s: string }>()
          stockBefore = Number(row?.s ?? 0)
        }

        // Cascade soft-delete children.
        const variants = await variantRepo.find({
          where: { productId: id, businessId, deletedAt: IsNull() },
        })
        if (variants.length) {
          await optionRepo.softDelete({ variantId: In(variants.map((v) => v.id)), businessId })
          await variantRepo.update(
            { productId: id, businessId, deletedAt: IsNull() },
            { isActive: false, deletedAt: now },
          )
        }
        await levelRepo.update({ productId: id, businessId }, { quantity: 0, updatedAt: now })
        await imageRepo.delete({ productId: id })

        if (stockBefore > 0) {
          await movementRepo.save(
            movementRepo.create({
              businessId,
              productId: id,
              type: MovementType.MANUAL_ADJUSTMENT,
              quantityChange: -stockBefore,
              quantityBefore: stockBefore,
              quantityAfter: 0,
              referenceType: 'product',
              referenceId: id,
              notes: 'Product deleted',
              performedById: context?.actorId ?? null,
            }),
          )
        }

        await manager
          .getRepository(Product)
          .update(id, { isActive: false, deletedAt: now, updatedAt: now })
      })

      if (context) {
        this.auditService.log(context, {
          action: 'DELETE',
          entityType: 'product',
          entityId: id,
          entityLabel: product.name,
          changes: { before: sanitizeForAudit({ ...product }), after: null },
        })
      }
    } catch (error) {
      return this.handleServiceError('softDelete', error, { id, businessId })
    }
  }

  async getLowStockProducts(businessId: string) {
    try {
      const levels = await this.inventoryLevelsRepo
        .createQueryBuilder('inventory')
        .innerJoinAndSelect('inventory.product', 'product')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('product.unitOfMeasure', 'unitOfMeasure')
        .where('inventory.business_id = :businessId', { businessId })
        .andWhere('product.deleted_at IS NULL')
        .andWhere('product.is_active = true')
        .andWhere('product.track_inventory = true')
        .andWhere('inventory.low_stock_threshold IS NOT NULL')
        .andWhere('inventory.quantity <= inventory.low_stock_threshold')
        .orderBy('inventory.quantity', 'ASC')
        .getMany()

      return levels.map((level) => ({
        productId: level.productId,
        productName: level.product?.name ?? null,
        currentQuantity: level.quantity,
        lowStockThreshold: level.lowStockThreshold,
        reorderPoint: level.reorderPoint,
        unitOfMeasure: level.product?.unitOfMeasure?.abbreviation ?? null,
        categoryName: level.product?.category?.name ?? null,
      }))
    } catch (error) {
      return this.handleServiceError('getLowStockProducts', error, { businessId })
    }
  }

  /** Catalog headline stats (variant/serial-aware), mirroring the desktop products.stats. */
  async getStats(businessId: string): Promise<ProductStats> {
    try {
      const STOCK = stockExpr('p')
      const COST = costExpr('p')
      const PRICE = priceExpr('p')
      const THR = thresholdExpr('p')
      const rows: Array<Record<string, string | number>> =
        await this.inventoryLevelsRepo.manager.query(
          `SELECT
           COUNT(*)::int AS "totalSkus",
           COUNT(DISTINCT p.category_id)::int AS "categories",
           COALESCE(SUM(COALESCE(${COST}, 0) * ${STOCK}), 0) AS "catalogValueCost",
           COALESCE(SUM(${PRICE} * ${STOCK}), 0) AS "retailValue",
           COALESCE(SUM(CASE WHEN p.track_inventory AND ${STOCK} > 0 AND ${THR} > 0 AND ${STOCK} <= ${THR} THEN 1 ELSE 0 END), 0)::int AS "lowStock",
           COALESCE(SUM(CASE WHEN p.track_inventory AND ${STOCK} <= 0 THEN 1 ELSE 0 END), 0)::int AS "outOfStock"
         FROM products p
         WHERE p.business_id = $1 AND p.deleted_at IS NULL`,
          [businessId],
        )
      const r = rows[0] ?? {}
      const catalogValueCost = round2(Number(r.catalogValueCost ?? 0))
      const retailValue = round2(Number(r.retailValue ?? 0))
      const blendedMarginPct =
        retailValue > 0 ? round2(((retailValue - catalogValueCost) / retailValue) * 100) : 0
      return {
        totalSkus: Number(r.totalSkus ?? 0),
        categories: Number(r.categories ?? 0),
        catalogValueCost,
        retailValue,
        blendedMarginPct,
        lowStock: Number(r.lowStock ?? 0),
        outOfStock: Number(r.outOfStock ?? 0),
      }
    } catch (error) {
      return this.handleServiceError('getStats', error, { businessId })
    }
  }

  private async attachInventoryAndImages(products: Product[], businessId: string) {
    const productIds = products.map((product) => product.id)
    if (productIds.length === 0) return []

    const [levels, images, derivedRows] = await Promise.all([
      this.inventoryLevelsRepo.find({
        // Product-level rows only (variant rows carry a variant_id) — for thresholds.
        where: productIds.map((productId) => ({ businessId, productId, variantId: IsNull() })),
      }),
      this.imagesRepo
        .createQueryBuilder('image')
        .where('image.product_id IN (:...productIds)', { productIds })
        .orderBy('image.sort_order', 'ASC')
        .addOrderBy('image.created_at', 'ASC')
        .getMany(),
      // Derived on-hand stock (serial-count / sum-of-variants / product level) + the
      // displayed "from" price (lowest variant). EXISTS-based, so a stale has_variants
      // flag can't skew it — identical to the desktop's STOCK_EXPR/price.
      this.dataSource.query(
        `SELECT p.id, (${stockExpr('p')})::float8 AS stock, (${displayPriceExpr('p')})::float8 AS price
         FROM products p WHERE p.id = ANY($1::uuid[])`,
        [productIds],
      ) as Promise<Array<{ id: string; stock: number | null; price: number | null }>>,
    ])

    const levelsByProductId = new Map(levels.map((level) => [level.productId, level]))
    const derivedById = new Map(derivedRows.map((row) => [row.id, row]))
    const primaryImagesByProductId = new Map<string, ProductImage>()
    for (const image of images) {
      if (!primaryImagesByProductId.has(image.productId)) {
        primaryImagesByProductId.set(image.productId, image)
      }
    }

    return products.map((product) => {
      const inventory = levelsByProductId.get(product.id)
      const derived = derivedById.get(product.id)
      const primaryImage = primaryImagesByProductId.get(product.id)

      return {
        ...product,
        // The list view never loads variants; detail (findById) does.
        variants: undefined,
        // Derived total: serial-count / sum-of-variants / product-level (null for services).
        currentStock: product.trackInventory ? Number(derived?.stock ?? 0) : null,
        // "From" price: lowest variant price for variant products, else the product price.
        effectiveSellingPrice: Number(derived?.price ?? product.sellingPrice),
        lowStockThreshold: inventory?.lowStockThreshold ?? null,
        reorderPoint: inventory?.reorderPoint ?? null,
        primaryImageUrl: primaryImage?.url ?? product.imageUrl ?? null,
      }
    })
  }

  private async findBusiness(id: string) {
    const business = await this.businessesRepo.findOne({ where: { id } })
    if (!business) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.business_not_found'),
        'BUSINESS_NOT_FOUND',
      )
    }
    return business
  }

  private async findCategory(id: string, businessId: string) {
    const category = await this.categoriesRepo.findOne({
      where: { id, businessId, deletedAt: IsNull() },
    })
    if (!category) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.category_not_found'),
        'CATEGORY_NOT_FOUND',
      )
    }

    // Products can only be assigned to leaf categories (no active children).
    const activeChildCount = await this.categoriesRepo
      .createQueryBuilder('category')
      .where('category.business_id = :businessId', { businessId })
      .andWhere('category.parent_id = :id', { id })
      .andWhere('category.deleted_at IS NULL')
      .andWhere('category.is_active = true')
      .getCount()
    if (activeChildCount > 0) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.category_not_leaf'),
        'CATEGORY_NOT_LEAF',
      )
    }

    return category
  }

  private async findUnitOfMeasure(id: string, businessId: string) {
    const unit = await this.unitsRepo.findOne({
      where: [
        { id, businessId: IsNull() },
        { id, businessId },
      ],
    })

    if (!unit) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.unit_of_measure_not_found'),
        'UNIT_OF_MEASURE_NOT_FOUND',
      )
    }

    return unit
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('ProductsService error', 'ProductsService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    this.logger.error('ProductsService unexpected error', 'ProductsService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'PRODUCTS_SERVICE_ERROR',
      { action },
    )
  }
}
