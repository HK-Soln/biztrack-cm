import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class SubscriptionFiltersDto {
  @IsOptional()
  @IsString()
  status?: string // TRIAL | ACTIVE | PAST_DUE | CANCELLED | SUSPENDED

  @IsOptional()
  @IsString()
  plan?: string

  @IsOptional()
  @IsIn(['7d', '14d'])
  expiringWithin?: '7d' | '14d'

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
