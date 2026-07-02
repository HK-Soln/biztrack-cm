import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator'
import type { InventoryQuery } from '@biztrack/types'
import { ListQueryDto } from '@/common/dto/list-query.dto'

function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return value as boolean
}

export class ListInventoryQueryDto extends ListQueryDto implements InventoryQuery {
  @ApiPropertyOptional({ description: 'Filter by product category ID' })
  @IsOptional()
  @IsUUID()
  categoryId?: string

  @ApiPropertyOptional({
    description: 'Only return inventory rows currently under their threshold',
  })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  lowStockOnly?: boolean

  @ApiPropertyOptional({ description: 'Filter by stock status', enum: ['in', 'low', 'out'] })
  @IsOptional()
  @IsIn(['in', 'low', 'out'])
  stockStatus?: 'in' | 'low' | 'out'
}
