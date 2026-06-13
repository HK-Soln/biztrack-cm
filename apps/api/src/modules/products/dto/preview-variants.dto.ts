import { Type } from 'class-transformer'
import { ArrayMinSize, IsArray, IsOptional, ValidateNested } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type { PreviewVariantsRequest } from '@biztrack/types'
import { ProductAttributeSelectionDto, VariantOverrideDto } from './create-product.dto'

export class PreviewVariantsDto implements PreviewVariantsRequest {
  @ApiProperty({ type: [ProductAttributeSelectionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeSelectionDto)
  attributeSelections!: ProductAttributeSelectionDto[]

  @ApiPropertyOptional({ type: [VariantOverrideDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantOverrideDto)
  variantOverrides?: VariantOverrideDto[]
}
