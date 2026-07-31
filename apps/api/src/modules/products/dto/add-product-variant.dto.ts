import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import type { AddProductVariantRequest } from '@biztrack/types'

export class VariantOptionRefDto {
  @ApiProperty()
  @IsUUID()
  attributeGroupId!: string

  @ApiProperty()
  @IsUUID()
  attributeOptionId!: string
}

export class AddProductVariantDto implements AddProductVariantRequest {
  @ApiPropertyOptional({
    type: [VariantOptionRefDto],
    description: 'One option per attribute group. Omit for a free-form (manually named) variant.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantOptionRefDto)
  options?: VariantOptionRefDto[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceOverride?: number | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  costPriceOverride?: number | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string | null

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTitle?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  onlineDescription?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublishedOnline?: boolean

  @ApiPropertyOptional({ description: 'Opening stock (non-serialised only) → stock-in movement.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  openingStock?: number | null

  @ApiPropertyOptional({ description: 'Per-variant low-stock alert threshold.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  lowStockThreshold?: number | null

  @ApiPropertyOptional({ description: 'Per-variant reorder point.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  reorderPoint?: number | null
}
