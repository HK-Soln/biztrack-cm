import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import { I18nService } from 'nestjs-i18n'
import type {
  CategoryTreeResponse,
  PublicProductDetail,
  PublicProductListItem,
  PublicProductVariant,
  PublicStore,
} from '@biztrack/types'
import { SerialUnitStatus } from '@biztrack/types'
import { AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { OnlineStore } from '@/entities/online-store.entity'
import { Product } from '@/entities/product.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { ProductImage } from '@/entities/product-image.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { CategoriesService } from '@/modules/products/services/categories.service'
import { ProductVariantsService } from '@/modules/products/services/product-variants.service'

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
  ) {}

  async getStore(slug: string): Promise<PublicStore> {
    const store = await this.requireStore(slug)
    return this.toPublicStore(store)
  }

  async listProducts(slug: string): Promise<PublicProductListItem[]> {
    const store = await this.requireStore(slug)
    const products = await this.productsRepo.find({
      where: {
        businessId: store.businessId,
        isPublishedOnline: true,
        isActive: true,
        deletedAt: IsNull(),
      },
      relations: ['category'],
      order: { onlineSortOrder: 'ASC', name: 'ASC' },
    })
    if (products.length === 0) return []

    const stockByProduct = await this.resolveStock(store.businessId, products)
    return products
      .map((product) => this.toListItem(product, store.currency, stockByProduct.get(product.id) ?? 0))
      .filter((item) => store.showOutOfStock || item.inStock > 0 || item.hasVariants)
  }

  async getProduct(slug: string, productSlug: string): Promise<PublicProductDetail> {
    const store = await this.requireStore(slug)
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

    const base = this.toListItem(product, store.currency, stockByProduct.get(product.id) ?? 0)
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
      images: images.map((image) => image.url),
      variants: publicVariants,
    }
  }

  async getCategories(slug: string): Promise<CategoryTreeResponse> {
    const store = await this.requireStore(slug)
    return this.categoriesService.getTree(store.businessId)
  }

  // ---- internals ----------------------------------------------------------

  private async requireStore(slug: string): Promise<OnlineStore> {
    const store = await this.storesRepo.findOne({
      where: { storeSlug: slug, isActive: true, deletedAt: IsNull() },
    })
    if (!store) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.online_store_not_found'),
        'ONLINE_STORE_NOT_FOUND',
      )
    }
    return store
  }

  /** Effective online stock per product (variant sum / serial count, less reserve). */
  private async resolveStock(businessId: string, products: Product[]): Promise<Map<string, number>> {
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
    }
  }

  private toPublicStore(store: OnlineStore): PublicStore {
    return {
      storeName: store.storeName,
      storeSlug: store.storeSlug,
      tagline: store.tagline ?? null,
      logoUrl: store.logoUrl ?? null,
      bannerUrl: store.bannerUrl ?? null,
      primaryColor: store.primaryColor,
      phone: store.phone ?? null,
      whatsappNumber: store.whatsappNumber ?? null,
      city: store.city ?? null,
      currency: store.currency,
      showOutOfStock: store.showOutOfStock,
      allowOrderNotes: store.allowOrderNotes,
      minOrderAmount: store.minOrderAmount ?? null,
      paymentMethods: {
        cashOnDelivery: store.paymentCashOnDelivery,
        mtnMomo: store.paymentMtnMomo,
        orangeMoney: store.paymentOrangeMoney,
        card: store.paymentCard,
      },
    }
  }
}
