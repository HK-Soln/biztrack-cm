import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

// decimal(12,2) money / decimal(12,3) quantity column ceilings — keep clean 400s instead of DB overflow 500s.
const MAX_MONEY = 9_999_999_999
const MAX_QUANTITY = 9_999_999
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ProductType, type CreateProductRequest } from '@biztrack/types'

export class CreateProductDto implements CreateProductRequest {
  @ApiProperty({ example: 'Coca-Cola 50cl' })
  @IsString()
  @MaxLength(200)
  name!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @ApiPropertyOptional({ example: 'COKE-50CL' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string

  @ApiPropertyOptional({ example: '5449000000996' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string

  @ApiProperty({ example: 500 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  @Type(() => Number)
  sellingPrice!: number

  @ApiPropertyOptional({ example: 350 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  @Type(() => Number)
  costPrice?: number

  @ApiPropertyOptional({ example: 19.25, default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @Type(() => Number)
  taxRate?: number

  @ApiPropertyOptional({ example: 100, default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(MAX_QUANTITY)
  @Type(() => Number)
  openingStock?: number

  @ApiPropertyOptional({ example: 10, default: 5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(MAX_QUANTITY)
  @Type(() => Number)
  lowStockThreshold?: number

  @ApiProperty()
  @IsUUID()
  unitOfMeasureId!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string

  @ApiPropertyOptional({
    enum: ProductType,
    description:
      'Authoritative product classification. If omitted, derived from isService (SERVICE when isService=true, else SIMPLE).',
  })
  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType

  @ApiPropertyOptional({
    default: false,
    description: 'Deprecated. Use productType=SERVICE. Kept for backward compatibility.',
  })
  @IsOptional()
  @IsBoolean()
  isService?: boolean

  @ApiPropertyOptional({ description: 'Defaults to false for services and true for physical products.' })
  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
