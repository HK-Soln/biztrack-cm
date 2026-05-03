import { ApiProperty } from '@nestjs/swagger'
import { PaymentMethod, type RecordDebtPaymentRequest } from '@biztrack/types'
import { IsEnum, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator'

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

export class RecordDebtPaymentDto implements RecordDebtPaymentRequest {
  @ApiProperty({ example: 2500 })
  @IsNumber()
  @Min(0.01)
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
