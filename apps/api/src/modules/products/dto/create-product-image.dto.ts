import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator'
import type { CreateProductImageRequest } from '@biztrack/types'

export class CreateProductImageDto implements CreateProductImageRequest {
  @ApiProperty({ example: 'https://cdn.example.com/products/coke-1.png' })
  @IsString()
  @MaxLength(500)
  url!: string

  @ApiPropertyOptional({ example: 'Front view of Coca-Cola bottle' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  altText?: string

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number

  @ApiPropertyOptional({ description: 'Attach to a variant; omit for a product-level image.' })
  @IsOptional()
  @IsUUID()
  variantId?: string | null
}
