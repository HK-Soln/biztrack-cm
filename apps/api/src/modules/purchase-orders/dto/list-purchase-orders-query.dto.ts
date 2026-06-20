import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator'
import { PurchaseOrderStatus } from '@biztrack/types'
import type { PurchaseOrdersQuery, SortOrder } from '@biztrack/types'

export class ListPurchaseOrdersQueryDto implements PurchaseOrdersQuery {
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

  @ApiPropertyOptional({ enum: PurchaseOrderStatus })
  @IsOptional()
  @IsIn(Object.values(PurchaseOrderStatus))
  status?: PurchaseOrderStatus

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  rfqId?: string

  @ApiPropertyOptional({ enum: ['createdAt', 'number'] })
  @IsOptional()
  @IsIn(['createdAt', 'number'])
  sortBy?: string

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: SortOrder
}
