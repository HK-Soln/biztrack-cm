import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import type {
  AdjustInventoryRequest,
  InventoryBinSummary,
  InventoryRestockSyncPayload,
  InventoryAlert,
  InventoryAlertsQuery,
  InventoryMovementTrendPoint,
  InventoryMovementsQuery,
  InventoryQuery,
  RestockRequest,
  RestockPaymentRequest,
  RestockSerialResult,
  SerialType,
  SetInventoryThresholdRequest,
} from '@biztrack/types'
import { DebtDirection, DebtSource, SerialUnitStatus, StockAdjustmentType } from '@biztrack/types'
import { validateSerialNumber } from '@biztrack/validators'
import { I18nService } from 'nestjs-i18n'
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { Business } from '@/entities/business.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement, MovementType } from '@/entities/inventory-movement.entity'
import { ProductImage } from '@/entities/product-image.entity'
import { Product } from '@/entities/product.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import { RestockItem } from '@/entities/restock-item.entity'
import { RestockPayment } from '@/entities/restock-payment.entity'
import { RestockRecord } from '@/entities/restock-record.entity'
import { Sale } from '@/entities/sale.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { DebtsService } from '@/modules/debts/services/debts.service'
import type { InventoryLowStockAlertDigest } from '../constants/inventory.constants'

type SaleInventoryItemInput = {
  productId: string
  // Set when selling a specific variant (Phase 3D); stock is deducted from the
  // matching per-variant inventory_levels row instead of the product-level row.
  variantId?: string | null
  productName: string
  quantity: number
  movementId?: string | null
}

// Composite stock key — one inventory_levels row per (product, variant). The
// non-variant row uses an empty variant segment.
const stockKey = (productId: string, variantId?: string | null) =>
  `${productId}|${variantId ?? ''}`

type RestockInputItem = {
  id?: string
  productId: string
  quantity: number
  unitCost?: number | null
  movementId?: string | null
  // Serialised restock (Phase 3G): the units received instead of a quantity.
  variantId?: string | null
  serialNumbers?: string[]
  warrantyMonths?: number | null
}

type RestockCreationInput = {
  businessId: string
  recordId?: string
  referenceNumber?: string | null
  supplierId?: string | null
  supplierName?: string | null
  totalAmount?: number | null
  totalCost?: number | null
  notes?: string | null
  performedById?: string | null
  createdAt: Date
  updatedAt?: Date | null
  payments?: RestockPaymentRequest[]
  items: RestockInputItem[]
}

