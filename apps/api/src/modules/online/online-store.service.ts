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
import { Business } from '@/entities/business.entity'
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
    @InjectRepository(Business)
    private readonly businessesRepo: Repository<Business>,
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
      // Seed the storefront from the business profile captured at onboarding, so the
      // merchant starts with name/contact/branding already filled in (overridable by the dto).
      const business = await this.businessesRepo.findOne({ where: { id: businessId } })
      const storeName = dto.storeName?.trim() || business?.name || 'My store'
      const storeSlug = await this.generateUniqueSlug(dto.storeSlug?.trim() || storeName)
      const store = this.storesRepo.create({
        businessId,
        storeName,
        storeSlug,
        tagline: dto.tagline?.trim() ?? business?.description ?? null,
        logoUrl: dto.logoUrl?.trim() ?? business?.logoUrl ?? null,
        bannerUrl: dto.bannerUrl?.trim() ?? null,
        primaryColor: dto.primaryColor ?? '#1D9E75',
        phone: dto.phone?.trim() ?? business?.phone ?? null,
        email: dto.email?.trim() ?? business?.email ?? null,
        address: dto.address?.trim() ?? business?.address ?? null,
        city: dto.city?.trim() ?? business?.city ?? null,
        whatsappNumber: dto.whatsappNumber?.trim() ?? business?.phone ?? null,
        currency: business?.currency ?? 'XAF',
        seoTitle: business?.name ?? null,
      })
      return await this.storesRepo.save(store)
    } catch (error) {
      return this.handleServiceError('createStore', error, { businessId })
    }
  }

  async updateStore(businessId: string, dto: UpdateOnlineStoreRequest): Promise<OnlineStore> {
    try {
      const store = await this.requireStore(businessId)
      // Slug change: normalise, reject reserved + taken (by another store).
      let storeSlug = store.storeSlug
      if (dto.storeSlug !== undefined && dto.storeSlug.trim() && dto.storeSlug.trim() !== store.storeSlug) {
        storeSlug = await this.resolveSlugChange(dto.storeSlug.trim(), store.id)
      }
      const merged = this.storesRepo.merge(store, {
        storeName: dto.storeName?.trim() ?? store.storeName,
        storeSlug,
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
        // Appearance + catalog + SEO/social (design-store-config)
        layoutTemplate: dto.layoutTemplate ?? store.layoutTemplate,
        themeId: dto.themeId ?? store.themeId,
        appearance: dto.appearance ?? store.appearance,
        catalogBinding: dto.catalogBinding ?? store.catalogBinding,
        showLowStockBadges: dto.showLowStockBadges ?? store.showLowStockBadges,
        seoTitle: dto.seoTitle === undefined ? store.seoTitle : (dto.seoTitle?.trim() ?? null),
        seoDescription: dto.seoDescription === undefined ? store.seoDescription : (dto.seoDescription?.trim() ?? null),
        ogImageUrl: dto.ogImageUrl === undefined ? store.ogImageUrl : (dto.ogImageUrl?.trim() ?? null),
        robotsIndex: dto.robotsIndex ?? store.robotsIndex,
        socialInstagram: dto.socialInstagram === undefined ? store.socialInstagram : (dto.socialInstagram?.trim() ?? null),
        socialFacebook: dto.socialFacebook === undefined ? store.socialFacebook : (dto.socialFacebook?.trim() ?? null),
        socialTiktok: dto.socialTiktok === undefined ? store.socialTiktok : (dto.socialTiktok?.trim() ?? null),
        // Any edit makes the live site stale until the next publish.
        hasUnpublishedChanges: true,
      })
      return await this.storesRepo.save(merged)
    } catch (error) {
      return this.handleServiceError('updateStore', error, { businessId })
    }
  }

  /** Publish the current draft: go live + clear the unpublished-changes flag. */
  async publishStore(businessId: string): Promise<OnlineStore> {
    try {
      const store = await this.requireStore(businessId)
      const merged = this.storesRepo.merge(store, {
        status: 'published',
        isActive: true,
        publishedAt: new Date(),
        hasUnpublishedChanges: false,
      })
      // NOTE: snapshot-on-publish capture + CDN revalidate land with the storefront SSR phase (#91).
      return await this.storesRepo.save(merged)
    } catch (error) {
      return this.handleServiceError('publishStore', error, { businessId })
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

  /** Reserved subdomains that can't be used as a store slug (issue #91). */
  private static readonly RESERVED_SLUGS = new Set([
    'www', 'app', 'api', 'admin', 'mail', 'cdn', 'store', 'shop', 'help', 'status', 'static', 'assets', 'blog',
  ])

  /** Non-throwing availability check for a subdomain slug (format + reserved + uniqueness,
   * ignoring the caller's own store). Backs the live "is this address free?" UI. */
  async checkSlug(businessId: string, requested: string): Promise<{ slug: string; available: boolean; reason?: 'invalid' | 'reserved' | 'taken' }> {
    const slug = generateSlug(requested ?? '')
    if (!slug) return { slug: '', available: false, reason: 'invalid' }
    if (OnlineStoreService.RESERVED_SLUGS.has(slug)) return { slug, available: false, reason: 'reserved' }
    const [taken, own] = await Promise.all([
      this.storesRepo.findOne({ where: { storeSlug: slug } }),
      this.storesRepo.findOne({ where: { businessId } }),
    ])
    if (taken && taken.id !== own?.id) return { slug, available: false, reason: 'taken' }
    return { slug, available: true }
  }

  /** Normalise + validate a requested slug change: reserved/format/uniqueness. */
  private async resolveSlugChange(requested: string, storeId: string): Promise<string> {
    const slug = generateSlug(requested)
    if (!slug) {
      throw new AppConflictException('That web address is not valid.', 'ONLINE_STORE_SLUG_INVALID')
    }
    if (OnlineStoreService.RESERVED_SLUGS.has(slug)) {
      throw new AppConflictException('That web address is reserved — please pick another.', 'ONLINE_STORE_SLUG_RESERVED')
    }
    const taken = await this.storesRepo.findOne({ where: { storeSlug: slug } })
    if (taken && taken.id !== storeId) {
      throw new AppConflictException('That web address is already taken.', 'ONLINE_STORE_SLUG_TAKEN')
    }
    return slug
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
