import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
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

  // Up to three decimals, so part of a weighed line can be returned (0.5 kg of 2 kg).
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
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
