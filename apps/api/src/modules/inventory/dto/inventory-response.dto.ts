import type {
  InventoryAlert,
  InventoryBinSummary,
  InventoryDetail,
  InventoryListItem,
  InventoryMovement,
  InventoryMovementTrendPoint,
  InventoryMovementPerformer,
  InventoryProductSummary,
  RestockPaymentRequest,
  RestockResponse,
} from '@biztrack/types'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement as InventoryMovementEntity } from '@/entities/inventory-movement.entity'
import { RestockRecord } from '@/entities/restock-record.entity'
import { CategoryDto } from '@/modules/products/dto/category-response.dto'
import { UnitOfMeasureDto } from '@/modules/products/dto/unit-of-measure-response.dto'
import { toIsoString } from '@/common/http/serialization'

type InventoryMovementModel = {
  id: string
  businessId: string
  productId: string
  type: InventoryMovement['type'] | InventoryMovementEntity['type']
  quantityChange: number
  quantityBefore: number
  quantityAfter: number
  referenceType?: string | null
  referenceId?: string | null
  notes?: string | null
  performedBy?:
    | InventoryMovementPerformer
    | InventoryMovementEntity['performedBy']
    | null
  performedById?: string | null
  referenceLabel?: string | null
  product?: { name?: string | null } | null
  createdAt: Date | string
}

export class InventoryListItemDto implements InventoryListItem {
  productId!: string
  productName!: string | null
  sku!: string | null
  barcode!: string | null
  primaryImageUrl?: string | null
  categoryName!: string | null
  unitAbbreviation!: string | null
  quantity!: number
  lowStockThreshold!: number | null
  reorderPoint!: number | null
  isLowStock!: boolean
  lastRestockAt!: string | null

  static fromModel(model: {
    productId: string
    productName: string | null
    sku: string | null
    barcode: string | null
    primaryImageUrl?: string | null
    categoryName: string | null
    unitAbbreviation: string | null
    quantity: number
    lowStockThreshold?: number | null
    reorderPoint?: number | null
    isLowStock: boolean
    lastRestockAt?: Date | string | null
  }): InventoryListItemDto {
    const dto = new InventoryListItemDto()
    Object.assign(dto, model)
    dto.primaryImageUrl = model.primaryImageUrl ?? null
    dto.lowStockThreshold = model.lowStockThreshold ?? null
    dto.reorderPoint = model.reorderPoint ?? null
    dto.lastRestockAt = toIsoString(model.lastRestockAt) ?? null
    return dto
  }
}

export class InventoryAlertDto implements InventoryAlert {
  productId!: string
  productName!: string | null
  sku!: string | null
  primaryImageUrl?: string | null
  categoryName!: string | null
  currentQuantity!: number
  lowStockThreshold!: number | null
  reorderPoint!: number | null
  shortfall!: number

  static fromModel(model: {
    productId: string
    productName: string | null
    sku: string | null
    primaryImageUrl?: string | null
    categoryName: string | null
    currentQuantity: number
    lowStockThreshold?: number | null
    reorderPoint?: number | null
    shortfall: number
  }): InventoryAlertDto {
    const dto = new InventoryAlertDto()
    Object.assign(dto, model)
    dto.primaryImageUrl = model.primaryImageUrl ?? null
    dto.lowStockThreshold = model.lowStockThreshold ?? null
    dto.reorderPoint = model.reorderPoint ?? null
    return dto
  }
}

export class InventoryMovementPerformerDto implements InventoryMovementPerformer {
  id!: string
  name!: string

  static fromModel(model?: InventoryMovementPerformer | { id: string; name: string } | null) {
    if (!model) return null

    const dto = new InventoryMovementPerformerDto()
    dto.id = model.id
    dto.name = model.name
    return dto
  }
}

export class InventoryMovementDto implements InventoryMovement {
  id!: string
  businessId!: string
  productId!: string
  productName?: string | null
  type!: InventoryMovement['type']
  quantityChange!: number
  quantityBefore!: number
  quantityAfter!: number
  referenceType?: string | null
  referenceId?: string | null
  notes?: string | null
  performedBy?: InventoryMovementPerformerDto | null
  performedById?: string | null
  referenceLabel?: string | null
  createdAt!: string

