import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import { generateSlug } from '@biztrack/utils'
import type {
  CreateOnlineStoreRequest,
  OnlineAdminProduct,
  OnlineAdminProductsQuery,
  PaginatedResult,
  ProductOnlineFields,
  UpdateOnlineStoreRequest,
} from '@biztrack/types'
import { checkProductPublishable, SerialUnitStatus } from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppConflictException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { OnlineStore } from '@/entities/online-store.entity'
import { Product } from '@/entities/product.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
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
    @InjectRepository(InventoryLevel)
    private readonly inventoryRepo: Repository<InventoryLevel>,
    @InjectRepository(ProductSerialUnit)
    private readonly serialUnitsRepo: Repository<ProductSerialUnit>,
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
      if (
        dto.storeSlug !== undefined &&
        dto.storeSlug.trim() &&
        dto.storeSlug.trim() !== store.storeSlug
      ) {
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
          dto.whatsappNumber === undefined
            ? store.whatsappNumber
            : (dto.whatsappNumber?.trim() ?? null),
        isActive: dto.isActive ?? store.isActive,
        showOutOfStock: dto.showOutOfStock ?? store.showOutOfStock,
        allowOrderNotes: dto.allowOrderNotes ?? store.allowOrderNotes,
        minOrderAmount:
          dto.minOrderAmount === undefined ? store.minOrderAmount : dto.minOrderAmount,
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
        seoDescription:
          dto.seoDescription === undefined
            ? store.seoDescription
            : (dto.seoDescription?.trim() ?? null),
        ogImageUrl:
          dto.ogImageUrl === undefined ? store.ogImageUrl : (dto.ogImageUrl?.trim() ?? null),
        robotsIndex: dto.robotsIndex ?? store.robotsIndex,
        socialInstagram:
          dto.socialInstagram === undefined
            ? store.socialInstagram
            : (dto.socialInstagram?.trim() ?? null),
        socialFacebook:
          dto.socialFacebook === undefined
            ? store.socialFacebook
            : (dto.socialFacebook?.trim() ?? null),
        socialTiktok:
          dto.socialTiktok === undefined ? store.socialTiktok : (dto.socialTiktok?.trim() ?? null),
        socialX: dto.socialX === undefined ? store.socialX : (dto.socialX?.trim() ?? null),
        socialLinkedin:
          dto.socialLinkedin === undefined
            ? store.socialLinkedin
            : (dto.socialLinkedin?.trim() ?? null),
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

  /**
   * Admin catalogue for the "Online products" manager. Lists products with their live publish
   * state + storefront-readiness inputs, paginated. Served straight from the DB so the desktop
   * and cloud admins always see the true store state (never a stale offline mirror).
   */
  async listProducts(
    businessId: string,
    query: OnlineAdminProductsQuery = {},
  ): Promise<PaginatedResult<OnlineAdminProduct>> {
    try {
      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)

      const qb = this.productsRepo
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.category', 'category')
        .where('product.business_id = :businessId', { businessId })
        .andWhere('product.deleted_at IS NULL')

      if (query.published !== undefined) {
        qb.andWhere('product.is_published_online = :published', { published: query.published })
      }
      if (query.search) {
        qb.andWhere('(LOWER(product.name) LIKE LOWER(:s) OR LOWER(product.sku) LIKE LOWER(:s))', {
          s: `%${query.search}%`,
        })
      }

      // orderBy resolves ENTITY PROPERTY names (not snake columns), unlike where clauses.
      const [products, total] = await qb
        .orderBy('product.isPublishedOnline', 'DESC')
        .addOrderBy('product.name', 'ASC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount()

      const stock = await this.resolveStock(businessId, products)
      const data = products.map((product) =>
        this.toAdminProduct(product, stock.get(product.id) ?? 0),
      )
      return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
    } catch (error) {
      return this.handleServiceError('listProducts', error, { businessId })
    }
  }

  private toAdminProduct(product: Product, inStock: number): OnlineAdminProduct {
    return {
      id: product.id,
      name: product.name,
      sku: product.sku ?? null,
      imageUrl: product.imageUrl ?? null,
      sellingPrice: product.sellingPrice,
      categoryName: product.category?.name ?? null,
      inStock,
      trackInventory: Boolean(product.trackInventory),
      isActive: Boolean(product.isActive),
      isPublishedOnline: Boolean(product.isPublishedOnline),
    }
  }

  /** Effective online stock per product (variant/serial-aware, less reserve). Mirrors the
   *  public storefront so the admin sees the numbers customers will. */
  private async resolveStock(
    businessId: string,
    products: Product[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>()
    if (products.length === 0) return result
    const ids = products.map((p) => p.id)
    const serializedIds = products.filter((p) => p.isSerialized).map((p) => p.id)
    const reserveById = new Map(products.map((p) => [p.id, p.onlineStockReserve ?? 0]))

    const levels = await this.inventoryRepo.find({ where: { businessId, productId: In(ids) } })
    const levelSum = new Map<string, number>()
    for (const level of levels) {
      levelSum.set(level.productId, (levelSum.get(level.productId) ?? 0) + Number(level.quantity))
    }

    const serialCount = new Map<string, number>()
    if (serializedIds.length > 0) {
      const rows = await this.serialUnitsRepo
        .createQueryBuilder('unit')
        .select('unit.product_id', 'productId')
        .addSelect('COUNT(*)', 'count')
        .where('unit.business_id = :businessId', { businessId })
        .andWhere('unit.product_id IN (:...serializedIds)', { serializedIds })
        .andWhere('unit.status = :status', { status: SerialUnitStatus.IN_STOCK })
        .andWhere('unit.deleted_at IS NULL')
        .groupBy('unit.product_id')
        .getRawMany<{ productId: string; count: string }>()
      for (const row of rows) serialCount.set(row.productId, Number(row.count))
    }

    for (const product of products) {
      if (product.isSerialized) {
        result.set(product.id, serialCount.get(product.id) ?? 0)
      } else {
        const reserve = reserveById.get(product.id) ?? 0
        result.set(product.id, Math.max(0, (levelSum.get(product.id) ?? 0) - reserve))
      }
    }
    return result
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
      // Publishing is gated on storefront-readiness — never put a product that would render
      // broken (no price/image, or disabled) in front of customers. Unpublishing is always allowed.
      if (dto.isPublishedOnline === true) {
        const { ready, blockers } = checkProductPublishable({
          isActive: product.isActive,
          sellingPrice: product.sellingPrice,
          imageUrl: product.imageUrl,
        })
        if (!ready) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.product_not_publishable'),
            'PRODUCT_NOT_PUBLISHABLE',
            { blockers },
          )
        }
      }
      await this.productsRepo.update(productId, {
        isPublishedOnline: dto.isPublishedOnline ?? product.isPublishedOnline,
        onlineDescription:
          dto.onlineDescription === undefined
            ? product.onlineDescription
            : (dto.onlineDescription ?? null),
        metaTitle: dto.metaTitle === undefined ? product.metaTitle : (dto.metaTitle ?? null),
        metaDescription:
          dto.metaDescription === undefined
            ? product.metaDescription
            : (dto.metaDescription ?? null),
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
    'www',
    'app',
    'api',
    'admin',
    'mail',
    'cdn',
    'store',
    'shop',
    'help',
    'status',
    'static',
    'assets',
    'blog',
  ])

  /** Non-throwing availability check for a subdomain slug (format + reserved + uniqueness,
   * ignoring the caller's own store). Backs the live "is this address free?" UI. */
  async checkSlug(
    businessId: string,
    requested: string,
  ): Promise<{ slug: string; available: boolean; reason?: 'invalid' | 'reserved' | 'taken' }> {
    const slug = generateSlug(requested ?? '')
    if (!slug) return { slug: '', available: false, reason: 'invalid' }
    if (OnlineStoreService.RESERVED_SLUGS.has(slug))
      return { slug, available: false, reason: 'reserved' }
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
      throw new AppConflictException(
        'That web address is reserved — please pick another.',
        'ONLINE_STORE_SLUG_RESERVED',
      )
    }
    const taken = await this.storesRepo.findOne({ where: { storeSlug: slug } })
    if (taken && taken.id !== storeId) {
      throw new AppConflictException(
        'That web address is already taken.',
        'ONLINE_STORE_SLUG_TAKEN',
      )
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
