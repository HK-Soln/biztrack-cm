import { IsIn, IsOptional } from 'class-validator'

export class PeriodDto {
  @IsOptional()
  @IsIn(['7d', '30d', '90d', '12m'])
  period?: '7d' | '30d' | '90d' | '12m'
}
