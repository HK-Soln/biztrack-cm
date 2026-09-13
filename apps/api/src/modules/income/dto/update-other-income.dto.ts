import { IsISO8601, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator'

/** Body for PATCH /income/:id — edit a manual other-income entry (all fields optional). */
export class UpdateOtherIncomeDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string

  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number

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
