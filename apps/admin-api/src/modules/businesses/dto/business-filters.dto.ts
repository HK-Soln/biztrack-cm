import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class BusinessFiltersDto {
  @IsOptional()
  @IsString()
  status?: string // subscription status: TRIAL | ACTIVE | PAST_DUE | CANCELLED | SUSPENDED

  @IsOptional()
  @IsString()
  plan?: string // FREE | SOLO | BUSINESS | PRO

  @IsOptional()
  @IsString()
  city?: string

  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}
