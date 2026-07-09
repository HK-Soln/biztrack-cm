import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import { I18nService } from 'nestjs-i18n'
import type {
  CategoryTreeResponse,
  ContactMessageRequest,
  OnlineStorePublishedConfig,
  PaginatedResult,
  PublicAttributeGroupFacet,
  PublicFacets,
  PublicProductDetail,
  PublicProductListItem,
  PublicProductsQuery,
  PublicProductVariant,
  PublicStore,
} from '@biztrack/types'
import { SerialUnitStatus } from '@biztrack/types'
import { AppBadRequestException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { Business } from '@/entities/business.entity'
import { NotificationChannel, NotificationType } from '@/entities/notification.entity'
import { OnlineStore } from '@/entities/online-store.entity'
import { Product } from '@/entities/product.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { ProductImage } from '@/entities/product-image.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { CategoriesService } from '@/modules/products/services/categories.service'
import { ProductVariantsService } from '@/modules/products/services/product-variants.service'
import { NotificationsService } from '@/modules/notifications/services/notifications.service'
import { OnlineStoreService } from './online-store.service'

/** The live storefront view: the store row (identity + catalogue scope) + its published config. */
type PublishedStore = { store: OnlineStore; config: OnlineStorePublishedConfig }

@Injectable()
export class PublicStorefrontService {
  constructor(
    @InjectRepository(OnlineStore)
    private readonly storesRepo: Repository<OnlineStore>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(InventoryLevel)
    private readonly inventoryRepo: Repository<InventoryLevel>,
    @InjectRepository(ProductImage)
    private readonly imagesRepo: Repository<ProductImage>,
    @InjectRepository(ProductSerialUnit)
    private readonly serialUnitsRepo: Repository<ProductSerialUnit>,
    private readonly categoriesService: CategoriesService,
    private readonly variantsService: ProductVariantsService,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly storeService: OnlineStoreService,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly notifications: NotificationsService,
  ) {}

  async getStore(slug: string): Promise<PublicStore> {
    const { config } = await this.requireStore(slug)
    return this.toPublicStore(config)
  }

  async listProducts(
    slug: string,
    query: PublicProductsQuery = {},
  ): Promise<PaginatedResult<PublicProductListItem>> {
    const { store, config } = await this.requireStore(slug)
    const page = Math.max(query.page ?? 1, 1)
    const limit = Math.min(Math.max(query.limit ?? 24, 1), 100)

    // Paginate at the DB level — never load the whole catalogue.
    const qb = this.productsRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.business_id = :businessId', { businessId: store.businessId })
      .andWhere('product.is_published_online = true')
      .andWhere('product.is_active = true')
      .andWhere('product.deleted_at IS NULL')

    if (query.categoryIds?.length) {
      qb.andWhere('product.category_id IN (:...categoryIds)', { categoryIds: query.categoryIds })
    }
    if (query.brandIds?.length) {
      qb.andWhere('product.brand_id IN (:...brandIds)', { brandIds: query.brandIds })
    }
    if (query.modelIds?.length) {
      qb.andWhere('product.model_id IN (:...modelIds)', { modelIds: query.modelIds })
    }
    if (query.attributeOptionIds?.length) {
      // Attributes live on variants: keep products that have a variant carrying a selected option.
      qb.andWhere(
        `product.id IN (
          SELECT pv.product_id FROM product_variants pv
          INNER JOIN product_variant_options pvo ON pvo.variant_id = pv.id
          WHERE pvo.attribute_option_id IN (:...attributeOptionIds)
            AND pv.business_id = :attrBusinessId
            AND pv.deleted_at IS NULL
        )`,
        { attributeOptionIds: query.attributeOptionIds, attrBusinessId: store.businessId },
      )
    }
    if (query.search) {
      qb.andWhere('LOWER(product.name) LIKE LOWER(:search)', { search: `%${query.search}%` })
    }

    const [products, total] = await qb
      // orderBy resolves ENTITY PROPERTY names, not snake columns — with leftJoinAndSelect +
      // skip/take, TypeORM looks the column up via metadata and a snake name 500s
      // ("Cannot read properties of undefined (reading 'databaseName')"). Where clauses take snake SQL.
      .orderBy('product.onlineSortOrder', 'ASC')
      .addOrderBy('product.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount()

    const stockByProduct = await this.resolveStock(store.businessId, products)
    // Out-of-stock hiding applies within the page; pagination keeps the request bounded.
    // Non-tracked products and variant products are always considered available.
    const data = products
      .map((product) =>
        this.toListItem(product, config.currency, stockByProduct.get(product.id) ?? 0),
      )
      .filter(
        (item) =>
          config.showOutOfStock || !item.trackInventory || item.inStock > 0 || item.hasVariants,
      )

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getProduct(slug: string, productSlug: string): Promise<PublicProductDetail> {
    const { store, config } = await this.requireStore(slug)
    const product = await this.productsRepo.findOne({
      where: {
        businessId: store.businessId,
        slug: productSlug,
        isPublishedOnline: true,
        isActive: true,
        deletedAt: IsNull(),
      },
      relations: ['category'],
    })
    if (!product) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.product_not_found'),
        'PRODUCT_NOT_FOUND',
      )
    }

    const [stockByProduct, images, variants] = await Promise.all([
      this.resolveStock(store.businessId, [product]),
      this.imagesRepo.find({
        where: { productId: product.id },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      }),
      product.hasVariants
        ? this.variantsService.listVariantsForProduct(store.businessId, product.id)
        : Promise.resolve([]),
    ])

    // Gallery = product_images, with the primary imageUrl prepended when it isn't
    // already one of them (many products only set imageUrl and have no image rows).
    const galleryUrls = images.map((image) => image.url)
    const allImages =
      product.imageUrl && !galleryUrls.includes(product.imageUrl)
        ? [product.imageUrl, ...galleryUrls]
        : galleryUrls

    const base = this.toListItem(product, config.currency, stockByProduct.get(product.id) ?? 0)
    const publicVariants: PublicProductVariant[] = (variants ?? []).map((variant) => ({
      id: variant.id,
      name: variant.name,
      sellingPrice: variant.priceOverride ?? product.sellingPrice,
      inStock: Math.max(0, variant.currentStock ?? 0),
      attributes: (variant.options ?? []).map((option) => ({
        groupName: option.groupName ?? '',
        optionValue: option.optionValue ?? '',
        colorHex: option.colorHex ?? null,
      })),
    }))

    return {
      ...base,
      description: product.description ?? null,
      onlineDescription: product.onlineDescription ?? null,
      metaTitle: product.metaTitle ?? null,
      metaDescription: product.metaDescription ?? null,
      images: allImages,
      variants: publicVariants,
    }
  }

  async getCategories(slug: string): Promise<CategoryTreeResponse> {
    const { store } = await this.requireStore(slug)
    return this.categoriesService.getTree(store.businessId)
  }

  /**
   * Filterable facets for the shop page — brands, models, and attribute options that
   * actually appear on the store's published products (so empty facets never show).
   * Scoped by category when provided. Counts are intentionally omitted (v1).
   */
  async getFacets(slug: string, categoryIds?: string[]): Promise<PublicFacets> {
    const { store } = await this.requireStore(slug)
    const manager = this.productsRepo.manager
    const cats = (categoryIds ?? []).filter(Boolean)
    const hasCat = cats.length > 0
    const catClause = hasCat ? ' AND p.category_id = ANY($2::uuid[])' : ''
    const params: unknown[] = hasCat ? [store.businessId, cats] : [store.businessId]
    const published =
      'p.business_id = $1 AND p.is_published_online = true AND p.is_active = true AND p.deleted_at IS NULL'

    const brandRows = (await manager.query(
      `SELECT DISTINCT b.id, b.name, b.slug, b.sort_order
       FROM brands b INNER JOIN products p ON p.brand_id = b.id
       WHERE ${published} AND b.is_active = true${catClause}
       ORDER BY b.sort_order, b.name`,
      params,
    )) as Array<{ id: string; name: string; slug: string }>

    const modelRows = (await manager.query(
      `SELECT DISTINCT m.id, m.name, m.slug, m.brand_id, m.sort_order
       FROM models m INNER JOIN products p ON p.model_id = m.id
       WHERE ${published} AND m.is_active = true${catClause}
       ORDER BY m.sort_order, m.name`,
      params,
    )) as Array<{ id: string; name: string; slug: string; brand_id: string }>

    const optionRows = (await manager.query(
      `SELECT DISTINCT ao.id AS opt_id, ao.value, ao.color_hex, ao.sort_order AS opt_sort,
              g.id AS grp_id, g.name AS grp_name, g.display_type, g.sort_order AS grp_sort
       FROM product_variant_options pvo
       INNER JOIN attribute_options ao ON ao.id = pvo.attribute_option_id
       INNER JOIN attribute_groups g ON g.id = ao.group_id
       INNER JOIN product_variants pv ON pv.id = pvo.variant_id
       INNER JOIN products p ON p.id = pv.product_id
       WHERE ${published} AND pv.deleted_at IS NULL AND ao.is_active = true AND g.is_active = true${catClause}
       ORDER BY g.sort_order, g.name, ao.sort_order, ao.value`,
      params,
    )) as Array<{
      opt_id: string
      value: string
      color_hex: string | null
      grp_id: string
      grp_name: string
      display_type: string
    }>

    const groups = new Map<string, PublicAttributeGroupFacet>()
    for (const row of optionRows) {
      let group = groups.get(row.grp_id)
      if (!group) {
        group = { id: row.grp_id, name: row.grp_name, displayType: row.display_type, options: [] }
        groups.set(row.grp_id, group)
      }
      group.options.push({ id: row.opt_id, value: row.value, colorHex: row.color_hex ?? null })
    }

    return {
      brands: brandRows.map((b) => ({ id: b.id, name: b.name, slug: b.slug })),
      models: modelRows.map((m) => ({
        id: m.id,
        name: m.name,
        slug: m.slug,
        brandId: m.brand_id,
      })),
      attributeGroups: [...groups.values()],
    }
  }

  /**
   * Deliver a storefront contact-form message to the business by email (via the Resend
   * notification pipeline). Recipient = the store's configured email, else the business email.
   */
  async sendContactMessage(slug: string, dto: ContactMessageRequest): Promise<{ ok: true }> {
    const { store, config } = await this.requireStore(slug)
    const business = await this.businessRepo.findOne({ where: { id: store.businessId } })
    const recipient = config.email?.trim() || business?.email?.trim() || null
    if (!recipient) {
      throw new AppBadRequestException(
        'This store has no contact email configured.',
        'ONLINE_STORE_NO_CONTACT_EMAIL',
      )
    }

    const body = [
      `Name: ${dto.name.trim()}`,
      dto.phone?.trim() ? `Phone: ${dto.phone.trim()}` : null,
      dto.email?.trim() ? `Email: ${dto.email.trim()}` : null,
      '',
      dto.message.trim(),
    ]
      .filter((line) => line !== null)
      .join('\n')

    await this.notifications.createAndEnqueue({
      channel: NotificationChannel.EMAIL,
      type: NotificationType.PAYMENT_REMINDER, // reused (no enum migration) — metadata marks it as contact
      recipient,
      subject: `[${config.storeName}] ${dto.subject.trim()}`,
      body,
      businessId: store.businessId,
      metadata: {
        kind: 'contact',
        storeSlug: config.storeSlug,
        replyTo: dto.email?.trim() ?? null,
        fromName: dto.name.trim(),
        fromPhone: dto.phone?.trim() ?? null,
      },
    })
    return { ok: true }
  }

  // ---- internals ----------------------------------------------------------

  /** The storefront only ever sees the PUBLISHED snapshot — a draft / suspended / never-published
   *  store 404s here, so unpublished edits never leak to customers. */
  private async requireStore(slug: string): Promise<PublishedStore> {
    const published = await this.storeService.getPublishedStore(slug)
    if (!published) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.online_store_not_found'),
        'ONLINE_STORE_NOT_FOUND',
      )
    }
    return published
  }

  /** Effective online stock per product (variant sum / serial count, less reserve). */
  private async resolveStock(
    businessId: string,
    products: Product[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>()
    const ids = products.map((product) => product.id)
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

  private toListItem(product: Product, currency: string, inStock: number): PublicProductListItem {
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      sellingPrice: product.sellingPrice,
      currency,
      primaryImageUrl: product.imageUrl ?? null,
      categoryName: product.category?.name ?? null,
      inStock,
      hasVariants: Boolean(product.hasVariants),
      trackInventory: Boolean(product.trackInventory),
    }
  }

  private toPublicStore(config: OnlineStorePublishedConfig): PublicStore {
    return {
      storeName: config.storeName,
      storeSlug: config.storeSlug,
      tagline: config.tagline,
      logoUrl: config.logoUrl,
      bannerUrl: config.bannerUrl,
      primaryColor: config.primaryColor,
      themeId: config.appearance.themeId,
      appearance: config.appearance.appearance,
      layoutTemplate: config.appearance.layoutTemplate,
      phone: config.phone,
      email: config.email,
      address: config.address,
      whatsappNumber: config.whatsappNumber,
      city: config.city,
      currency: config.currency,
      showOutOfStock: config.showOutOfStock,
      allowOrderNotes: config.allowOrderNotes,
      minOrderAmount: config.minOrderAmount,
      paymentMethods: {
        cashOnDelivery: config.payment.cashOnDelivery,
        mtnMomo: config.payment.mtnMomo,
        orangeMoney: config.payment.orangeMoney,
        card: config.payment.card,
      },
      fulfilment: {
        offerDelivery: config.fulfilment.offerDelivery,
        offerPickup: config.fulfilment.offerPickup,
        deliveryFee: config.fulfilment.deliveryFee,
        pickupAddress: config.fulfilment.pickupAddress,
        deliveryCities: config.fulfilment.deliveryCities,
      },
      socials: {
        instagram: config.socials.instagram,
        facebook: config.socials.facebook,
        tiktok: config.socials.tiktok,
        x: config.socials.x,
        linkedin: config.socials.linkedin,
      },
      seo: {
        title: config.seo.seoTitle,
        description: config.seo.seoDescription,
        ogImageUrl: config.seo.ogImageUrl,
      },
    }
  }
}
