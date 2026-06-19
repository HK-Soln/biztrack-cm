import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsISO8601, IsObject, IsOptional, IsUUID } from 'class-validator'
import type { ConvertRfqToPoRequest } from '@biztrack/types'

export class ConvertRfqToPoDto implements ConvertRfqToPoRequest {
  @ApiProperty()
  @IsUUID()
  rfqSupplierId!: string

  @ApiProperty({ description: 'Per-item unit prices keyed by RFQ item id.' })
  @IsObject()
  unitPrices!: Record<string, number>

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  expectedDate?: string
}