  static fromEntity(entity: InventoryMovementModel): InventoryMovementDto {
    const dto = new InventoryMovementDto()
    dto.id = entity.id
    dto.businessId = entity.businessId
    dto.productId = entity.productId
    dto.productName = 'product' in entity && entity.product ? entity.product.name ?? null : null
    dto.type = entity.type as InventoryMovement['type']
    dto.quantityChange = entity.quantityChange
    dto.quantityBefore = entity.quantityBefore
    dto.quantityAfter = entity.quantityAfter
    dto.referenceType = entity.referenceType ?? null
    dto.referenceId = entity.referenceId ?? null
    dto.notes = entity.notes ?? null
    dto.performedBy = InventoryMovementPerformerDto.fromModel(
      'performedBy' in entity && entity.performedBy
        ? {
            id: entity.performedBy.id,
            name: entity.performedBy.name,
          }
        : ('performedBy' in entity ? entity.performedBy : null),
    )
    dto.performedById = entity.performedById ?? null
    dto.referenceLabel = 'referenceLabel' in entity ? entity.referenceLabel ?? null : null
    dto.createdAt = toIsoString(entity.createdAt) ?? ''
    return dto
  }
}

export class InventoryMovementTrendPointDto implements InventoryMovementTrendPoint {
  date!: string
  stockIn!: number
  stockOut!: number

  static fromModel(model: InventoryMovementTrendPoint): InventoryMovementTrendPointDto {
    const dto = new InventoryMovementTrendPointDto()
    dto.date = model.date
    dto.stockIn = model.stockIn
    dto.stockOut = model.stockOut
    return dto
  }
}

export class InventoryBinSummaryDto implements InventoryBinSummary {
  openingStock!: number
  totalRestocked!: number
  totalSold!: number
  totalAdjusted!: number
  currentBalance!: number
  lastRestockAt!: string | null
  lastRestockQuantity!: number | null
  lastRestockReferenceLabel?: string | null
  lastRestockSourceName?: string | null
  movementWindowDays!: number
  trend!: InventoryMovementTrendPointDto[]

  static fromModel(model?: InventoryBinSummary | null): InventoryBinSummaryDto | null {
    if (!model) {
      return null
    }

    const dto = new InventoryBinSummaryDto()
    dto.openingStock = model.openingStock
    dto.totalRestocked = model.totalRestocked
    dto.totalSold = model.totalSold
    dto.totalAdjusted = model.totalAdjusted
    dto.currentBalance = model.currentBalance
    dto.lastRestockAt = model.lastRestockAt ?? null
    dto.lastRestockQuantity = model.lastRestockQuantity ?? null
    dto.lastRestockReferenceLabel = model.lastRestockReferenceLabel ?? null
    dto.lastRestockSourceName = model.lastRestockSourceName ?? null
    dto.movementWindowDays = model.movementWindowDays
    dto.trend = model.trend.map((point) => InventoryMovementTrendPointDto.fromModel(point))
    return dto
  }
}

type InventoryProductModel = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  slug: string
  imageUrl?: string | null
  category?: Parameters<typeof CategoryDto.fromEntity>[0]
  unitOfMeasure?: Parameters<typeof UnitOfMeasureDto.fromEntity>[0]
}

export class InventoryProductSummaryDto implements InventoryProductSummary {
  id!: string
  name!: string
  sku!: string | null
  barcode!: string | null
  slug!: string
  imageUrl?: string | null
  category?: CategoryDto | null
  unitOfMeasure?: UnitOfMeasureDto | null

  static fromProduct(product: InventoryProductModel): InventoryProductSummaryDto {
    const dto = new InventoryProductSummaryDto()
    dto.id = product.id
    dto.name = product.name
    dto.sku = product.sku
    dto.barcode = product.barcode
    dto.slug = product.slug
    dto.imageUrl = product.imageUrl ?? null
    dto.category = CategoryDto.fromEntity(product.category) ?? null
    dto.unitOfMeasure = UnitOfMeasureDto.fromEntity(product.unitOfMeasure) ?? null
    return dto
  }
}

