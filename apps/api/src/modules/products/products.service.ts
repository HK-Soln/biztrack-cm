import { Inject, Injectable } from '@nestjs/common'
import { IsNull } from 'typeorm'
import { CreateProductDto } from './dto/create-product.dto'
import { UpdateProductDto } from './dto/update-product.dto'
import { ProductsRepository } from './repositories/products.repository'
import { ProductCategoriesRepository } from './repositories/product-categories.repository'
import type { Logger, LogMetadata } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppConflictException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'

@Injectable()
export class ProductsService {
  constructor(
    private productsRepo: ProductsRepository,
    private categoriesRepo: ProductCategoriesRepository,
    private i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private logger: Logger,
  ) {
    this.logger.setContext('ProductsService')
  }

  async create(businessId: string, dto: CreateProductDto) {
    this.logger.debug('Create product', 'ProductsService', { businessId, name: dto.name })

    try {
      if (dto.barcode) {
        const existing = await this.productsRepo.findOne({
          where: { businessId, barcode: dto.barcode },
          withDeleted: true,
        })
        if (existing && !existing.deletedAt) {
          throw new AppConflictException(
            await this.i18n.translate('errors.barcode_in_use'),
            'BARCODE_IN_USE',
          )
        }
      }

      const product = this.productsRepo.create({ ...dto, businessId })
      return this.productsRepo.save(product)
    } catch (error) {
      return this.handleServiceError('create', error, { businessId, name: dto.name })
    }
  }

  async findAll(businessId: string, options?: { includeDeleted?: boolean; categoryId?: string }) {
    this.logger.debug('Find all products', 'ProductsService', { businessId })

    try {
      const where: {
        businessId: string
        categoryId?: string
        deletedAt?: Date | ReturnType<typeof IsNull>
      } = { businessId }
      if (!options?.includeDeleted) where.deletedAt = IsNull()
      if (options?.categoryId) where.categoryId = options.categoryId

      return this.productsRepo.find({
        where,
        relations: ['category'],
        order: { name: 'ASC' },
        withDeleted: options?.includeDeleted ?? false,
      })
    } catch (error) {
      return this.handleServiceError('findAll', error, { businessId })
    }
  }

  async findById(id: string, businessId: string) {
    this.logger.debug('Find product by id', 'ProductsService', { id, businessId })

    try {
      const product = await this.productsRepo.findOne({
        where: { id, businessId },
        relations: ['category'],
      })
      if (!product) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.product_not_found'),
          'PRODUCT_NOT_FOUND',
        )
      }
      return product
    } catch (error) {
      return this.handleServiceError('findById', error, { id, businessId })
    }
  }

  async findByBarcode(barcode: string, businessId: string) {
    this.logger.debug('Find product by barcode', 'ProductsService', { barcode, businessId })

    try {
      const product = await this.productsRepo.findOne({
        where: { businessId, barcode },
      })
      if (!product) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.product_not_found'),
          'PRODUCT_NOT_FOUND',
        )
      }
      return product
    } catch (error) {
      return this.handleServiceError('findByBarcode', error, { barcode, businessId })
    }
  }

  async update(id: string, businessId: string, dto: UpdateProductDto) {
    this.logger.debug('Update product', 'ProductsService', { id, businessId })

    try {
      await this.findById(id, businessId)
      await this.productsRepo.update(id, { ...dto, updatedAt: new Date() })
      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('update', error, { id, businessId })
    }
  }

  async softDelete(id: string, businessId: string) {
    this.logger.debug('Soft delete product', 'ProductsService', { id, businessId })

    try {
      await this.findById(id, businessId)
      await this.productsRepo.update(id, { deletedAt: new Date(), updatedAt: new Date() })
    } catch (error) {
      return this.handleServiceError('softDelete', error, { id, businessId })
    }
  }

  async getLowStockProducts(businessId: string) {
    this.logger.debug('Get low stock products', 'ProductsService', { businessId })

    try {
      return this.productsRepo
        .createQueryBuilder('p')
        .where('p.businessId = :businessId', { businessId })
        .andWhere('p.deletedAt IS NULL')
        .andWhere('p.isActive = true')
        .andWhere('p.stockQuantity <= p.lowStockThreshold')
        .orderBy('p.stockQuantity', 'ASC')
        .getMany()
    } catch (error) {
      return this.handleServiceError('getLowStockProducts', error, { businessId })
    }
  }

  // Category methods
  async createCategory(businessId: string, name: string) {
    this.logger.debug('Create category', 'ProductsService', { businessId, name })

    try {
      const category = this.categoriesRepo.create({ businessId, name })
      return this.categoriesRepo.save(category)
    } catch (error) {
      return this.handleServiceError('createCategory', error, { businessId, name })
    }
  }

  async findCategories(businessId: string) {
    this.logger.debug('Find categories', 'ProductsService', { businessId })

    try {
      return this.categoriesRepo.find({
        where: { businessId, deletedAt: IsNull() },
        order: { name: 'ASC' },
      })
    } catch (error) {
      return this.handleServiceError('findCategories', error, { businessId })
    }
  }

  async deleteCategory(id: string, businessId: string) {
    this.logger.debug('Delete category', 'ProductsService', { id, businessId })

    try {
      const category = await this.categoriesRepo.findOne({ where: { id, businessId } })
      if (!category) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.category_not_found'),
          'CATEGORY_NOT_FOUND',
        )
      }
      await this.categoriesRepo.update(id, { deletedAt: new Date(), updatedAt: new Date() })
    } catch (error) {
      return this.handleServiceError('deleteCategory', error, { id, businessId })
    }
  }

  private async handleServiceError(action: string, error: unknown, metadata?: LogMetadata): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('ProductsService error', 'ProductsService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    this.logger.error('ProductsService unexpected error', 'ProductsService', {
      action,
      message,
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'PRODUCTS_SERVICE_ERROR',
      { action },
    )
  }
}
