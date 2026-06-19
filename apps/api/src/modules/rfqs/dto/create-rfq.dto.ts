import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator'
import type { CreateRfqItemRequest, CreateRfqRequest } from '@biztrack/types'

export class CreateRfqItemDto implements CreateRfqItemRequest {
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
}

export class CreateRfqDto implements CreateRfqRequest {
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
  @IsString()
  @MaxLength(8)
  currency?: string

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  supplierIds!: string[]

  @ApiProperty({ type: [CreateRfqItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRfqItemDto)
  items!: CreateRfqItemDto[]
}
