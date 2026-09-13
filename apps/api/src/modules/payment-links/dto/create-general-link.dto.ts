import { IsInt, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator'
import { type CreateGeneralLinkRequest } from '@biztrack/types'

/** Body for POST /payment-links/general — a standalone link booked as other income on settlement.
 *  `amountMinor` 0 = open (the payer chooses); > 0 = a fixed amount (partial-capable). */
export class CreateGeneralLinkDto implements CreateGeneralLinkRequest {
  @IsInt()
  @Min(0)
  amountMinor!: number

  @IsString()
  @MaxLength(140)
  label!: string

  @IsUUID()
  incomeCategoryId!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string

  @IsOptional()
  @IsISO8601()
  expiresAt?: string
}
