import type { Brand, Model } from '@biztrack/types'
import { Brand as BrandEntity } from '@/entities/brand.entity'
import { Model as ModelEntity } from '@/entities/model.entity'
import { toIsoString } from '@/common/http/serialization'

export class ModelResponseDto implements Model {
  id!: string
  businessId!: string
  brandId!: string
  name!: string
  slug?: string
  isActive!: boolean
  sortOrder!: number
  createdAt?: string
  updatedAt?: string

  static fromEntity(entity?: ModelEntity | null): ModelResponseDto | null {
    if (!entity) return null
    const dto = new ModelResponseDto()
    dto.id = entity.id
    dto.businessId = entity.businessId
    dto.brandId = entity.brandId
    dto.name = entity.name
    dto.slug = entity.slug ?? undefined
    dto.isActive = entity.isActive
    dto.sortOrder = entity.sortOrder
    dto.createdAt = toIsoString(entity.createdAt) ?? undefined
    dto.updatedAt = toIsoString(entity.updatedAt) ?? undefined
    return dto
  }
}

export class BrandResponseDto implements Brand {
  id!: string
  businessId!: string
  name!: string
  slug!: string
  logoUrl?: string | null
  description?: string | null
  isActive!: boolean
  sortOrder!: number
  categoryIds?: string[]
  models?: Model[]
  createdAt?: string
  updatedAt?: string

  static fromEntity(entity?: BrandEntity | null): BrandResponseDto | null {
    if (!entity) return null
    const dto = new BrandResponseDto()
    dto.id = entity.id
    dto.businessId = entity.businessId
    dto.name = entity.name
    dto.slug = entity.slug
    dto.logoUrl = entity.logoUrl ?? null
    dto.description = entity.description ?? null
    dto.isActive = entity.isActive
    dto.sortOrder = entity.sortOrder
    dto.categoryIds = (entity.categoryLinks ?? []).map((l) => l.categoryId)
    dto.models = (entity.models ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m) => ModelResponseDto.fromEntity(m)!)
    dto.createdAt = toIsoString(entity.createdAt) ?? undefined
    dto.updatedAt = toIsoString(entity.updatedAt) ?? undefined
    return dto
  }
}
