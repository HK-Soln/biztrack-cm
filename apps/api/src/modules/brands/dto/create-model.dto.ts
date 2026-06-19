import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import type { CreateModelRequest } from '@biztrack/types'

export class CreateModelDto implements CreateModelRequest {
  @ApiProperty({ example: 'Galaxy S24' })
  @IsString()
  @MaxLength(120)
  name!: string

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number
}
