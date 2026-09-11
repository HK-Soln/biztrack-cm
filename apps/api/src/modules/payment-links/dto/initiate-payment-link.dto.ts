import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator'
import { type InitiatePaymentLinkRequest } from '@biztrack/types'

/** Body for POST /public/pay/:token/initiate. `amountMinor` is honoured only for partial links and
 *  is capped server-side at the live balance. */
export class InitiatePaymentLinkDto implements InitiatePaymentLinkRequest {
  @IsString()
  method!: string

  @IsString()
  @MaxLength(100)
  clientReference!: string

  @IsOptional()
  @IsInt()
  @IsPositive()
  amountMinor?: number

  @IsOptional()
  @IsString()
  customerPhone?: string

  @IsOptional()
  @IsString()
  returnUrl?: string
}
