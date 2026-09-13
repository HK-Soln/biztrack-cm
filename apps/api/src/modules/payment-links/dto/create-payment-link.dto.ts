import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'
import { PayableType, type CreatePaymentLinkRequest } from '@biztrack/types'

/** Body for POST /payment-links. Amount + currency are resolved server-side from the payable. */
export class CreatePaymentLinkDto implements CreatePaymentLinkRequest {
  @IsEnum(PayableType)
  payableType!: PayableType

  @IsUUID()
  payableId!: string

  @IsOptional()
  @IsISO8601()
  expiresAt?: string

  @IsOptional()
  @IsString()
  @MaxLength(140)
  label?: string
}
