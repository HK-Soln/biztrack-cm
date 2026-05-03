import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator'
import type { CreateExpenseRequest } from '@biztrack/types'
import { PaymentMethod } from '@biztrack/types'

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

export class CreateExpenseDto implements CreateExpenseRequest {
  @ApiProperty()
  @IsUUID()
  categoryId!: string

  @ApiProperty({ example: 'Facture ENEO Avril' })
  @IsString()
  @MaxLength(300)
  description!: string

  @ApiProperty({ example: 18500 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number

  @ApiProperty({ example: '2026-04-25' })
  @Matches(DATE_ONLY_REGEX)
  expenseDate!: string

  @ApiPropertyOptional({ example: 'ENEO Cameroun' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  vendor?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  receiptUrl?: string
}
