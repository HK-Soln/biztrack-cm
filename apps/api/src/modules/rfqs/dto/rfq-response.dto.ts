import type { Rfq, RfqItem, RfqListItem, RfqStatus, RfqSupplier, RfqSupplierStatus } from '@biztrack/types'
import { Rfq as RfqEntity } from '@/entities/rfq.entity'
import { RfqItem as RfqItemEntity } from '@/entities/rfq-item.entity'
import { RfqSupplier as RfqSupplierEntity } from '@/entities/rfq-supplier.entity'
import { toIsoString } from '@/common/http/serialization'

function mapItem(e: RfqItemEntity): RfqItem {
  return {
    id: e.id,
    rfqId: e.rfqId,
    productId: e.productId,
    variantId: e.variantId ?? null,
    description: e.description,
    quantity: Number(e.quantity),
  }
}

function mapSupplier(e: RfqSupplierEntity): RfqSupplier {
  return {
    id: e.id,
    rfqId: e.rfqId,
    supplierId: e.supplierId,
    supplierName: e.supplierName ?? null,
    status: e.status as RfqSupplierStatus,
    quotedTotal: e.quotedTotal != null ? Number(e.quotedTotal) : null,
    quoteNotes: e.quoteNotes ?? null,
    quoteFileUrl: e.quoteFileUrl ?? null,
    respondedAt: toIsoString(e.respondedAt) ?? null,
  }
}

export class RfqResponseDto implements Rfq {
  id!: string
  businessId!: string
  number!: string
  title?: string | null
  messageBody?: string | null
  status!: RfqStatus
  currency!: string
  createdById!: string
  createdAt!: string
  updatedAt!: string
  items?: RfqItem[]
  suppliers?: RfqSupplier[]

  static fromEntity(entity?: RfqEntity | null): RfqResponseDto | null {
    if (!entity) return null
    const dto = new RfqResponseDto()
    dto.id = entity.id
    dto.businessId = entity.businessId
    dto.number = entity.number
    dto.title = entity.title ?? null
    dto.messageBody = entity.messageBody ?? null
    dto.status = entity.status
    dto.currency = entity.currency
    dto.createdById = entity.createdById ?? ''
    dto.createdAt = toIsoString(entity.createdAt) ?? ''
    dto.updatedAt = toIsoString(entity.updatedAt) ?? ''
    dto.items = (entity.items ?? []).map(mapItem)
    dto.suppliers = (entity.suppliers ?? []).map(mapSupplier)
    return dto
  }
}

export class RfqListItemResponseDto extends RfqResponseDto implements RfqListItem {
  itemCount!: number
  supplierCount!: number
  quoteCount!: number

  static fromEntity(entity?: RfqEntity | null): RfqListItemResponseDto | null {
    const base = RfqResponseDto.fromEntity(entity)
    if (!base || !entity) return null
    const dto = Object.assign(new RfqListItemResponseDto(), base)
    dto.itemCount = entity.items?.length ?? 0
    dto.supplierCount = entity.suppliers?.length ?? 0
    dto.quoteCount = (entity.suppliers ?? []).filter((s) => s.status === ('QUOTED' as RfqSupplierStatus)).length
    return dto
  }
}
