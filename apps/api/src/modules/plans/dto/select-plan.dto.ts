import { ApiProperty } from '@nestjs/swagger'
import { IsEnum } from 'class-validator'
import { SubscriptionPlan } from '@biztrack/types'

export class SelectPlanDto {
  @ApiProperty({ enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan)
  plan!: SubscriptionPlan
}
