import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator'
import {
  PaymentMethod,
  ROUTABLE_PAYMENT_METHODS,
  type SetPaymentRouteRequest,
} from '@biztrack/types'

/** Route a payment method to a verified provider connection (one provider per method). */
export class SetRouteDto implements SetPaymentRouteRequest {
  @ApiProperty({ enum: ROUTABLE_PAYMENT_METHODS })
  @IsIn(ROUTABLE_PAYMENT_METHODS)
  paymentMethod!: PaymentMethod

  @ApiProperty({ description: 'An ACTIVE, verified provider connection id.' })
  @IsUUID()
  providerId!: string

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean
}
