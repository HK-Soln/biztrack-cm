import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import type { RefundSaleInput } from '@biztrack/types'

class RefundSaleItemDto {
  @IsUUID()
  saleItemId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number

  @IsOptional()
  @IsUUID()
  serialUnitId?: string | null
}

/** A full or partial return/refund of a completed sale (BIZ-1.8). */
export class RefundSaleDto implements RefundSaleInput {
  @ApiPropertyOptional({ description: 'Money to return; defaults to the returned goods value.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount?: number

  @ApiPropertyOptional({
    type: [RefundSaleItemDto],
    description: 'Returned lines; omit for a full return.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RefundSaleItemDto)
  items?: RefundSaleItemDto[]

  @ApiPropertyOptional({ description: 'Restore inventory + release serial units (default true).' })
  @IsOptional()
  @IsBoolean()
  restock?: boolean

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string
}
