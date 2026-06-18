import type { ProductSerialUnit, SerialType, SerialUnitStatus } from '@biztrack/types'
import { ProductSerialUnit as ProductSerialUnitEntity } from '@/entities/product-serial-unit.entity'
import { toIsoString } from '@/common/http/serialization'

export class SerialUnitDto implements ProductSerialUnit {
  id!: string
  businessId!: string
  productId!: string
  variantId?: string | null
  serialNumber!: string
  serialType!: SerialType
  status!: SerialUnitStatus
  purchasePrice!: number
  supplierId?: string | null
  restockId?: string | null
  saleId?: string | null
  saleItemId?: string | null
  soldAt?: string | null
  customerId?: string | null
  warrantyExpiresAt?: string | null
  reservedAt?: string | null
  reservedBy?: string | null
  notes?: string | null
  createdAt?: string
  updatedAt?: string

  static fromEntity(entity?: ProductSerialUnitEntity | null): SerialUnitDto | null {
    if (!entity) return null

    const dto = new SerialUnitDto()
    dto.id = entity.id
    dto.businessId = entity.businessId
    dto.productId = entity.productId
    dto.variantId = entity.variantId ?? null
    dto.serialNumber = entity.serialNumber
    dto.serialType = entity.serialType
    dto.status = entity.status
    dto.purchasePrice = entity.purchasePrice
    dto.supplierId = entity.supplierId ?? null
    dto.restockId = entity.restockId ?? null
    dto.saleId = entity.saleId ?? null
    dto.saleItemId = entity.saleItemId ?? null
    dto.soldAt = toIsoString(entity.soldAt) ?? null
    dto.customerId = entity.customerId ?? null
    dto.warrantyExpiresAt = toIsoString(entity.warrantyExpiresAt) ?? null
    dto.reservedAt = toIsoString(entity.reservedAt) ?? null
    dto.reservedBy = entity.reservedBy ?? null
    dto.notes = entity.notes ?? null
    dto.createdAt = toIsoString(entity.createdAt) ?? undefined
    dto.updatedAt = toIsoString(entity.updatedAt) ?? undefined
    return dto
  }
}
