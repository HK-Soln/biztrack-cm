import { IsIn, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator'

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsIn(['FREE', 'SOLO', 'BUSINESS', 'PRO'])
  plan?: string

  @IsOptional()
  @IsIn(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'SUSPENDED'])
  subscriptionStatus?: string

  @IsOptional()
  @IsISO8601()
  trialEndsAt?: string

  @IsString()
  @MinLength(3)
  reason!: string
}
