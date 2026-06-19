import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayUnique, IsArray, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator'
import type { CreateBrandRequest } from '@biztrack/types'

export class CreateBrandDto implements CreateBrandRequest {
  @ApiProperty({ example: 'Samsung' })
  @IsString()
  @MaxLength(120)
  name!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number

  @ApiPropertyOptional({ type: [String], description: 'Category ids to link (M2M).' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  categoryIds?: string[]
}
