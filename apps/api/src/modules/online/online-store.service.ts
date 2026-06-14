import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { generateSlug } from '@biztrack/utils'
import type { CreateOnlineStoreRequest, ProductOnlineFields, UpdateOnlineStoreRequest } from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppConflictException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { OnlineStore } from '@/entities/online-store.entity'
import { Product } from '@/entities/product.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import type { Logger, LogMetadata } from '@biztrack/logger'

@Injectable()
export class OnlineStoreService {
  constructor(
    @InjectRepository(OnlineStore)
    private readonly storesRepo: Repository<OnlineStore>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('OnlineStoreService')
  }

  async getStore(businessId: string): Promise<OnlineStore | null> {
    return this.storesRepo.findOne({ where: { businessId, deletedAt: IsNull() } })
  }

  async createStore(businessId: string, dto: CreateOnlineStoreRequest): Promise<OnlineStore> {
    try {
      const existing = await this.storesRepo.findOne({ where: { businessId } })
      if (existing) {
        throw new AppConflictException(
          await this.i18n.translate('errors.online_store_exists'),
          'ONLINE_STORE_EXISTS',
        )
      }
      const storeSlug = await this.generateUniqueSlug(dto.storeSlug?.trim() || dto.storeName)
      const store = this.storesRepo.create({
        businessId,
        storeName: dto.storeName.trim(),
        storeSlug,
        tagline: dto.tagline?.trim() ?? null,
        logoUrl: dto.logoUrl?.trim() ?? null,
        bannerUrl: dto.bannerUrl?.trim() ?? null,
        primaryColor: dto.primaryColor ?? '#1D9E75',
        phone: dto.phone?.trim() ?? null,
        email: dto.email?.trim() ?? null,
        address: dto.address?.trim() ?? null,
        city: dto.city?.trim() ?? null,
        whatsappNumber: dto.whatsappNumber?.trim() ?? null,
      })
      return await this.storesRepo.save(store)
    } catch (error) {
      return this.handleServiceError('createStore', error, { businessId })
    }
  }

  async updateStore(businessId: string, dto: UpdateOnlineStoreRequest): Promise<OnlineStore> {
    try {
      const store = await this.requireStore(businessId)
      const merged = this.storesRepo.merge(store, {
        storeName: dto.storeName?.trim() ?? store.storeName,
        tagline: dto.tagline === undefined ? store.tagline : (dto.tagline?.trim() ?? null),
        logoUrl: dto.logoUrl === undefined ? store.logoUrl : (dto.logoUrl?.trim() ?? null),
        bannerUrl: dto.bannerUrl === undefined ? store.bannerUrl : (dto.bannerUrl?.trim() ?? null),
        primaryColor: dto.primaryColor ?? store.primaryColor,
        phone: dto.phone === undefined ? store.phone : (dto.phone?.trim() ?? null),
        email: dto.email === undefined ? store.email : (dto.email?.trim() ?? null),
        address: dto.address === undefined ? store.address : (dto.address?.trim() ?? null),
        city: dto.city === undefined ? store.city : (dto.city?.trim() ?? null),
        whatsappNumber:
          dto.whatsappNumber === undefined ? store.whatsappNumber : (dto.whatsappNumber?.trim() ?? null),
        isActive: dto.isActive ?? store.isActive,
        showOutOfStock: dto.showOutOfStock ?? store.showOutOfStock,
        allowOrderNotes: dto.allowOrderNotes ?? store.allowOrderNotes,
        minOrderAmount: dto.minOrderAmount === undefined ? store.minOrderAmount : dto.minOrderAmount,
        paymentCashOnDelivery: dto.paymentCashOnDelivery ?? store.paymentCashOnDelivery,
        paymentMtnMomo: dto.paymentMtnMomo ?? store.paymentMtnMomo,
        paymentOrangeMoney: dto.paymentOrangeMoney ?? store.paymentOrangeMoney,
        paymentCard: dto.paymentCard ?? store.paymentCard,
      })
      return await this.storesRepo.save(merged)
    } catch (error) {
      return this.handleServiceError('updateStore', error, { businessId })
    }
  }

  /** Toggle/update a product's online-store fields (Phase 3I). */
  async updateProductOnline(
    businessId: string,
    productId: string,
    dto: ProductOnlineFields,
  ): Promise<Product> {
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
      await this.productsRepo.update(productId, {
        isPublishedOnline: dto.isPublishedOnline ?? product.isPublishedOnline,
        onlineDescription:
          dto.onlineDescription === undefined
            ? product.onlineDescription
            : (dto.onlineDescription ?? null),
        metaTitle: dto.metaTitle === undefined ? product.metaTitle : (dto.metaTitle ?? null),
        metaDescription:
          dto.metaDescription === undefined ? product.metaDescription : (dto.metaDescription ?? null),
        onlineSortOrder: dto.onlineSortOrder ?? product.onlineSortOrder,
        onlineStockReserve: dto.onlineStockReserve ?? product.onlineStockReserve,
        updatedAt: new Date(),
      })
      return (await this.productsRepo.findOne({ where: { id: productId, businessId } })) as Product
    } catch (error) {
      return this.handleServiceError('updateProductOnline', error, { businessId, productId })
    }
  }

  private async requireStore(businessId: string): Promise<OnlineStore> {
    const store = await this.getStore(businessId)
    if (!store) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.online_store_not_found'),
        'ONLINE_STORE_NOT_FOUND',
      )
    }
    return store
  }

  private async generateUniqueSlug(source: string): Promise<string> {
    const base = generateSlug(source) || 'store'
    let candidate = base
    let suffix = 1
    while (await this.storesRepo.findOne({ where: { storeSlug: candidate } })) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }
    return candidate
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('OnlineStoreService error', 'OnlineStoreService', {
        action,
        code: error.code,
        ...(metadata ?? {}),
      })
      throw error
    }
    this.logger.error('OnlineStoreService unexpected error', 'OnlineStoreService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })
    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'ONLINE_STORE_SERVICE_ERROR',
      { action },
    )
  }
}
