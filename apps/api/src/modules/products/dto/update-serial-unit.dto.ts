import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import type { UpdateSerialUnitRequest } from '@biztrack/types'

/** Edit a unit's catalog info — serial number and, in unique-item mode, its own
 * description / image / SEO. No quantity change → no stock movement. */
export class UpdateSerialUnitDto implements UpdateSerialUnitRequest {
  @ApiPropertyOptional({ example: '356938035643809' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  serialNumber?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imageUrl?: string | null

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
}
