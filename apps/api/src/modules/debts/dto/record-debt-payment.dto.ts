import { ApiProperty } from '@nestjs/swagger'
import { PaymentMethod, type RecordDebtPaymentRequest } from '@biztrack/types'
import { IsEnum, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

export class RecordDebtPaymentDto implements RecordDebtPaymentRequest {
  @ApiProperty({ example: 2500 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9_999_999_999)
  amount!: number

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod

  @ApiProperty({ example: '2026-04-29' })
  @Matches(DATE_ONLY_REGEX)
  paymentDate!: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mobileMoneyReference?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string
}
