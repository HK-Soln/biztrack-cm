import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional } from 'class-validator'
import type { UpdateBrandRequest } from '@biztrack/types'
import { CreateBrandDto } from './create-brand.dto'
import { PartialType } from '@nestjs/swagger'

export class UpdateBrandDto extends PartialType(CreateBrandDto) implements UpdateBrandRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
