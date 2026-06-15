import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

// decimal(12,2) money / decimal(12,3) quantity column ceilings — keep clean 400s instead of DB overflow 500s.
const MAX_MONEY = 9_999_999_999
const MAX_QUANTITY = 9_999_999
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  ProductType,
  SerialType,
  type CreateBundleComponentRequest,
  type CreateProductRequest,
  type ProductAttributeSelection,
  type VariantOverride,
} from '@biztrack/types'

export class CreateBundleComponentDto implements CreateBundleComponentRequest {
  @ApiProperty({ description: 'The stocked product consumed by this bundle.' })
  @IsUUID()
  componentProductId!: string

  @ApiProperty({ example: 2, description: 'Units of the component consumed per bundle.' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(MAX_QUANTITY)
  @Type(() => Number)
  quantity!: number

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number
}

export class ProductAttributeSelectionDto implements ProductAttributeSelection {
  @ApiProperty({ description: 'The attribute group these options belong to.' })
  @IsUUID()
  attributeGroupId!: string

  @ApiProperty({
    type: [String],
    description: 'Options from this group that the product comes in.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  selectedOptionIds!: string[]
}

export class VariantOverrideDto implements VariantOverride {
  @ApiProperty({
    type: [String],
    description: 'Identifies the combination by its set of option ids.',
  })
  @IsArray()
  @IsUUID(undefined, { each: true })
  optionIds!: string[]

  @ApiPropertyOptional({ description: 'true = do not create this combination.' })
  @IsOptional()
  @IsBoolean()
  excluded?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameOverride?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  @Type(() => Number)
  priceOverride?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  @Type(() => Number)
  costPriceOverride?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(MAX_QUANTITY)
  @Type(() => Number)
  openingStock?: number
}

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
  @IsUUID()
  brandId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  modelId?: string

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

  @ApiPropertyOptional({
    type: [ProductAttributeSelectionDto],
    description:
      'Drives variant generation. When provided with at least one option, the ' +
      'API creates the Cartesian product of the selected options as variants.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeSelectionDto)
  attributeSelections?: ProductAttributeSelectionDto[]

  @ApiPropertyOptional({
    type: [VariantOverrideDto],
    description: 'Exclude combinations or override name/price/opening stock per variant.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantOverrideDto)
  variantOverrides?: VariantOverrideDto[]

  @ApiPropertyOptional({
    type: [CreateBundleComponentDto],
    description: 'Required for COMPOSITE products: the stocked products this bundle consumes.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBundleComponentDto)
  bundleComponents?: CreateBundleComponentDto[]

  @ApiPropertyOptional({ default: false, description: 'Track each unit by serial/IMEI (SIMPLE only).' })
  @IsOptional()
  @IsBoolean()
  isSerialized?: boolean

  @ApiPropertyOptional({ enum: SerialType, description: 'Required when isSerialized = true.' })
  @IsOptional()
  @IsEnum(SerialType)
  serialType?: SerialType

  @ApiPropertyOptional({ description: 'Warranty period in months, applied per unit at restock.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  warrantyMonths?: number
}
