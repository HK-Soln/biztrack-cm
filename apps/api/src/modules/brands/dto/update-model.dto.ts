import { ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { IsBoolean, IsOptional } from 'class-validator'
import type { UpdateModelRequest } from '@biztrack/types'
import { CreateModelDto } from './create-model.dto'

export class UpdateModelDto extends PartialType(CreateModelDto) implements UpdateModelRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
