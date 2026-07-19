import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, ILike, Repository } from 'typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import {
  SerialType,
  SerialUnitStatus,
  type AddSerialUnitsRequest,
  type AuditContext,
  type RetireSerialUnitRequest,
  type SerialUnitsQuery,
  type UpdateSerialUnitRequest,
} from '@biztrack/types'
import { validateSerialNumber } from '@biztrack/validators'
import { I18nService } from 'nestjs-i18n'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { InventoryMovement, MovementType } from '@/entities/inventory-movement.entity'
import { Product } from '@/entities/product.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import { ProductVariant } from '@/entities/product-variant.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { AuditService } from '@/modules/audit/audit.service'

/**
 * Manage the individually-tracked units of a serialised product (Phase 4 —
 * movement-based stock). Stock for a serialised product is the count of IN_STOCK
 * units, so:
 *  - adding a unit is a stock-in  → writes an inventory movement
 *  - retiring a unit is a stock-out → writes an inventory movement (with a reason)
 *  - editing a unit's serial number is a correction → NO movement
 * Every mutation is recorded on the audit trail with the full actor context.
 */
@Injectable()
export class ProductSerialUnitsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductSerialUnit)
    private readonly serialUnitsRepo: Repository<ProductSerialUnit>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepo: Repository<ProductVariant>,
    @InjectRepository(InventoryMovement)
    private readonly movementsRepo: Repository<InventoryMovement>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('ProductSerialUnitsService')
  }

  async list(productId: string, businessId: string, query: SerialUnitsQuery) {
    try {
      await this.requireSerializedProduct(productId, businessId)

      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)

      const where: Record<string, unknown> = { businessId, productId }
      if (query.status) where.status = query.status
      if (query.variantId) where.variantId = query.variantId
      const search = query.search?.trim()
      if (search) where.serialNumber = ILike(`%${search}%`)

      const [data, total] = await this.serialUnitsRepo.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      })

      return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
    } catch (error) {
      return this.handleServiceError('list', error, { productId, businessId })
    }
  }

  async add(
    productId: string,
    businessId: string,
    dto: AddSerialUnitsRequest,
    context: AuditContext,
  ): Promise<ProductSerialUnit[]> {
    try {
      const product = await this.requireSerializedProduct(productId, businessId)
      const serialType = (product.serialType ?? SerialType.SERIAL_NUMBER) as SerialType

      // Validate variant linkage up front (all or nothing).
      for (const unit of dto.units) {
        await this.assertVariantLinkage(product, unit.variantId ?? null, businessId)
      }

      const created = await this.dataSource.transaction(async (manager) => {
        const serialRepo = manager.getRepository(ProductSerialUnit)
        const movementRepo = manager.getRepository(InventoryMovement)

        const quantityBefore = await serialRepo.count({
          where: { businessId, productId, status: SerialUnitStatus.IN_STOCK },
        })

        const saved: ProductSerialUnit[] = []
        const seen = new Set<string>()
        for (const unit of dto.units) {
          const serialNumber = unit.serialNumber.trim()
          if (!serialNumber || seen.has(serialNumber)) continue
          seen.add(serialNumber)

          if (!validateSerialNumber(serialNumber, serialType)) {
            throw new AppBadRequestException(
              await this.i18n.translate('errors.serial_invalid_format', {
                args: { serial: serialNumber, type: serialType },
              }),
              'SERIAL_INVALID_FORMAT',
            )
          }

          const existing = await serialRepo.findOne({
            where: { businessId, serialNumber },
            withDeleted: true,
          })
          if (existing) {
            const live =
              !existing.deletedAt &&
              (existing.status === SerialUnitStatus.IN_STOCK ||
                existing.status === SerialUnitStatus.RESERVED)
            if (live) {
              throw new AppBadRequestException(
                await this.i18n.translate('errors.serial_duplicate_in_stock', {
                  args: { serial: serialNumber },
                }),
                'SERIAL_DUPLICATE_IN_STOCK',
              )
            }
            // Revive a previously retired/sold/returned unit back into stock.
            await serialRepo.update(
              { id: existing.id },
              {
                status: SerialUnitStatus.IN_STOCK,
                variantId: unit.variantId ?? null,
                saleId: null,
                saleItemId: null,
                soldAt: null,
                customerId: null,
                reservedAt: null,
                reservedBy: null,
                deletedAt: null,
              },
            )
            const revived = await serialRepo.findOne({ where: { id: existing.id } })
            if (revived) saved.push(revived)
            continue
          }

          const unitEntity = await serialRepo.save(
            serialRepo.create({
              businessId,
              productId,
              variantId: unit.variantId ?? null,
              serialNumber,
              serialType,
              status: SerialUnitStatus.IN_STOCK,
            }),
          )
          saved.push(unitEntity)
        }

        if (saved.length > 0) {
          const isOpening = (await movementRepo.count({ where: { businessId, productId } })) === 0
          await movementRepo.save(
            movementRepo.create({
              businessId,
              productId,
              type: isOpening ? MovementType.OPENING_STOCK : MovementType.MANUAL_ADJUSTMENT,
              quantityChange: saved.length,
              quantityBefore,
              quantityAfter: quantityBefore + saved.length,
              referenceType: 'serial_unit',
              referenceId: productId,
              notes: dto.notes?.trim() || `Added ${saved.length} serial unit(s)`,
              performedById: context.actorId ?? null,
            }),
          )
        }

        return saved
      })

      for (const unit of created) {
        this.auditService.log(context, {
          action: 'CREATE',
          entityType: 'product_serial_unit',
          entityId: unit.id,
          entityLabel: unit.serialNumber,
          changes: {
            before: null,
            after: {
              productId,
              variantId: unit.variantId ?? null,
              serialNumber: unit.serialNumber,
              status: unit.status,
            },
          },
        })
      }

      return created
    } catch (error) {
      return this.handleServiceError('add', error, { productId, businessId })
    }
  }

  /** Correct a unit's serial number. No quantity change → no movement. */
  async updateSerialNumber(
    productId: string,
    unitId: string,
    businessId: string,
    dto: UpdateSerialUnitRequest,
    context: AuditContext,
  ): Promise<ProductSerialUnit> {
    try {
      const product = await this.requireSerializedProduct(productId, businessId)
      const serialType = (product.serialType ?? SerialType.SERIAL_NUMBER) as SerialType
      const unit = await this.requireUnit(productId, unitId, businessId)
      const serialNumber = dto.serialNumber.trim()

      if (serialNumber !== unit.serialNumber) {
        if (!validateSerialNumber(serialNumber, serialType)) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.serial_invalid_format', {
              args: { serial: serialNumber, type: serialType },
            }),
            'SERIAL_INVALID_FORMAT',
          )
        }
        const clash = await this.serialUnitsRepo.findOne({
          where: { businessId, serialNumber },
          withDeleted: true,
        })
        if (clash && clash.id !== unit.id) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.serial_duplicate_in_stock', {
              args: { serial: serialNumber },
            }),
            'SERIAL_DUPLICATE_IN_STOCK',
          )
        }
      }

      const before = unit.serialNumber
      await this.serialUnitsRepo.update({ id: unit.id }, { serialNumber })
      const updated = await this.requireUnit(productId, unitId, businessId)

      this.auditService.log(context, {
        action: 'UPDATE',
        entityType: 'product_serial_unit',
        entityId: unit.id,
        entityLabel: serialNumber,
        changes: { before: { serialNumber: before }, after: { serialNumber } },
      })

      return updated
    } catch (error) {
      return this.handleServiceError('updateSerialNumber', error, { productId, unitId, businessId })
    }
  }

  /** Retire a unit from stock (a stock-out). Only IN_STOCK units can be retired. */
  async retire(
    productId: string,
    unitId: string,
    businessId: string,
    dto: RetireSerialUnitRequest,
    context: AuditContext,
  ): Promise<void> {
    try {
      await this.requireSerializedProduct(productId, businessId)
      const unit = await this.requireUnit(productId, unitId, businessId)
      if (unit.status !== SerialUnitStatus.IN_STOCK) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.serial_unit_not_in_stock'),
          'SERIAL_UNIT_NOT_IN_STOCK',
        )
      }
      const reason = dto.reason.trim()

      await this.dataSource.transaction(async (manager) => {
        const serialRepo = manager.getRepository(ProductSerialUnit)
        const movementRepo = manager.getRepository(InventoryMovement)
        const quantityBefore = await serialRepo.count({
          where: { businessId, productId, status: SerialUnitStatus.IN_STOCK },
        })

        await serialRepo.update(
          { id: unit.id },
          { status: SerialUnitStatus.DAMAGED, notes: reason },
        )
        await serialRepo.softDelete({ id: unit.id })

        await movementRepo.save(
          movementRepo.create({
            businessId,
            productId,
            type: MovementType.MANUAL_ADJUSTMENT,
            quantityChange: -1,
            quantityBefore,
            quantityAfter: quantityBefore - 1,
            referenceType: 'serial_unit',
            referenceId: unit.id,
            notes: reason,
            performedById: context.actorId ?? null,
          }),
        )
      })

      this.auditService.log(context, {
        action: 'DELETE',
        entityType: 'product_serial_unit',
        entityId: unit.id,
        entityLabel: unit.serialNumber,
        changes: {
          before: { serialNumber: unit.serialNumber, status: unit.status, retireReason: reason },
          after: null,
        },
      })
    } catch (error) {
      return this.handleServiceError('retire', error, { productId, unitId, businessId })
    }
  }

  // ---- internals -----------------------------------------------------------

  private async requireSerializedProduct(productId: string, businessId: string): Promise<Product> {
    const product = await this.productsRepo.findOne({ where: { id: productId, businessId } })
    if (!product) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.product_not_found'),
        'PRODUCT_NOT_FOUND',
      )
    }
    if (!product.isSerialized) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.product_not_serialized'),
        'PRODUCT_NOT_SERIALIZED',
      )
    }
    return product
  }

  private async requireUnit(
    productId: string,
    unitId: string,
    businessId: string,
  ): Promise<ProductSerialUnit> {
    const unit = await this.serialUnitsRepo.findOne({
      where: { id: unitId, productId, businessId },
      withDeleted: true,
    })
    if (!unit) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.serial_unit_not_found'),
        'SERIAL_UNIT_NOT_FOUND',
      )
    }
    return unit
  }

  private async assertVariantLinkage(
    product: Product,
    variantId: string | null,
    businessId: string,
  ): Promise<void> {
    if (product.hasVariants) {
      if (!variantId) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.serial_variant_required'),
          'SERIAL_VARIANT_REQUIRED',
        )
      }
      const variant = await this.variantsRepo.findOne({
        where: { id: variantId, productId: product.id, businessId },
      })
      if (!variant) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.serial_variant_invalid'),
          'SERIAL_VARIANT_INVALID',
        )
      }
    } else if (variantId) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.serial_variant_invalid'),
        'SERIAL_VARIANT_INVALID',
      )
    }
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('ProductSerialUnitsService error', 'ProductSerialUnitsService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }
    this.logger.error('ProductSerialUnitsService unexpected error', 'ProductSerialUnitsService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })
    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'SERIAL_UNITS_SERVICE_ERROR',
      { action },
    )
  }
}