export class InventoryDetailDto implements InventoryDetail {
  id!: string
  businessId!: string
  productId!: string
  quantity!: number
  lowStockThreshold!: number | null
  reorderPoint!: number | null
  lastRestockAt!: string | null
  createdAt!: string
  updatedAt!: string
  product!: InventoryProductSummaryDto
  movements!: InventoryMovementDto[]
  binSummary?: InventoryBinSummaryDto | null

  static fromModel(model: {
    id: string
    businessId: string
    productId: string
    quantity: number
    lowStockThreshold?: number | null
    reorderPoint?: number | null
    lastRestockAt?: Date | string | null
    createdAt: Date | string
    updatedAt: Date | string
    product?: InventoryProductModel
    movements?: InventoryMovementModel[]
    binSummary?: InventoryBinSummary | null
  }): InventoryDetailDto {
    const dto = new InventoryDetailDto()
    dto.id = model.id
    dto.businessId = model.businessId
    dto.productId = model.productId
    dto.quantity = model.quantity
    dto.lowStockThreshold = model.lowStockThreshold ?? null
    dto.reorderPoint = model.reorderPoint ?? null
    dto.lastRestockAt = toIsoString(model.lastRestockAt) ?? null
    dto.createdAt = toIsoString(model.createdAt) ?? ''
    dto.updatedAt = toIsoString(model.updatedAt) ?? ''
    dto.product = InventoryProductSummaryDto.fromProduct(model.product!)
    dto.movements = (model.movements ?? []).map((movement) => InventoryMovementDto.fromEntity(movement))
    dto.binSummary = InventoryBinSummaryDto.fromModel(model.binSummary)
    return dto
  }
}

export class RestockResponseDto implements RestockResponse {
  id!: string
  businessId!: string
  referenceNumber?: string | null
  supplierId?: string | null
  supplierName?: string | null
  subtotalAmount?: number | null
  discountAmount?: number | null
  chargesAmount?: number | null
  totalAmount!: number
  amountPaid!: number
  creditAmount!: number
  totalCost?: number | null
  notes?: string | null
  invoiceNumber?: string | null
  invoiceDate?: string | null
  invoiceFileUrl?: string | null
  performedById?: string | null
  createdAt!: string
  payments?: RestockPaymentRequest[]
  charges?: RestockResponse['charges']
  discounts?: RestockResponse['discounts']
  items!: RestockResponse['items']

  static fromModel(model: {
    id: string
    businessId: string
    referenceNumber?: string | null
    supplierId?: string | null
    supplierName?: string | null
    discountAmount?: number | null
    chargesAmount?: number | null
    totalAmount: number
    amountPaid: number
    creditAmount: number
    totalCost?: number | null
    notes?: string | null
    invoiceNumber?: string | null
    invoiceDate?: string | null
    invoiceFileUrl?: string | null
    performedById?: string | null
    createdAt: Date | string
    payments?: RestockPaymentRequest[]
    charges?: RestockResponse['charges']
    discounts?: RestockResponse['discounts']
    items: RestockResponse['items']
  }): RestockResponseDto {
    const dto = new RestockResponseDto()
    dto.id = model.id
    dto.businessId = model.businessId
    dto.referenceNumber = model.referenceNumber ?? null
    dto.supplierId = model.supplierId ?? null
    dto.supplierName = model.supplierName ?? null
    dto.subtotalAmount = model.totalCost ?? null
    dto.discountAmount = model.discountAmount ?? null
    dto.chargesAmount = model.chargesAmount ?? null
    dto.totalAmount = model.totalAmount
    dto.amountPaid = model.amountPaid
    dto.creditAmount = model.creditAmount
    dto.totalCost = model.totalCost ?? null
    dto.notes = model.notes ?? null
    dto.invoiceNumber = model.invoiceNumber ?? null
    dto.invoiceDate = model.invoiceDate ?? null
    dto.invoiceFileUrl = model.invoiceFileUrl ?? null
    dto.performedById = model.performedById ?? null
    dto.createdAt = toIsoString(model.createdAt) ?? ''
    dto.payments = model.payments ?? []
    dto.charges = model.charges ?? []
    dto.discounts = model.discounts ?? []
    dto.items = model.items
    return dto
  }
}
