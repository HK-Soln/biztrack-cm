import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator'
import type { BrandsQuery, SortOrder } from '@biztrack/types'

export class ListBrandsQueryDto implements BrandsQuery {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string

  @ApiPropertyOptional({ description: 'Only brands linked to this category.' })
  @IsOptional()
  @IsUUID()
  categoryId?: string

  @ApiPropertyOptional({ enum: ['name', 'sortOrder', 'createdAt'] })
  @IsOptional()
  @IsIn(['name', 'sortOrder', 'createdAt'])
  sortBy?: string

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: SortOrder
}
