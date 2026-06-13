import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator'
import type {
  CreateAttributeOptionRequest,
  UpdateAttributeOptionRequest,
} from '@biztrack/types'

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

export class CreateAttributeOptionDto implements CreateAttributeOptionRequest {
  @ApiProperty({ example: '128GB' })
  @IsString()
  @MaxLength(100)
  value!: string

  @ApiPropertyOptional({ example: '#1A1A1A', description: 'Only meaningful for SWATCHES groups.' })
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'colorHex must be a 6-digit hex colour, e.g. #1A1A1A' })
  colorHex?: string

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number
}

export class UpdateAttributeOptionDto
  extends PartialType(CreateAttributeOptionDto)
  implements UpdateAttributeOptionRequest
{
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
