import { IsString, IsOptional, IsNumber, IsInt, IsBoolean, Min, MaxLength, IsUUID } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'

export class CreateProductDto {
  @ApiProperty({ example: 'Coca-Cola 50cl' })
  @IsString()
  @MaxLength(200)
  name!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiPropertyOptional({ example: 'COKE-50CL' })
  @IsOptional()
  @IsString()
  sku?: string

  @ApiPropertyOptional({ example: '5449000000996' })
  @IsOptional()
  @IsString()
  barcode?: string

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price!: number

  @ApiPropertyOptional({ example: 350 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  costPrice?: number

  @ApiPropertyOptional({ example: 100, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  stockQuantity?: number

  @ApiPropertyOptional({ example: 10, default: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  lowStockThreshold?: number

  @ApiPropertyOptional({ enum: ['piece', 'kg', 'litre', 'metre', 'box', 'dozen', 'pack'], default: 'piece' })
  @IsOptional()
  @IsString()
  unit?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
