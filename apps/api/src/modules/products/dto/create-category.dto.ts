import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator'
import type { CreateCategoryRequest } from '@biztrack/types'

export class CreateCategoryDto implements CreateCategoryRequest {
  @ApiProperty({ example: 'Boissons' })
  @IsString()
  @MaxLength(100)
  name!: string

  @ApiPropertyOptional({ example: '#185FA5' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string

  @ApiPropertyOptional({ example: 'glass-water' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number

  @ApiPropertyOptional({
    description: 'Parent category id. Omit/null for a top-level (L1) category. Parent must have depth < 3.',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string
}
