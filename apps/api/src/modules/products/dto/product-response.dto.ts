import {
  ProductType,
  type Product,
  type ProductBundleComponent,
  type ProductSerialUnit,
  type ProductVariant,
  type SerialType,
} from '@biztrack/types'
import { CategoryDto } from './category-response.dto'
import { UnitOfMeasureDto } from './unit-of-measure-response.dto'
import { UserDto } from './user.dto'
import { ProductImageDto } from './product-image-response.dto'
import { toIsoString } from '@/common/http/serialization'

type ProductModel = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  sellingPrice: number
  costPrice?: number | null
  currency: string
  taxRate: number
  isActive: boolean
  productType: ProductType
  isService: boolean
  trackInventory: boolean
  hasVariants?: boolean
  variants?: ProductVariant[]
  bundleComponents?: ProductBundleComponent[]
  isSerialized?: boolean
  serialType?: SerialType | string | null
  warrantyMonths?: number | null
  serialUnits?: ProductSerialUnit[]
  category?: Parameters<typeof CategoryDto.fromEntity>[0]
  unitOfMeasure?: Parameters<typeof UnitOfMeasureDto.fromEntity>[0]
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
  businessId: string
  slug: string
  description?: string | null
  barcodeType?: string | null
  isBarcodeGenerated: boolean
  categoryId?: string | null
  imageUrl?: string | null
  createdById?: string | null
  createdBy?: Parameters<typeof UserDto.fromModel>[0]
  images?: Array<Parameters<typeof ProductImageDto.fromEntity>[0]>
  currentStock?: number | null
  lowStockThreshold?: number | null
  reorderPoint?: number | null
  primaryImageUrl?: string | null
  brandId?: string | null
  modelId?: string | null
  isFeatured?: boolean
  isPublishedOnline?: boolean
  onlineDescription?: string | null
  onlineStockReserve?: number
  metaTitle?: string | null
  metaDescription?: string | null
}

export class ProductResponseDto implements Product {
  id!: string
  name!: string
  sku!: string | null
  barcode!: string | null
  sellingPrice!: number
  // Displayed "from" price: lowest variant price for variant products, else sellingPrice.
  effectiveSellingPrice?: number
  // Effective cost: average variant cost for variant products, else costPrice.
  effectiveCostPrice?: number | null
  costPrice?: number | null
  currency!: string
  taxRate!: number
  isActive!: boolean
  productType!: ProductType
  isService!: boolean
  trackInventory!: boolean
  hasVariants?: boolean
  variants?: ProductVariant[]
  bundleComponents?: ProductBundleComponent[]
  isSerialized?: boolean
  serialType?: SerialType | null
  warrantyMonths?: number | null
  serialUnits?: ProductSerialUnit[]
  category?: CategoryDto | null
  unitOfMeasure?: UnitOfMeasureDto
  createdAt?: string
  updatedAt?: string
  businessId!: string
  slug!: string
  description?: string | null
  barcodeType?: string | null
  isBarcodeGenerated!: boolean
  categoryId?: string | null
  imageUrl?: string | null
  createdById?: string | null
  createdBy?: UserDto | null
  images!: ProductImageDto[]
  currentStock?: number | null
  lowStockThreshold?: number | null
  reorderPoint?: number | null
  primaryImageUrl?: string | null
  brandId?: string | null
  modelId?: string | null
  isFeatured?: boolean
  isPublishedOnline?: boolean
  onlineDescription?: string | null
  onlineStockReserve?: number
  metaTitle?: string | null
  metaDescription?: string | null

  static fromModel(model: ProductModel): ProductResponseDto {
    const dto = new ProductResponseDto()
    dto.id = model.id
    dto.name = model.name
    dto.sku = model.sku
    dto.barcode = model.barcode
    dto.sellingPrice = model.sellingPrice
    dto.effectiveSellingPrice =
      (model as { effectiveSellingPrice?: number }).effectiveSellingPrice ?? model.sellingPrice
    dto.effectiveCostPrice =
      (model as { effectiveCostPrice?: number | null }).effectiveCostPrice ??
      model.costPrice ??
      null
    dto.costPrice = model.costPrice ?? null
    dto.currency = model.currency
    dto.taxRate = model.taxRate
    dto.isActive = model.isActive
    dto.productType = model.productType
    dto.isService = model.isService
    dto.trackInventory = model.trackInventory
    dto.hasVariants = model.hasVariants ?? false
    dto.variants = model.variants
    dto.bundleComponents = model.bundleComponents
    dto.isSerialized = model.isSerialized ?? false
    dto.serialType = (model.serialType as SerialType | null) ?? null
    dto.warrantyMonths = model.warrantyMonths ?? null
    dto.serialUnits = model.serialUnits
    dto.category = CategoryDto.fromEntity(model.category) ?? null
    dto.unitOfMeasure = UnitOfMeasureDto.fromEntity(model.unitOfMeasure) ?? undefined
    dto.createdAt = toIsoString(model.createdAt) ?? undefined
    dto.updatedAt = toIsoString(model.updatedAt) ?? undefined
    dto.businessId = model.businessId
    dto.slug = model.slug
    dto.description = model.description ?? null
    dto.barcodeType = model.barcodeType ?? null
    dto.isBarcodeGenerated = model.isBarcodeGenerated
    dto.categoryId = model.categoryId ?? null
    dto.imageUrl = model.imageUrl ?? null
    dto.createdById = model.createdById ?? null
    dto.createdBy = UserDto.fromModel(model.createdBy) ?? null
    dto.images = (model.images ?? [])
      .map((image) => ProductImageDto.fromEntity(image))
      .filter((image): image is ProductImageDto => image !== null)
    dto.currentStock = model.currentStock ?? null
    dto.lowStockThreshold = model.lowStockThreshold ?? null
    dto.reorderPoint = model.reorderPoint ?? null
    dto.primaryImageUrl = model.primaryImageUrl ?? null
    dto.brandId = model.brandId ?? null
    dto.modelId = model.modelId ?? null
    dto.isFeatured = model.isFeatured ?? false
    dto.isPublishedOnline = model.isPublishedOnline ?? false
    dto.onlineDescription = model.onlineDescription ?? null
    dto.onlineStockReserve = model.onlineStockReserve ?? 0
    dto.metaTitle = model.metaTitle ?? null
    dto.metaDescription = model.metaDescription ?? null
    return dto
  }
}
