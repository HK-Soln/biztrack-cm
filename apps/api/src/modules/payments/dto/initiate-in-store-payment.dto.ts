import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator'
import { PaymentMethod, type InitiateInStorePaymentRequest } from '@biztrack/types'

/** Body for POST /payments/in-store/initiate — start a provider payment at the till (§7). */
export class InitiateInStorePaymentDto implements InitiateInStorePaymentRequest {
  @IsEnum(PaymentMethod)
  method!: PaymentMethod

  /** Amount in MAJOR units of the currency (e.g. whole XAF). */
  @IsNumber()
  @IsPositive()
  amount!: number

  @IsOptional()
  @IsString()
  currency?: string

  /** Required for a USSD push (MoMo) — the number that receives the prompt. */
  @IsOptional()
  @IsString()
  customerPhone?: string

  /** The open shift the attempt belongs to during the pending window (§7.4). */
  @IsOptional()
  @IsString()
  cashSessionId?: string

  /** Client-generated idempotency key — a double-submit returns the same attempt. */
  @IsString()
  @MaxLength(100)
  clientReference!: string

  /** Human label shown provider-side (falls back to a generic in-store label). */
  @IsOptional()
  @IsString()
  @MaxLength(140)
  reference?: string
}
