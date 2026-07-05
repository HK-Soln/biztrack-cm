import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator'
import type {
  AddCartItemRequest,
  CheckoutRequest,
  OnlineFulfillmentType,
  OnlineOrderStatus,
  OnlinePaymentStatus,
  UpdateCartItemRequest,
  UpdateOrderPaymentRequest,
  UpdateOrderStatusRequest,
} from '@biztrack/types'
import { ONLINE_PAYMENT_METHODS } from '@biztrack/types'

import type { PublicProductsQuery } from '@biztrack/types'

export class PublicProductsQueryDto implements PublicProductsQuery {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ default: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string
}

const FULFILLMENT_TYPES: OnlineFulfillmentType[] = ['DELIVERY', 'PICKUP']
const ORDER_STATUSES: OnlineOrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'READY_FOR_DISPATCH',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RETURNED',
  'CANCELLED',
]

export class AddCartItemDto implements AddCartItemRequest {
  @ApiPropertyOptional({ description: 'Existing cart session; a new one is created if omitted.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sessionToken?: string

  @ApiProperty()
  @IsUUID()
  productId!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  variantId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  serialUnitId?: string

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number
}

export class UpdateCartItemDto implements UpdateCartItemRequest {
  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number
}

export class CheckoutDto implements CheckoutRequest {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  customerName!: string

  @ApiProperty()
  @IsString()
  @MaxLength(30)
  customerPhone!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  customerEmail?: string

  @ApiPropertyOptional({ enum: FULFILLMENT_TYPES })
  @IsOptional()
  @IsIn(FULFILLMENT_TYPES)
  fulfillmentType?: OnlineFulfillmentType

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryAddress?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryCity?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryNotes?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  paymentMethod?: string
}

export class UpdateOrderStatusDto implements UpdateOrderStatusRequest {
  @ApiProperty({ enum: ORDER_STATUSES })
  @IsIn(ORDER_STATUSES)
  status!: OnlineOrderStatus

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalNote?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerMessage?: string
}

const PAYMENT_STATUSES: OnlinePaymentStatus[] = [
  'PENDING',
  'AUTHORIZED',
  'PAID',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
]

export class UpdateOrderPaymentDto implements UpdateOrderPaymentRequest {
  @ApiProperty({ enum: PAYMENT_STATUSES })
  @IsIn(PAYMENT_STATUSES)
  paymentStatus!: OnlinePaymentStatus

  @ApiPropertyOptional({ enum: ONLINE_PAYMENT_METHODS })
  @IsOptional()
  @IsIn(ONLINE_PAYMENT_METHODS)
  paymentMethod?: (typeof ONLINE_PAYMENT_METHODS)[number] | null
}
