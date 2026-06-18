import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator'
import { SerialUnitStatus } from '@biztrack/types'
import type { SerialUnitsQuery } from '@biztrack/types'

export class ListSerialUnitsQueryDto implements SerialUnitsQuery {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number

  @ApiPropertyOptional({ enum: SerialUnitStatus })
  @IsOptional()
  @IsEnum(SerialUnitStatus)
  status?: SerialUnitStatus

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  variantId?: string
}
