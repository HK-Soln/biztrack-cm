import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import type { UpdateProductVariantRequest } from '@biztrack/types'

/** Edit a variant's catalog info. No quantity change → no movement. */
export class UpdateProductVariantDto implements UpdateProductVariantRequest {
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

  @ApiPropertyOptional()
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
