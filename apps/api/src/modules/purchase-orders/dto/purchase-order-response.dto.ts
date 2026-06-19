import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderListItem, PurchaseOrderStatus } from '@biztrack/types'
import { PurchaseOrder as PoEntity } from '@/entities/purchase-order.entity'
import { PurchaseOrderItem as PoItemEntity } from '@/entities/purchase-order-item.entity'
import { toIsoString } from '@/common/http/serialization'

function mapItem(e: PoItemEntity): PurchaseOrderItem {
  return {
    id: e.id,
    purchaseOrderId: e.purchaseOrderId,
    productId: e.productId,
    variantId: e.variantId ?? null,
    description: e.description,
    quantity: Number(e.quantity),
    unitPrice: Number(e.unitPrice),
    receivedQuantity: Number(e.receivedQuantity),
  }
}

export class PurchaseOrderResponseDto implements PurchaseOrder {
  id!: string
  businessId!: string
  number!: string
  rfqId?: string | null
  supplierId!: string
  supplierName?: string | null
  title?: string | null
  messageBody?: string | null
  status!: PurchaseOrderStatus
  currency!: string
  expectedDate?: string | null
  totalAmount!: number
  sentAt?: string | null
  createdById!: string
  createdAt!: string
  updatedAt!: string
  items?: PurchaseOrderItem[]

  static fromEntity(entity?: PoEntity | null): PurchaseOrderResponseDto | null {
    if (!entity) return null
    const dto = new PurchaseOrderResponseDto()
    dto.id = entity.id
    dto.businessId = entity.businessId
    dto.number = entity.number
    dto.rfqId = entity.rfqId ?? null
    dto.supplierId = entity.supplierId
    dto.supplierName = entity.supplierName ?? null
    dto.title = entity.title ?? null
    dto.messageBody = entity.messageBody ?? null
    dto.status = entity.status
    dto.currency = entity.currency
    dto.expectedDate = toIsoString(entity.expectedDate) ?? null
    dto.totalAmount = Number(entity.totalAmount)
    dto.sentAt = toIsoString(entity.sentAt) ?? null
    dto.createdById = entity.createdById ?? ''
    dto.createdAt = toIsoString(entity.createdAt) ?? ''
    dto.updatedAt = toIsoString(entity.updatedAt) ?? ''
    dto.items = (entity.items ?? []).map(mapItem)
    return dto
  }
}

export class PurchaseOrderListItemResponseDto extends PurchaseOrderResponseDto implements PurchaseOrderListItem {
  itemCount!: number
  receivedRatio!: number

  static fromEntity(entity?: PoEntity | null): PurchaseOrderListItemResponseDto | null {
    const base = PurchaseOrderResponseDto.fromEntity(entity)
    if (!base || !entity) return null
    const dto = Object.assign(new PurchaseOrderListItemResponseDto(), base)
    const items = entity.items ?? []
    const ordered = items.reduce((s, i) => s + Number(i.quantity), 0)
    const received = items.reduce((s, i) => s + Number(i.receivedQuantity), 0)
    dto.itemCount = items.length
    dto.receivedRatio = ordered > 0 ? Math.min(1, received / ordered) : 0
    return dto
  }
}
