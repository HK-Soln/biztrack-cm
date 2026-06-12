import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsNumber, IsString, Max, Min, MinLength } from 'class-validator'
import { StockAdjustmentType, type AdjustInventoryRequest } from '@biztrack/types'

export { StockAdjustmentType }

export class AdjustStockDto implements AdjustInventoryRequest {
  @ApiProperty({ enum: StockAdjustmentType })
  @IsEnum(StockAdjustmentType)
  type!: StockAdjustmentType

  @ApiProperty({ example: 5 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(9_999_999)
  @Type(() => Number)
  quantity!: number

  @ApiProperty({ example: 'Physical count correction' })
  @IsString()
  @MinLength(3)
  notes!: string
}
