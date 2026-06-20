import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMinSize, IsArray, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator'
import type { ConvertRfqToPoItem, ConvertRfqToPoRequest } from '@biztrack/types'

export class ConvertRfqToPoItemDto implements ConvertRfqToPoItem {
  @ApiProperty()
  @IsUUID()
  productId!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  variantId?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  quantity!: number

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitPrice!: number
}

export class ConvertRfqToPoDto implements ConvertRfqToPoRequest {
  @ApiProperty()
  @IsUUID()
  rfqSupplierId!: string

  @ApiProperty({ type: [ConvertRfqToPoItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConvertRfqToPoItemDto)
  items!: ConvertRfqToPoItemDto[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  messageBody?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  expectedDate?: string
}
