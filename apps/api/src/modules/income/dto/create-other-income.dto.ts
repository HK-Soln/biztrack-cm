import { IsISO8601, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator'
import { type CreateOtherIncomeRequest } from '@biztrack/types'

/** Body for POST /income — a manual other-income entry. Amount in major units (XAF). */
export class CreateOtherIncomeDto implements CreateOtherIncomeRequest {
  @IsUUID()
  categoryId!: string

  @IsString()
  @MaxLength(300)
  description!: string

  @IsNumber()
  @IsPositive()
  amount!: number

  @IsOptional()
  @IsString()
  @MaxLength(50)
  paymentMethod?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string

  @IsOptional()
  @IsISO8601()
  date?: string
}