type InventoryMovementReferenceInfo = {
  label: string | null
  sourceName: string | null
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Business)
    private readonly businessesRepo: Repository<Business>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(InventoryLevel)
    private readonly inventoryLevelsRepo: Repository<InventoryLevel>,
    @InjectRepository(InventoryMovement)
    private readonly inventoryMovementsRepo: Repository<InventoryMovement>,
    @InjectRepository(ProductImage)
    private readonly productImagesRepo: Repository<ProductImage>,
    private readonly debtsService: DebtsService,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('InventoryService')
  }

  async findAll(businessId: string, filters?: InventoryQuery) {
    try {
      const query = this.inventoryLevelsRepo
        .createQueryBuilder('inventory')
        .innerJoinAndSelect('inventory.product', 'product')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('product.unitOfMeasure', 'unitOfMeasure')
        .where('inventory.business_id = :businessId', { businessId })
        .andWhere('product.deleted_at IS NULL')
        .andWhere('product.track_inventory = true')

      if (filters?.categoryId) {
        query.andWhere('product.category_id = :categoryId', { categoryId: filters.categoryId })
      }
      if (filters?.lowStockOnly) {
        query.andWhere('inventory.low_stock_threshold IS NOT NULL')
        query.andWhere('inventory.quantity <= inventory.low_stock_threshold')
      }

      const sort = this.resolveSort(filters?.sortBy)
      const sortOrder = filters?.sortOrder ?? 'ASC'
      const page = Math.max(filters?.page ?? 1, 1)
      const limit = Math.min(Math.max(filters?.limit ?? 20, 1), 100)
      const skip = (page - 1) * limit

      query.orderBy(sort, sortOrder).skip(skip).take(limit)

      const [rows, total] = await query.getManyAndCount()
      const primaryImageUrls = await this.loadPrimaryImageUrls(rows.map((row) => row.productId))

      return {
        data: rows.map((row) => ({
          productId: row.productId,
          productName: row.product?.name ?? null,
          sku: row.product?.sku ?? null,
          barcode: row.product?.barcode ?? null,
          primaryImageUrl: primaryImageUrls.get(row.productId) ?? row.product?.imageUrl ?? null,
          categoryName: row.product?.category?.name ?? null,
          unitAbbreviation: row.product?.unitOfMeasure?.abbreviation ?? null,
          quantity: row.quantity,
          lowStockThreshold: row.lowStockThreshold,
          reorderPoint: row.reorderPoint,
          isLowStock:
            row.lowStockThreshold !== null && row.lowStockThreshold !== undefined
              ? row.quantity <= row.lowStockThreshold
              : false,
          lastRestockAt: row.lastRestockAt,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    } catch (error) {
      return this.handleServiceError('findAll', error, { businessId })
    }
  }

  private resolveSort(field?: string): string {
    const sortMap: Record<string, string> = {
      productName: 'product.name',
      sku: 'product.sku',
      barcode: 'product.barcode',
      categoryName: 'category.name',
      quantity: 'inventory.quantity',
      lowStockThreshold: 'inventory.low_stock_threshold',
      reorderPoint: 'inventory.reorder_point',
      lastRestockAt: 'inventory.last_restock_at',
    }

    return sortMap[field ?? ''] ?? 'product.name'
  }

  async findOne(productId: string, businessId: string) {
    try {
      const level = await this.requireTrackedProduct(productId, businessId)
      const movements = await this.inventoryMovementsRepo.find({
        where: { businessId, productId },
        relations: ['performedBy'],
        order: { createdAt: 'DESC' },
      })
      const referenceInfo = await this.loadMovementReferenceInfo(businessId, movements)

      return {
        ...level,
        movements: movements.slice(0, 10).map((movement) => ({
          ...movement,
          referenceLabel:
            referenceInfo.get(
              this.getMovementReferenceLookupKey(movement.referenceType, movement.referenceId),
            )?.label ?? null,
        })),
        binSummary: this.buildInventoryBinSummary(level.quantity, movements, referenceInfo),
      }
    } catch (error) {
      return this.handleServiceError('findOne', error, { productId, businessId })
    }
  }

  async getMovements(productId: string, businessId: string, query: InventoryMovementsQuery) {
    try {
      await this.requireTrackedProduct(productId, businessId)
      return this.findMovements(businessId, { ...query, productId })
    } catch (error) {
      return this.handleServiceError('getMovements', error, { productId, businessId })
    }
  }

  async getAllMovements(businessId: string, query: InventoryMovementsQuery) {
    try {
      return this.findMovements(businessId, query)
    } catch (error) {
      return this.handleServiceError('getAllMovements', error, { businessId })
    }
  }

  async setThreshold(productId: string, businessId: string, dto: SetInventoryThresholdRequest) {
    try {
      const level = await this.requireTrackedProduct(productId, businessId)
      await this.inventoryLevelsRepo.update(level.id, {
        lowStockThreshold: dto.lowStockThreshold ?? null,
        reorderPoint: dto.reorderPoint ?? null,
      })
      return this.requireTrackedProduct(productId, businessId)
    } catch (error) {
      return this.handleServiceError('setThreshold', error, { productId, businessId })
    }
  }

  async adjust(productId: string, businessId: string, userId: string, dto: AdjustInventoryRequest) {
    try {
      this.validateAdjustment(dto)
      const level = await this.requireTrackedProduct(productId, businessId)

      return this.dataSource.transaction(async (manager) => {
        const inventoryRepo = manager.getRepository(InventoryLevel)
        const movementRepo = manager.getRepository(InventoryMovement)
        const current = await inventoryRepo.findOneByOrFail({ id: level.id })

        const quantityBefore = Number(current.quantity)
        const quantityAfter = this.calculateAdjustedQuantity(quantityBefore, dto)

        if (quantityAfter < 0) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.inventory_insufficient_stock'),
            'INVENTORY_INSUFFICIENT_STOCK',
            { currentQuantity: quantityBefore, requested: dto.quantity },
          )
        }

        await inventoryRepo.update(current.id, { quantity: quantityAfter })
        await movementRepo.save(
          movementRepo.create({
            businessId,
            productId,
            type: MovementType.MANUAL_ADJUSTMENT,
            quantityChange: quantityAfter - quantityBefore,
            quantityBefore,
            quantityAfter,
            referenceType: 'adjustment',
            notes: dto.notes.trim(),
            performedById: userId,
          }),
        )

        return this.findOne(productId, businessId)
      })
    } catch (error) {
      return this.handleServiceError('adjust', error, { productId, businessId, userId })
    }
  }

  async restock(businessId: string, userId: string, dto: RestockRequest) {
    try {
      return this.dataSource.transaction(async (manager) => {
        return this.createRestockRecord(manager, {
          businessId,
          referenceNumber: dto.referenceNumber?.trim() ?? null,
          supplierId: this.normalizeOptionalUuid(dto.supplierId),
          supplierName: dto.supplierName?.trim() ?? null,
          totalAmount: dto.totalAmount ?? null,
          totalCost: dto.totalCost ?? null,
          notes: dto.notes?.trim() ?? null,
          performedById: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
          payments: dto.payments,
          items: dto.items.map((item) => ({
            productId: item.productId,
            // Serialised products receive serial numbers instead of a quantity.
            quantity: item.quantity ?? (item.serialNumbers?.length ?? 0),
            unitCost: item.unitCost ?? null,
            variantId: item.variantId ?? null,
            serialNumbers: item.serialNumbers,
            warrantyMonths: item.warrantyMonths ?? null,
          })),
        })
      })
    } catch (error) {
      return this.handleServiceError('restock', error, { businessId, userId })
    }
  }

  async restockFromSync(
    businessId: string,
    recordId: string,
    payload: InventoryRestockSyncPayload,
    recordUpdatedAt: Date,
  ) {
    try {
      const existing = await this.dataSource.getRepository(RestockRecord).findOne({
        where: { id: recordId, businessId },
      })

      if (existing) {
        return existing
      }

      return this.dataSource.transaction(async (manager) => {
        return this.createRestockRecord(manager, {
          businessId,
          recordId,
          referenceNumber: payload.referenceNumber?.trim() ?? null,
          supplierId: this.normalizeOptionalUuid(payload.supplierId),
          supplierName: payload.supplierName?.trim() ?? null,
          totalAmount: payload.totalAmount ?? null,
          totalCost: payload.totalCost ?? null,
          notes: payload.notes?.trim() ?? null,
          performedById: null,
          createdAt: this.parseOptionalDate(payload.createdAt) ?? recordUpdatedAt,
          updatedAt: recordUpdatedAt,
          payments: payload.payments,
          items: payload.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost ?? null,
            movementId: item.movementId,
          })),
        })
      })
    } catch (error) {
      return this.handleServiceError('restockFromSync', error, { businessId, recordId })
    }
  }

  async getAlerts(businessId: string, query: InventoryAlertsQuery) {
    try {
      const qb = this.createAlertsQueryBuilder(businessId)
      const sort = this.resolveAlertSort(query.sortBy)
      const sortOrder = query.sortBy ? (query.sortOrder ?? 'ASC') : 'DESC'
      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
      const skip = (page - 1) * limit

      qb.orderBy(sort, sortOrder).skip(skip).take(limit)

      const [rows, total] = await qb.getManyAndCount()
      return {
        data: await this.mapAlertRows(rows),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    } catch (error) {
      return this.handleServiceError('getAlerts', error, { businessId })
    }
  }

  async findBusinessIdsWithLowStockAlerts(): Promise<string[]> {
    const rows = await this.inventoryLevelsRepo
      .createQueryBuilder('inventory')
      .select('inventory.business_id', 'businessId')
      .innerJoin('inventory.product', 'product')
      .where('inventory.low_stock_threshold IS NOT NULL')
      .andWhere('inventory.quantity <= inventory.low_stock_threshold')
      .andWhere('product.deleted_at IS NULL')
      .andWhere('product.is_active = true')
      .andWhere('product.track_inventory = true')
      .distinct(true)
      .getRawMany<{ businessId: string }>()

    return rows.map((row) => row.businessId)
  }

  async buildLowStockAlertDigest(businessId: string): Promise<InventoryLowStockAlertDigest | null> {
    const business = await this.businessesRepo.findOne({
      where: { id: businessId },
      relations: ['owner'],
    })

    if (!business) {
      return null
    }

    const rows = await this.createAlertsQueryBuilder(businessId)
      .orderBy(this.resolveAlertSort(), 'DESC')
      .getMany()
    const alerts = await this.mapAlertRows(rows)

    if (alerts.length === 0) {
      return null
    }

    return {
      generatedAt: new Date().toISOString(),
      businessId: business.id,
      businessName: business.name,
      owner: business.owner
        ? {
          userId: business.owner.id,
          name: business.owner.name,
          email: business.owner.email ?? null,
          phone: business.owner.phone ?? null,
        }
        : null,
      alerts,
    }
  }

  async deductForSale(
    businessId: string,
    saleId: string,
    saleNumber: string,
    userId: string,
    items: SaleInventoryItemInput[],
    manager?: EntityManager,
  ): Promise<void> {
    try {
      const inventoryRepo = this.getInventoryRepo(manager)
      const movementRepo = this.getMovementRepo(manager)
      const productRepo = this.getProductRepo(manager)

      const productIds = [...new Set(items.map((item) => item.productId))]

      // Batch-load products and inventory levels once instead of per line item
      // (was an N+1: one product findOne + one locked level query per item).
      const products = await productRepo.find({
        where: { id: In(productIds), businessId, deletedAt: IsNull() },
      })
      const productMap = new Map(products.map((product) => [product.id, product]))

      const levels = await this.findInventoryLevelsForUpdate(inventoryRepo, businessId, productIds)
      // Keyed by (product, variant) so variant products deduct from the correct row.
      const levelMap = new Map(
        levels.map((level) => [stockKey(level.productId, level.variantId), level]),
      )

      // Running quantity per (product, variant) so repeated line items deduct
      // cumulatively (matching the previous per-item sequential behaviour).
      const runningQuantities = new Map<string, number>()
      const keyMeta = new Map<string, { productId: string; variantId: string | null }>()
      const movementsToInsert: InventoryMovement[] = []

      for (const item of items) {
        const product = productMap.get(item.productId)

        if (!product) {
          throw new AppNotFoundException(
            await this.i18n.translate('errors.product_not_found'),
            'PRODUCT_NOT_FOUND',
          )
        }

        if (!product.trackInventory) {
          continue
        }

        const key = stockKey(item.productId, item.variantId)
        keyMeta.set(key, { productId: item.productId, variantId: item.variantId ?? null })
        const level = levelMap.get(key)
        const quantityBefore = runningQuantities.has(key)
          ? runningQuantities.get(key)!
          : Number(level?.quantity ?? 0)
        const quantityAfter = quantityBefore - item.quantity

        if (quantityAfter < 0) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.insufficient_stock', {
              args: {
                name: item.productName,
                available: quantityBefore,
                requested: item.quantity,
              },
            }),
            'INSUFFICIENT_STOCK',
            {
              productId: item.productId,
              productName: item.productName,
              available: quantityBefore,
              requested: item.quantity,
            },
          )
        }

        runningQuantities.set(key, quantityAfter)

        movementsToInsert.push(
          movementRepo.create({
            id: item.movementId ?? undefined,
            businessId,
            productId: item.productId,
            type: MovementType.SALE,
            quantityChange: -item.quantity,
            quantityBefore,
            quantityAfter,
            referenceType: 'sale',
            referenceId: saleId,
            notes: `Sale ${saleNumber}`,
            performedById: userId,
          }),
        )
      }

      // Apply the final level once per distinct (product, variant), then bulk-insert movements.
      for (const [key, finalQuantity] of runningQuantities) {
        const level = levelMap.get(key)
        const meta = keyMeta.get(key)!
        if (!level) {
          await inventoryRepo.save(
            inventoryRepo.create({
              businessId,
              productId: meta.productId,
              variantId: meta.variantId,
              quantity: finalQuantity,
            }),
          )
        } else {
          await inventoryRepo.update(level.id, { quantity: finalQuantity })
        }
      }

      if (movementsToInsert.length > 0) {
        await movementRepo.save(movementsToInsert)
      }
    } catch (error) {
      return this.handleServiceError('deductForSale', error, { businessId, saleId, saleNumber, userId })
    }
  }

  async reverseForVoidedSale(
    businessId: string,
    saleId: string,
    saleNumber: string,
    userId: string,
    items: SaleInventoryItemInput[],
    manager?: EntityManager,
  ): Promise<void> {
    try {
      const inventoryRepo = this.getInventoryRepo(manager)
      const movementRepo = this.getMovementRepo(manager)
      const productRepo = this.getProductRepo(manager)

      for (const item of items) {
        const product = await productRepo.findOne({
          where: { id: item.productId, businessId, deletedAt: IsNull() },
        })

        if (!product) {
          throw new AppNotFoundException(
            await this.i18n.translate('errors.product_not_found'),
            'PRODUCT_NOT_FOUND',
          )
        }

        if (!product.trackInventory) {
          continue
        }

        const level = await this.findInventoryLevelForUpdate(
          inventoryRepo,
          businessId,
          item.productId,
          item.variantId,
        )
        const quantityBefore = Number(level?.quantity ?? 0)
        const quantityAfter = quantityBefore + item.quantity

        if (!level) {
          await inventoryRepo.save(
            inventoryRepo.create({
              businessId,
              productId: item.productId,
              variantId: item.variantId ?? null,
              quantity: quantityAfter,
            }),
          )
        } else {
          await inventoryRepo.update(level.id, { quantity: quantityAfter })
        }

        await movementRepo.save(
          movementRepo.create({
            businessId,
            productId: item.productId,
            type: MovementType.VOID_REVERSAL,
            quantityChange: item.quantity,
            quantityBefore,
            quantityAfter,
            referenceType: 'sale_void',
            referenceId: saleId,
            notes: `Void ${saleNumber}`,
            performedById: userId,
          }),
        )
      }
    } catch (error) {
      return this.handleServiceError('reverseForVoidedSale', error, {
        businessId,
        saleId,
        saleNumber,
        userId,
      })
    }
  }

  private calculateAdjustedQuantity(currentQuantity: number, dto: AdjustInventoryRequest) {
    if (dto.type === StockAdjustmentType.ADD) return currentQuantity + dto.quantity
    if (dto.type === StockAdjustmentType.REMOVE) return currentQuantity - dto.quantity
    return dto.quantity
  }

  private validateAdjustment(dto: AdjustInventoryRequest) {
    const isAddOrRemove = dto.type === StockAdjustmentType.ADD || dto.type === StockAdjustmentType.REMOVE
    const isValid =
      (isAddOrRemove && dto.quantity > 0) ||
      (dto.type === StockAdjustmentType.SET && dto.quantity >= 0)

    if (!isValid) {
      throw new AppBadRequestException('Invalid adjustment quantity.', 'INVALID_INVENTORY_ADJUSTMENT_QUANTITY', {
        type: dto.type,
        quantity: dto.quantity,
      })
    }
  }

  private async findMovements(businessId: string, query: InventoryMovementsQuery) {
    const qb = this.inventoryMovementsRepo
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.performedBy', 'performedBy')
      .where('movement.business_id = :businessId', { businessId })

    if (query.productId) {
      qb.andWhere('movement.product_id = :productId', { productId: query.productId })
    }

    if (query.type) {
      qb.andWhere('movement.type = :type', { type: query.type })
    }

    if (query.dateFrom) {
      qb.andWhere('movement.created_at >= :dateFrom', { dateFrom: query.dateFrom })
    }

    if (query.dateTo) {
      qb.andWhere('movement.created_at <= :dateTo', { dateTo: query.dateTo })
    }

    const sort = this.resolveMovementSort(query.sortBy)
    const sortOrder = query.sortOrder ?? 'DESC'
    const page = Math.max(query.page ?? 1, 1)
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
    const skip = (page - 1) * limit
    const [data, total] = await qb.orderBy(sort, sortOrder).skip(skip).take(limit).getManyAndCount()
    const referenceInfo = await this.loadMovementReferenceInfo(businessId, data)

    return {
      data: data.map((movement) => ({
        ...movement,
        referenceLabel:
          referenceInfo.get(
            this.getMovementReferenceLookupKey(movement.referenceType, movement.referenceId),
          )?.label ?? null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  private resolveMovementSort(field?: string) {
    const sortMap: Record<string, string> = {
      createdAt: 'movement.created_at',
      type: 'movement.type',
      quantityChange: 'movement.quantity_change',
      quantityBefore: 'movement.quantity_before',
      quantityAfter: 'movement.quantity_after',
    }

    return sortMap[field ?? ''] ?? 'movement.created_at'
  }

  private resolveAlertSort(field?: string) {
    const sortMap: Record<string, string> = {
      productName: 'product.name',
      sku: 'product.sku',
      currentQuantity: 'inventory.quantity',
      lowStockThreshold: 'inventory.low_stock_threshold',
      reorderPoint: 'inventory.reorder_point',
      shortfall: '(inventory.low_stock_threshold - inventory.quantity)',
    }

    return sortMap[field ?? ''] ?? '(inventory.low_stock_threshold - inventory.quantity)'
  }

  private createAlertsQueryBuilder(businessId: string) {
    return this.inventoryLevelsRepo
      .createQueryBuilder('inventory')
      .innerJoinAndSelect('inventory.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .where('inventory.business_id = :businessId', { businessId })
      .andWhere('product.deleted_at IS NULL')
      .andWhere('product.is_active = true')
      .andWhere('product.track_inventory = true')
      .andWhere('inventory.low_stock_threshold IS NOT NULL')
      .andWhere('inventory.quantity <= inventory.low_stock_threshold')
  }

  private async mapAlertRows(rows: InventoryLevel[]): Promise<InventoryAlert[]> {
    const primaryImageUrls = await this.loadPrimaryImageUrls(rows.map((row) => row.productId))

    return rows.map((row) => ({
      productId: row.productId,
      productName: row.product?.name ?? null,
      sku: row.product?.sku ?? null,
      primaryImageUrl: primaryImageUrls.get(row.productId) ?? row.product?.imageUrl ?? null,
      categoryName: row.product?.category?.name ?? null,
      currentQuantity: row.quantity,
      lowStockThreshold: row.lowStockThreshold ?? null,
      reorderPoint: row.reorderPoint ?? null,
      shortfall:
        row.lowStockThreshold !== null && row.lowStockThreshold !== undefined
          ? row.lowStockThreshold - row.quantity
          : 0,
    }))
  }

  private async loadPrimaryImageUrls(productIds: string[]) {
    const normalizedIds = [...new Set(productIds.filter(Boolean))]

    if (normalizedIds.length === 0) {
      return new Map<string, string>()
    }

    const images = await this.productImagesRepo
      .createQueryBuilder('image')
      .where('image.product_id IN (:...productIds)', { productIds: normalizedIds })
      .orderBy('image.sort_order', 'ASC')
      .addOrderBy('image.created_at', 'ASC')
      .getMany()

    const primaryImageUrls = new Map<string, string>()
    for (const image of images) {
      if (!primaryImageUrls.has(image.productId)) {
        primaryImageUrls.set(image.productId, image.url)
      }
    }

    return primaryImageUrls
  }

  private async requireTrackedProduct(productId: string, businessId: string) {
    const level = await this.inventoryLevelsRepo.findOne({
      where: { businessId, productId },
      relations: ['product', 'product.category', 'product.unitOfMeasure'],
    })

    if (!level || !level.product?.trackInventory) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.inventory_not_found'),
        'INVENTORY_NOT_FOUND',
      )
    }

    return level
  }

  private getInventoryRepo(manager?: EntityManager) {
    return manager?.getRepository(InventoryLevel) ?? this.inventoryLevelsRepo
  }

  private getMovementRepo(manager?: EntityManager) {
    return manager?.getRepository(InventoryMovement) ?? this.inventoryMovementsRepo
  }

  private getProductRepo(manager?: EntityManager) {
    return manager?.getRepository(Product) ?? this.productsRepo
  }

  private async createRestockRecord(
    manager: EntityManager,
    input: RestockCreationInput,
  ) {
    const productRepo = manager.getRepository(Product)
    const inventoryRepo = manager.getRepository(InventoryLevel)
    const movementRepo = manager.getRepository(InventoryMovement)
    const recordRepo = manager.getRepository(RestockRecord)
    const itemRepo = manager.getRepository(RestockItem)
    const paymentRepo = manager.getRepository(RestockPayment)

    const normalizedItems = input.items.map((item) => ({
      ...item,
      quantity: this.roundQuantity(item.quantity),
      unitCost:
        item.unitCost === undefined || item.unitCost === null
          ? null
          : this.roundMoney(item.unitCost),
    }))
    const normalizedPayments = (input.payments ?? []).map((payment) => ({
      method: payment.method,
      amount: this.roundMoney(payment.amount),
      mobileMoneyReference: payment.mobileMoneyReference?.trim() || null,
    }))

    const totalComputation = await this.resolveRestockTotal({
      explicitTotalAmount: input.totalAmount,
      explicitTotalCost: input.totalCost,
      items: normalizedItems,
    })

    const amountPaid =
      input.payments === undefined
        ? totalComputation.totalAmount
        : this.roundMoney(normalizedPayments.reduce((sum, payment) => sum + payment.amount, 0))

    if (amountPaid > totalComputation.totalAmount) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.restock_payment_exceeds_total' as never),
        'RESTOCK_PAYMENT_EXCEEDS_TOTAL',
        {
          amountPaid,
          totalAmount: totalComputation.totalAmount,
        },
      )
    }

    const creditAmount = this.roundMoney(totalComputation.totalAmount - amountPaid)
    if (creditAmount > 0 && !input.supplierId) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.supplier_contact_required_for_credit' as never),
        'SUPPLIER_CONTACT_REQUIRED_FOR_CREDIT',
        {
          totalAmount: totalComputation.totalAmount,
          amountPaid,
          creditAmount,
        },
      )
    }

    if (input.supplierId) {
      await this.debtsService.requireCreditContact(
        input.supplierId,
        input.businessId,
        DebtDirection.PAYABLE,
        manager,
      )
    }

    const record = await recordRepo.save(
      recordRepo.create({
        id: input.recordId,
        businessId: input.businessId,
        referenceNumber: input.referenceNumber ?? null,
        supplierId: input.supplierId ?? null,
        supplierName: input.supplierName ?? null,
        totalAmount: totalComputation.totalAmount,
        totalCost: totalComputation.totalAmount,
        amountPaid,
        creditAmount,
        notes: input.notes ?? null,
        performedById: input.performedById ?? null,
        createdAt: input.createdAt,
      }),
    )

    const processedItems: Array<{
      productId: string
      quantity: number
      newQuantity: number
      serialErrors?: RestockSerialResult[]
    }> = []

    for (const item of normalizedItems) {
      const product = await productRepo.findOne({
        where: { id: item.productId, businessId: input.businessId, deletedAt: IsNull() },
      })

      if (!product) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.product_not_found'),
          'PRODUCT_NOT_FOUND',
        )
      }

      if (!product.trackInventory) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.product_inventory_tracking_required' as never),
          'PRODUCT_INVENTORY_TRACKING_REQUIRED',
          { productId: item.productId, productName: product.name },
        )
      }

      // Serialised products: create one unit per serial number (no level/movement).
      if (product.isSerialized) {
        const { created, errors } = await this.restockSerialUnits(
          manager,
          item,
          product,
          input,
          record.id,
        )
        await itemRepo.save(
          itemRepo.create({
            id: item.id,
            restockRecordId: record.id,
            productId: product.id,
            quantity: created,
            unitCost: item.unitCost,
            createdAt: input.createdAt,
          }),
        )
        processedItems.push({
          productId: product.id,
          quantity: created,
          newQuantity: created,
          serialErrors: errors,
        })
        continue
      }

      const level = await inventoryRepo.findOne({
        where: { businessId: input.businessId, productId: product.id },
      })
      const quantityBefore = Number(level?.quantity ?? 0)
      const quantityAfter = this.roundQuantity(quantityBefore + item.quantity)

      if (!level) {
        await inventoryRepo.save(
          inventoryRepo.create({
            businessId: input.businessId,
            productId: product.id,
            quantity: quantityAfter,
            lastRestockAt: input.createdAt,
            createdAt: input.createdAt,
            updatedAt: input.updatedAt ?? input.createdAt,
          }),
        )
      } else {
        await inventoryRepo.update(level.id, {
          quantity: quantityAfter,
          lastRestockAt: input.createdAt,
          updatedAt: input.updatedAt ?? input.createdAt,
        })
      }

      await itemRepo.save(
        itemRepo.create({
          id: item.id,
          restockRecordId: record.id,
          productId: product.id,
          quantity: item.quantity,
          unitCost: item.unitCost,
          createdAt: input.createdAt,
        }),
      )

      await movementRepo.save(
        movementRepo.create({
          id: item.movementId ?? undefined,
          businessId: input.businessId,
          productId: product.id,
          type: MovementType.RESTOCK_IN,
          quantityChange: item.quantity,
          quantityBefore,
          quantityAfter,
          referenceType: 'restock',
          referenceId: record.id,
          notes: input.notes ?? null,
          performedById: input.performedById ?? null,
          createdAt: input.createdAt,
        }),
      )

      processedItems.push({
        productId: product.id,
        quantity: item.quantity,
        newQuantity: quantityAfter,
      })
    }

    if (normalizedPayments.length > 0) {
      await paymentRepo.save(
        normalizedPayments.map((payment) =>
          paymentRepo.create({
            restockRecordId: record.id,
            businessId: input.businessId,
            method: payment.method,
            amount: payment.amount,
            mobileMoneyReference: payment.mobileMoneyReference,
          }),
        ),
      )
    }

    if (creditAmount > 0 && input.supplierId) {
      await this.debtsService.createSourceDebt(manager, {
        businessId: input.businessId,
        contactId: input.supplierId,
        direction: DebtDirection.PAYABLE,
        sourceType: DebtSource.RESTOCK,
        sourceId: record.id,
        sourceReference: input.referenceNumber ?? record.id,
        originalAmount: creditAmount,
        notes: input.notes ?? null,
        createdAt: input.createdAt,
      })
    }

    return {
      ...record,
      items: processedItems,
      payments: normalizedPayments,
    }
  }

  /**
   * Create one serial unit per supplied serial number for a serialised product.
   * Validates format (Luhn for IMEI), rejects in-stock duplicates, and re-stocks
   * previously SOLD/RETURNED units. Returns per-serial errors for the rest.
   */
  private async restockSerialUnits(
    manager: EntityManager,
    item: RestockInputItem,
    product: Product,
    input: RestockCreationInput,
    restockId: string,
  ): Promise<{ created: number; errors: RestockSerialResult[] }> {
    const serialUnitRepo = manager.getRepository(ProductSerialUnit)
    const serialType = (product.serialType ?? 'SERIAL_NUMBER') as
      | 'IMEI'
      | 'SERIAL_NUMBER'
      | 'BARCODE'
    const serialNumbers = item.serialNumbers ?? []
    const warrantyMonths = item.warrantyMonths ?? product.warrantyMonths ?? null
    const warrantyExpiresAt =
      warrantyMonths && warrantyMonths > 0 ? this.addMonths(input.createdAt, warrantyMonths) : null

    const errors: RestockSerialResult[] = []
    let created = 0
    const seenInBatch = new Set<string>()

    for (const raw of serialNumbers) {
      const serialNumber = raw.trim()
      if (!serialNumber || seenInBatch.has(serialNumber)) {
        continue
      }
      seenInBatch.add(serialNumber)

      if (!validateSerialNumber(serialNumber, serialType)) {
        errors.push({ serialNumber, reason: 'INVALID_FORMAT' })
        continue
      }

      const existing = await serialUnitRepo.findOne({
        where: { businessId: input.businessId, serialNumber },
        withDeleted: true,
      })

      if (existing) {
        if (
          existing.status === SerialUnitStatus.IN_STOCK ||
          existing.status === SerialUnitStatus.RESERVED
        ) {
          errors.push({ serialNumber, reason: 'DUPLICATE_IN_STOCK' })
          continue
        }
        // Legitimate re-stock of a previously sold/returned/damaged unit.
        await serialUnitRepo.update(
          { id: existing.id },
          {
            status: SerialUnitStatus.IN_STOCK,
            variantId: item.variantId ?? null,
            restockId,
            purchasePrice: item.unitCost ?? 0,
            supplierId: input.supplierId ?? null,
            warrantyExpiresAt,
            saleId: null,
            saleItemId: null,
            soldAt: null,
            customerId: null,
            reservedAt: null,
            reservedBy: null,
            deletedAt: null,
          },
        )
        created += 1
        continue
      }

      await serialUnitRepo.save(
        serialUnitRepo.create({
          businessId: input.businessId,
          productId: product.id,
          variantId: item.variantId ?? null,
          serialNumber,
          serialType: serialType as SerialType,
          status: SerialUnitStatus.IN_STOCK,
          purchasePrice: item.unitCost ?? 0,
          supplierId: input.supplierId ?? null,
          restockId,
          warrantyExpiresAt,
        }),
      )
      created += 1
    }

    return { created, errors }
  }

  private addMonths(date: Date, months: number): Date {
    const result = new Date(date)
    result.setMonth(result.getMonth() + months)
    return result
  }

  private async resolveRestockTotal(input: {
    explicitTotalAmount?: number | null
    explicitTotalCost?: number | null
    items: Array<{ quantity: number; unitCost?: number | null }>
  }) {
    const explicitTotal =
      input.explicitTotalAmount ?? input.explicitTotalCost ?? null
    const normalizedExplicitTotal =
      explicitTotal === null || explicitTotal === undefined ? null : this.roundMoney(explicitTotal)
    const allUnitCostsPresent = input.items.every(
      (item) => item.unitCost !== null && item.unitCost !== undefined,
    )
    const computedTotal = allUnitCostsPresent
      ? this.roundMoney(
          input.items.reduce(
            (sum, item) => sum + item.quantity * (item.unitCost ?? 0),
            0,
          ),
        )
      : null

    if (computedTotal === null && normalizedExplicitTotal === null) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.restock_total_amount_required' as never),
        'RESTOCK_TOTAL_AMOUNT_REQUIRED',
      )
    }

    if (
      computedTotal !== null &&
      normalizedExplicitTotal !== null &&
      computedTotal !== normalizedExplicitTotal
    ) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.restock_total_amount_mismatch' as never),
        'RESTOCK_TOTAL_AMOUNT_MISMATCH',
        {
          computedTotal,
          explicitTotal: normalizedExplicitTotal,
        },
      )
    }

    return {
      totalAmount: normalizedExplicitTotal ?? computedTotal ?? 0,
    }
  }

  private async findInventoryLevelForUpdate(
    inventoryRepo: Repository<InventoryLevel>,
    businessId: string,
    productId: string,
    variantId?: string | null,
  ) {
    const qb = inventoryRepo
      .createQueryBuilder('inventory')
      .where('inventory.business_id = :businessId', { businessId })
      .andWhere('inventory.product_id = :productId', { productId })

    if (variantId) {
      qb.andWhere('inventory.variant_id = :variantId', { variantId })
    } else {
      qb.andWhere('inventory.variant_id IS NULL')
    }

    if (inventoryRepo.manager.queryRunner?.isTransactionActive) {
      qb.setLock('pessimistic_write')
    }

    return qb.getOne()
  }

  private async findInventoryLevelsForUpdate(
    inventoryRepo: Repository<InventoryLevel>,
    businessId: string,
    productIds: string[],
  ) {
    if (productIds.length === 0) {
      return []
    }

    const qb = inventoryRepo
      .createQueryBuilder('inventory')
      .where('inventory.business_id = :businessId', { businessId })
      .andWhere('inventory.product_id IN (:...productIds)', { productIds })

    if (inventoryRepo.manager.queryRunner?.isTransactionActive) {
      qb.setLock('pessimistic_write')
    }

    return qb.getMany()
  }

  private async loadMovementReferenceInfo(
    businessId: string,
    movements: Array<{ referenceType?: string | null; referenceId?: string | null }>,
  ): Promise<Map<string, InventoryMovementReferenceInfo>> {
    const result = new Map<string, InventoryMovementReferenceInfo>()
    const saleIds = [
      ...new Set(
        movements
          .filter(
            (movement) =>
              movement.referenceId &&
              (movement.referenceType === 'sale' || movement.referenceType === 'sale_void'),
          )
          .map((movement) => movement.referenceId as string),
      ),
    ]
    const restockIds = [
      ...new Set(
        movements
          .filter((movement) => movement.referenceId && movement.referenceType === 'restock')
          .map((movement) => movement.referenceId as string),
      ),
    ]

    if (saleIds.length > 0) {
      const sales = await this.dataSource
        .getRepository(Sale)
        .createQueryBuilder('sale')
        .select('sale.id', 'id')
        .addSelect('sale.sale_number', 'sale_number')
        .addSelect('sale.customer_name', 'customer_name')
        .where('sale.business_id = :businessId', { businessId })
        .andWhere('sale.id IN (:...ids)', { ids: saleIds })
        .getRawMany<{ id: string; sale_number: string | null; customer_name: string | null }>()

      for (const sale of sales) {
        const info = {
          label: sale.sale_number?.trim() || sale.id,
          sourceName: sale.customer_name?.trim() || null,
        }
        result.set(this.getMovementReferenceLookupKey('sale', sale.id), info)
        result.set(this.getMovementReferenceLookupKey('sale_void', sale.id), info)
      }
    }

    if (restockIds.length > 0) {
      const restocks = await this.dataSource
        .getRepository(RestockRecord)
        .createQueryBuilder('restock')
        .select('restock.id', 'id')
        .addSelect('restock.reference_number', 'reference_number')
        .addSelect('restock.supplier_name', 'supplier_name')
        .where('restock.business_id = :businessId', { businessId })
        .andWhere('restock.id IN (:...ids)', { ids: restockIds })
        .getRawMany<{ id: string; reference_number: string | null; supplier_name: string | null }>()

      for (const restock of restocks) {
        result.set(this.getMovementReferenceLookupKey('restock', restock.id), {
          label: restock.reference_number?.trim() || restock.id,
          sourceName: restock.supplier_name?.trim() || null,
        })
      }
    }

    return result
  }

  private buildInventoryBinSummary(
    currentBalance: number,
    movements: InventoryMovement[],
    referenceInfo: Map<string, InventoryMovementReferenceInfo>,
  ): InventoryBinSummary {
    let totalChange = 0
    let totalRestocked = 0
    let totalSold = 0
    let totalAdjusted = 0

    for (const movement of movements) {
      totalChange += movement.quantityChange

      if (movement.type === MovementType.RESTOCK_IN) {
        totalRestocked += Math.abs(movement.quantityChange)
        continue
      }

      if (movement.type === MovementType.SALE) {
        totalSold += Math.abs(movement.quantityChange)
        continue
      }

      if (movement.type === MovementType.OPENING_STOCK) {
        continue
      }

      totalAdjusted += movement.quantityChange
    }

    const lastRestock =
      movements.find((movement) => movement.type === MovementType.RESTOCK_IN) ?? null
    const lastRestockInfo =
      lastRestock === null
        ? null
        : referenceInfo.get(
            this.getMovementReferenceLookupKey(lastRestock.referenceType, lastRestock.referenceId),
          ) ?? null

    return {
      openingStock: this.roundQuantity(currentBalance - totalChange),
      totalRestocked: this.roundQuantity(totalRestocked),
      totalSold: this.roundQuantity(totalSold),
      totalAdjusted: this.roundQuantity(totalAdjusted),
      currentBalance: this.roundQuantity(currentBalance),
      lastRestockAt: lastRestock?.createdAt?.toISOString?.() ?? null,
      lastRestockQuantity:
        lastRestock === null ? null : this.roundQuantity(Math.abs(lastRestock.quantityChange)),
      lastRestockReferenceLabel: lastRestockInfo?.label ?? null,
      lastRestockSourceName: lastRestockInfo?.sourceName ?? null,
      movementWindowDays: 30,
      trend: this.buildMovementTrend(movements, 30),
    }
  }

  private buildMovementTrend(
    movements: InventoryMovement[],
    movementWindowDays: number,
  ): InventoryMovementTrendPoint[] {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const points = new Map<string, InventoryMovementTrendPoint>()

    for (let index = movementWindowDays - 1; index >= 0; index -= 1) {
      const date = new Date(today)
      date.setUTCDate(today.getUTCDate() - index)
      const key = date.toISOString().slice(0, 10)
      points.set(key, {
        date: key,
        stockIn: 0,
        stockOut: 0,
      })
    }

    for (const movement of movements) {
      const key = movement.createdAt.toISOString().slice(0, 10)
      const point = points.get(key)
      if (!point) {
        continue
      }

      if (movement.quantityChange > 0) {
        point.stockIn = this.roundQuantity(point.stockIn + movement.quantityChange)
      } else if (movement.quantityChange < 0) {
        point.stockOut = this.roundQuantity(point.stockOut + Math.abs(movement.quantityChange))
      }
    }

    return Array.from(points.values())
  }

  private getMovementReferenceLookupKey(referenceType?: string | null, referenceId?: string | null) {
    return `${referenceType ?? 'none'}:${referenceId ?? 'none'}`
  }

  private parseOptionalDate(value?: string | null) {
    if (!value) {
      return null
    }

    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  private roundMoney(value: number) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100
  }

  private roundQuantity(value: number) {
    return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000
  }

  private normalizeOptionalUuid(value: string | null | undefined) {
    const trimmed = value?.trim()
    if (!trimmed) {
      return null
    }

    if (!this.isUuid(trimmed)) {
      throw new AppBadRequestException('Restock supplier id is invalid.', 'INVALID_RESTOCK_SUPPLIER_ID')
    }

    return trimmed
  }

  private isUuid(value: string | null | undefined): value is string {
    return Boolean(
      value &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value,
        ),
    )
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('InventoryService error', 'InventoryService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    this.logger.error('InventoryService unexpected error', 'InventoryService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'INVENTORY_SERVICE_ERROR',
      { action },
    )
  }
}
