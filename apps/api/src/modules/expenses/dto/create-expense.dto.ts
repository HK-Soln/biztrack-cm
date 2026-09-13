import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator'
import type { CreateExpenseRequest } from '@biztrack/types'
import { ExpenseStatus, PaymentMethod } from '@biztrack/types'

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

  // "Paid to" is required (a payee must be recorded). The sync path (createFromSync) doesn't use this
  // DTO, so already-synced legacy expenses without a payee are unaffected.
  @ApiProperty({ example: 'ENEO Cameroun' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  vendor!: string

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

  @ApiPropertyOptional({ enum: ExpenseStatus, default: ExpenseStatus.PAID })
  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  receiptUrl?: string
}
