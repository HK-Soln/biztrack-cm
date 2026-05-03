import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator'
import type { CreateExpenseCategoryRequest } from '@biztrack/types'

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/

export class CreateExpenseCategoryDto implements CreateExpenseCategoryRequest {
  @ApiProperty({ example: 'Publicite' })
  @IsString()
  @MaxLength(100)
  name!: string

  @ApiProperty({ example: '#D4537E' })
  @IsString()
  @Matches(HEX_COLOR_REGEX)
  color!: string

  @ApiPropertyOptional({ example: 'megaphone' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number
}
