import type { AttributeDisplayType, AttributeGroup, AttributeOption } from '@biztrack/types'
import { AttributeGroup as AttributeGroupEntity } from '@/entities/attribute-group.entity'
import { AttributeOption as AttributeOptionEntity } from '@/entities/attribute-option.entity'
import { toIsoString } from '@/common/http/serialization'

export class AttributeOptionDto implements AttributeOption {
  id!: string
  groupId!: string
  businessId!: string
  value!: string
  colorHex?: string | null
  sortOrder!: number
  isActive!: boolean
  createdAt?: string

  static fromEntity(entity?: AttributeOptionEntity | null): AttributeOptionDto | null {
    if (!entity) return null
    const dto = new AttributeOptionDto()
    dto.id = entity.id
    dto.groupId = entity.groupId
    dto.businessId = entity.businessId
    dto.value = entity.value
    dto.colorHex = entity.colorHex ?? null
    dto.sortOrder = entity.sortOrder
    dto.isActive = entity.isActive
    dto.createdAt = toIsoString(entity.createdAt) ?? undefined
    return dto
  }
}

export class AttributeGroupDto implements AttributeGroup {
  id!: string
  businessId!: string
  name!: string
  displayType!: AttributeDisplayType
  sortOrder!: number
  isActive!: boolean
  options?: AttributeOptionDto[]
  createdAt?: string
  updatedAt?: string

  static fromEntity(entity?: AttributeGroupEntity | null): AttributeGroupDto | null {
    if (!entity) return null
    const dto = new AttributeGroupDto()
    dto.id = entity.id
    dto.businessId = entity.businessId
    dto.name = entity.name
    dto.displayType = entity.displayType
    dto.sortOrder = entity.sortOrder
    dto.isActive = entity.isActive
    dto.options = (entity.options ?? [])
      .map((option) => AttributeOptionDto.fromEntity(option))
      .filter((option): option is AttributeOptionDto => option !== null)
    dto.createdAt = toIsoString(entity.createdAt) ?? undefined
    dto.updatedAt = toIsoString(entity.updatedAt) ?? undefined
    return dto
  }
}
