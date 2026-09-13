import { IsHexColor, IsOptional, IsString, MaxLength } from 'class-validator'

/** Body for POST /income/categories — a business-defined other-income category. */
export class CreateIncomeCategoryDto {
  @IsString()
  @MaxLength(100)
  name!: string

  @IsOptional()
  @IsHexColor()
  color?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string
}
