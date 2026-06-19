import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator'
import { RfqStatus } from '@biztrack/types'
import type { RfqsQuery, SortOrder } from '@biztrack/types'

export class ListRfqsQueryDto implements RfqsQuery {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string

  @ApiPropertyOptional({ enum: RfqStatus })
  @IsOptional()
  @IsIn(Object.values(RfqStatus))
  status?: RfqStatus

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string

  @ApiPropertyOptional({ enum: ['createdAt', 'number'] })
  @IsOptional()
  @IsIn(['createdAt', 'number'])
  sortBy?: string

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: SortOrder
}
