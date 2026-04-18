import type { UnitOfMeasure } from '@biztrack/types'
import { UnitOfMeasure as UnitOfMeasureEntity } from '@/entities'

export class UnitOfMeasureDto implements UnitOfMeasure {
  id!: string
  name!: string
  abbreviation?: string
  businessId?: string | null
  type!: UnitOfMeasure['type']
  isDefault!: boolean

  static fromEntity(entity?: UnitOfMeasureEntity | null): UnitOfMeasureDto | null {
    if (!entity) return null

    const dto = new UnitOfMeasureDto()
    dto.id = entity.id
    dto.name = entity.name
    dto.abbreviation = entity.abbreviation
    dto.businessId = entity.businessId ?? null
    dto.type = entity.type
    dto.isDefault = entity.isDefault ?? false
    return dto
  }
}
