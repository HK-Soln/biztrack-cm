import { IsInt, IsISO8601, IsObject, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator'
import { type CreateSaleDraftLinkRequest } from '@biztrack/types'

/** Body for POST /payment-links/sale-draft. `sale` is the CreateSale DTO (without payments) to
 *  materialize once the amount is collected; it's validated at sale-creation time. */
export class CreateSaleDraftLinkDto implements CreateSaleDraftLinkRequest {
  @IsObject()
  sale!: Record<string, unknown>

  @IsInt()
  @IsPositive()
  amountMinor!: number

  @IsOptional()
  @IsString()
  @MaxLength(140)
  label?: string

  @IsOptional()
  @IsISO8601()
  expiresAt?: string
}
